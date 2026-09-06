import { assignPages } from '@shared/assign';
import { classifyText, looksLikeScore, type Classification } from '@shared/classify';
import { partFromFilename } from '@shared/filename';
import { parseQuery } from '@shared/matcher';
import type { AiClassifyRequest, AiClassifyResponse, FileInfo } from '@shared/ipc-types';
import type { Settings } from '@shared/settings';
import { SCHEMA_VERSION, type FileAnalysis, type PageAnalysis, type PageKind } from '@shared/types';
import { canvasToJpeg, fullTextLayer, HEADER_FRACTION, headerTextLayer, openPdf, renderPage, renderThumbnail, rotatedHeader } from './pdf';
import { ocr } from './ocr';

export interface PipelineProgress {
  file: FileInfo;
  page: number;
  pageCount: number;
  phase: 'lesen' | 'cache' | 'text' | 'ocr' | 'ki' | 'fertig';
}

export interface PipelineOptions {
  settings: Settings;
  workers: number;
  signal: AbortSignal;
  onProgress: (p: PipelineProgress) => void;
  /** Cache ignorieren und neu analysieren */
  force?: boolean;
  /** Debug: Kopfbereichs-Bilder über IPC ablegen */
  dump?: boolean;
}

const OCR_WIDTHS = [1200, 800, 1800];
const KIND_RANK: Record<PageKind, number> = { partitur: 3, stimme: 3, unsicher: 2, sonstiges: 1 };

function better(a: Classification | null, b: Classification): boolean {
  if (!a) return true;
  const ra = KIND_RANK[a.kind];
  const rb = KIND_RANK[b.kind];
  if (rb !== ra) return rb > ra;
  return b.confidence > a.confidence;
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException('Abgebrochen', 'AbortError');
}

async function pool<T>(items: T[], size: number, fn: (item: T, index: number) => Promise<void>): Promise<void> {
  let next = 0;
  const runners = Array.from({ length: Math.max(1, size) }, async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i], i);
    }
  });
  await Promise.all(runners);
}

function partFromAi(resp: AiClassifyResponse) {
  if (!resp.ok) return undefined;
  if (resp.isScore) return 'partitur' as const;
  const instrument = (resp.instrument ?? '').trim();
  if (!instrument) return undefined;
  const q = [instrument, resp.number ?? '', resp.key ? `in ${resp.key}` : ''].join(' ').trim();
  return parseQuery(q);
}

export async function analyzeFile(info: FileInfo, opts: PipelineOptions): Promise<FileAnalysis> {
  const { settings, signal, onProgress } = opts;
  const aliases = settings.aliases;
  const title = info.name.replace(/\.pdf$/i, '');
  const matchOpts = { aliases, title };
  throwIfAborted(signal);

  if (!opts.force) {
    onProgress({ file: info, page: 0, pageCount: 0, phase: 'cache' });
    const cached = (await window.api.invoke('cache:get', info)) as FileAnalysis | null;
    if (cached) {
      const pending = pagesNeedingAi(cached, settings.ai.mode);
      if (!pending.length) return cached;
      return aiOnlyPass(info, cached, pending, opts);
    }
  }

  onProgress({ file: info, page: 0, pageCount: 0, phase: 'lesen' });
  const data = (await window.api.invoke('files:read', info.path)) as ArrayBuffer;
  const doc = await openPdf(data);
  const pageCount = doc.numPages;
  const filenamePart = partFromFilename(info.name, { aliases });
  const pages: PageAnalysis[] = new Array(pageCount);
  const thumbnails: string[] = new Array(pageCount);
  const aiMode = settings.ai.mode;

  try {
    await pool(Array.from({ length: pageCount }, (_, i) => i + 1), opts.workers, async (pageNo) => {
      throwIfAborted(signal);
      const page = await doc.getPage(pageNo);
      thumbnails[pageNo - 1] = await renderThumbnail(page, 140);

      // 1) Textlayer
      onProgress({ file: info, page: pageNo, pageCount, phase: 'text' });
      let text = '';
      let source: PageAnalysis['source'] = 'text';
      let cls: Classification | null = null;
      let ocrWidth: number | undefined;
      try {
        text = await headerTextLayer(page);
      } catch {
        text = '';
      }
      if (text.replace(/\s/g, '').length >= 12) {
        const c = classifyText(text, matchOpts);
        if (c.kind === 'stimme' || c.kind === 'partitur') cls = c;
        // Kopf nur als Abkürzung gelesen (Trp. 1): ganze Seite auf Instrumentenliste prüfen (Partitur-Folgeseiten)
        if (cls && cls.kind === 'stimme' && cls.weak) {
          try {
            const full = await fullTextLayer(page);
            if (looksLikeScore(full, matchOpts)) cls = { kind: 'partitur', confidence: 0.7, candidates: cls.candidates };
          } catch { /* ignorieren */ }
        }
      }

      // 2) OCR in mehreren Auflösungen
      let headerCanvas: HTMLCanvasElement | null = null;
      if (!cls) {
        onProgress({ file: info, page: pageNo, pageCount, phase: 'ocr' });
        source = 'ocr';
        let bestText = '';
        for (const w of OCR_WIDTHS) {
          throwIfAborted(signal);
          const r = await renderPage(page, w, HEADER_FRACTION);
          if (!headerCanvas) headerCanvas = r.canvas;
          if (opts.dump) await window.api.invoke('autorun:dump', `${info.name.replace(/\.pdf$/i, '')}_p${pageNo}_${w}.jpg`, canvasToJpeg(r.canvas, 0.8));
          const o = await ocr(r.canvas, opts.workers);
          const c = classifyText(o.text, matchOpts);
          if (better(cls, c)) {
            cls = c;
            bestText = o.text;
            ocrWidth = w;
          }
          const cur: Classification = cls ?? c;
          if (cur.kind === 'partitur' || (cur.kind === 'stimme' && cur.confidence >= 0.8)) break;
        }
        // Quer eingescannte Blätter: Seite drehen und den Kopf der gedrehten Seite lesen
        if (!cls || cls.kind === 'sonstiges') {
          const full = await renderPage(page, 900, 1);
          for (const dir of ['cw', 'ccw'] as const) {
            throwIfAborted(signal);
            const rc = rotatedHeader(full.canvas, dir);
            const o = await ocr(rc, opts.workers);
            const c = classifyText(o.text, matchOpts);
            if (better(cls, c)) {
              cls = c;
              bestText = o.text;
              ocrWidth = 900;
              headerCanvas = rc;
            }
            if (cls && cls.kind !== 'sonstiges' && cls.confidence >= 0.8) break;
          }
        }
        text = bestText;
      }

      if (!cls) cls = { kind: 'sonstiges', confidence: 0, candidates: [] };
      const final: Classification = cls;

      // 3) KI-Fallback
      const needsAi = aiMode === 'immer' || (aiMode === 'unsicher' && (final.kind === 'unsicher' || final.kind === 'sonstiges'));
      if (needsAi) {
        onProgress({ file: info, page: pageNo, pageCount, phase: 'ki' });
        if (!headerCanvas) headerCanvas = (await renderPage(page, 1000, HEADER_FRACTION)).canvas;
        const req: AiClassifyRequest = { imageDataUrl: canvasToJpeg(headerCanvas, 0.75), ocrText: text };
        const resp = (await window.api.invoke('ai:classify', req)) as AiClassifyResponse;
        if (resp.ok) {
          const r = partFromAi(resp);
          if (r === 'partitur') {
            cls = { kind: 'partitur', confidence: 0.9, candidates: final.candidates };
          } else if (r) {
            cls = { kind: 'stimme', part: r, confidence: 0.9, candidates: final.candidates };
          } else {
            cls = { kind: 'sonstiges', confidence: 0.6, candidates: final.candidates };
          }
          source = 'ki';
          if (resp.headerText) text = resp.headerText + (text ? '\n' + text : '');
        }
      }

      const done: Classification = cls;
      pages[pageNo - 1] = {
        page: pageNo,
        kind: done.kind,
        part: done.part,
        alsoParts: done.alsoParts,
        confidence: done.confidence,
        candidates: done.candidates,
        text,
        source,
        ocrWidth,
        weak: done.weak,
      };
      page.cleanup();
    });
  } finally {
    await doc.loadingTask.destroy();
  }

  const analysis: FileAnalysis = {
    path: info.path,
    name: info.name,
    pageCount,
    pages,
    assignments: assignPages(pages, filenamePart),
    filenamePart,
    thumbnails,
    analyzedAt: new Date().toISOString(),
    schemaVersion: SCHEMA_VERSION,
  };
  await window.api.invoke('cache:set', info, analysis);
  onProgress({ file: info, page: pageCount, pageCount, phase: 'fertig' });
  return analysis;
}

/** Seiten, die der aktuelle KI-Modus noch prüfen würde, aber bisher nicht von der KI gesehen wurden. */
export function pagesNeedingAi(analysis: FileAnalysis, mode: Settings['ai']['mode']): number[] {
  if (mode === 'aus') return [];
  return analysis.pages
    .filter((p) => p.source !== 'ki' && p.source !== 'manuell')
    .filter((p) => mode === 'immer' || p.kind === 'unsicher' || p.kind === 'sonstiges')
    .map((p) => p.page);
}

/** Nur den KI-Schritt für einzelne Seiten nachholen; OCR-Ergebnisse bleiben erhalten. */
async function aiOnlyPass(info: FileInfo, cached: FileAnalysis, pending: number[], opts: PipelineOptions): Promise<FileAnalysis> {
  const { settings, signal, onProgress } = opts;
  const matchOpts = { aliases: settings.aliases, title: info.name.replace(/\.pdf$/i, '') };
  const data = (await window.api.invoke('files:read', info.path)) as ArrayBuffer;
  const doc = await openPdf(data);
  const pages = cached.pages.map((p) => ({ ...p }));
  let changed = false;
  try {
    await pool(pending, Math.max(1, Math.min(4, opts.workers)), async (pageNo) => {
      throwIfAborted(signal);
      onProgress({ file: info, page: pageNo, pageCount: cached.pageCount, phase: 'ki' });
      const page = await doc.getPage(pageNo);
      const header = (await renderPage(page, 1000, HEADER_FRACTION)).canvas;
      const req: AiClassifyRequest = { imageDataUrl: canvasToJpeg(header, 0.75), ocrText: pages[pageNo - 1].text };
      const resp = (await window.api.invoke('ai:classify', req)) as AiClassifyResponse;
      page.cleanup();
      if (!resp.ok) return;
      const r = partFromAi(resp);
      const prev = pages[pageNo - 1];
      const base = { candidates: prev.candidates, text: resp.headerText ? resp.headerText + (prev.text ? '\n' + prev.text : '') : prev.text };
      if (r === 'partitur') pages[pageNo - 1] = { ...prev, ...base, kind: 'partitur', part: undefined, alsoParts: undefined, confidence: 0.9, source: 'ki', weak: undefined };
      else if (r) pages[pageNo - 1] = { ...prev, ...base, kind: 'stimme', part: r, alsoParts: undefined, confidence: 0.9, source: 'ki', weak: undefined };
      else pages[pageNo - 1] = { ...prev, ...base, kind: 'sonstiges', part: undefined, alsoParts: undefined, confidence: 0.6, source: 'ki', weak: undefined };
      changed = true;
    });
  } finally {
    await doc.loadingTask.destroy();
  }
  // Auch ohne Änderung merken, dass die KI diese Seiten gesehen hat, damit sie nicht jedes Mal erneut angefragt werden
  void changed;
  const analysis: FileAnalysis = {
    ...cached,
    pages,
    assignments: assignPages(pages, cached.filenamePart),
    analyzedAt: new Date().toISOString(),
  };
  await window.api.invoke('cache:set', info, analysis);
  onProgress({ file: info, page: cached.pageCount, pageCount: cached.pageCount, phase: 'fertig' });
  return analysis;
}
