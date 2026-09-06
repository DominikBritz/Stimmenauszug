import { formatPart } from '@shared/instruments';
import { parseQuery } from '@shared/matcher';
import type { FileInfo } from '@shared/ipc-types';
import type { Settings } from '@shared/settings';
import { analyzeFile } from './analysis/pipeline';
import { selectForQuery, type AnalyzedFile } from './analysis/select';

interface AutorunConfig {
  paths: string[];
  out: string | null;
  query: string | null;
  force: boolean;
  limit: number;
  screenshot: string | null;
  exportDir: string | null;
}

export interface AutorunUiState {
  files: FileInfo[];
  queries: string[];
  entries: AnalyzedFile[];
  screenshot: string;
}

/** Läuft nur, wenn die App mit SE_AUTORUN gestartet wurde. Liefert false ohne Autorun, true nach Abschluss,
 * oder einen UI-Zustand, wenn per SE_SCREENSHOT die Kontrollansicht fotografiert werden soll. */
export async function maybeAutorun(): Promise<boolean | AutorunUiState> {
  const cfg = (await window.api.invoke('autorun:config')) as AutorunConfig | null;
  if (!cfg) return false;
  if (!cfg.paths.length && cfg.screenshot) {
    // nur Startbildschirm fotografieren
    setTimeout(async () => {
      await window.api.invoke('autorun:screenshot', cfg.screenshot);
      await window.api.invoke('autorun:done', null, null);
    }, 1500);
    return false;
  }
  const log = (m: string) => window.api.log(m);
  const settings = (await window.api.invoke('settings:get')) as Settings;
  const cpus = Number(await window.api.invoke('system:cpus'));
  const workers = settings.workers > 0 ? settings.workers : Math.max(1, Math.min(8, cpus - 1));
  let files = (await window.api.invoke('files:scan', cfg.paths)) as FileInfo[];
  if (cfg.limit) files = files.slice(0, cfg.limit);
  log(`Autorun: ${files.length} Dateien, ${workers} Worker`);
  const dump = !!(await window.api.invoke('autorun:dumpEnabled'));
  const t0 = performance.now();
  const results: AnalyzedFile[] = [];
  const report: unknown[] = [];
  for (const info of files) {
    const ts = performance.now();
    try {
      const analysis = await analyzeFile(info, {
        settings,
        workers,
        force: cfg.force,
        dump,
        signal: new AbortController().signal,
        onProgress: () => {},
      });
      results.push({ info, analysis });
      const secs = ((performance.now() - ts) / 1000).toFixed(1);
      const summary = analysis.assignments.map((a) => `${a.page}:${a.kind === 'partitur' ? 'PART' : a.part ? formatPart(a.part) : a.kind}${a.source === 'fortsetzung' ? '↓' : a.source === 'text' ? '·t' : a.source === 'ki' ? '·ki' : a.source === 'dateiname' ? '·fn' : ''}`);
      log(`${info.name} (${analysis.pageCount} S., ${secs}s): ${summary.join(' | ')}`);
      report.push({
        file: info.path,
        pages: analysis.pageCount,
        seconds: Number(secs),
        filenamePart: analysis.filenamePart ? formatPart(analysis.filenamePart) : null,
        assignments: analysis.assignments.map((a) => ({ page: a.page, kind: a.kind, part: a.part ? formatPart(a.part) : null, source: a.source, confidence: Math.round(a.confidence * 100) / 100 })),
        texts: analysis.pages.map((p) => p.text.replace(/\s+/g, ' ').slice(0, 600)),
        candidates: analysis.pages.map((p) => p.candidates.map((c) => `${c.instrument}[${c.matchedText}]${c.numbers.join('/')}${c.key ?? ''}@${c.confidence.toFixed(2)}`).join(' ')),
      });
    } catch (e) {
      log(`${info.name}: FEHLER ${e instanceof Error ? e.message : String(e)}`);
      report.push({ file: info.path, error: String(e) });
    }
  }
  const total = ((performance.now() - t0) / 1000).toFixed(1);
  let selection: unknown = null;
  if (cfg.query) {
    const q = parseQuery(cfg.query);
    if (q) {
      const hits = selectForQuery(results, q, { includeUnnumbered: settings.includeUnnumbered });
      selection = hits.map((h) => ({ file: h.file.info.name, pages: h.pages, uncertain: h.uncertain, labels: h.labels }));
      log(`Treffer für ${formatPart(q)}: ${hits.length} Dateien`);
      for (const h of hits) log(`  ${h.file.info.name}: S. ${h.pages.join(',')} ${h.uncertain ? '(unsicher)' : ''}`);
      if (cfg.exportDir) {
        const jobs = [{ fileName: formatPart(q), pieces: hits.map((h) => ({ path: h.file.info.path, title: h.file.info.name.replace(/\.pdf$/i, ''), pages: h.pages })) }];
        const res = (await window.api.invoke('export:run', { outputDir: cfg.exportDir, jobs })) as { outputPath: string; pieceCount: number; pageCount: number }[];
        for (const r of res) log(`Export: ${r.outputPath} (${r.pieceCount} Stücke, ${r.pageCount} Seiten)`);
      }
    }
  }
  log(`Gesamt ${total}s`);
  if (cfg.screenshot) {
    return { files, queries: cfg.query ? cfg.query.split(';') : ['Trompete 1'], entries: results, screenshot: cfg.screenshot };
  }
  await window.api.invoke('autorun:done', cfg.out, { totalSeconds: Number(total), files: report, selection });
  return true;
}
