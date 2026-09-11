import { readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { PDFDocument, PDFName, PDFDict, PDFArray, PDFHexString, PDFNumber, PDFRef } from 'pdf-lib';
import type { ExportJob, ExportProgress, ExportResult } from '@shared/ipc-types';

function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() || 'Stimme';
}

async function uniquePath(dir: string, base: string): Promise<string> {
  let candidate = join(dir, `${base}.pdf`);
  for (let i = 2; ; i++) {
    try {
      await access(candidate);
      candidate = join(dir, `${base} (${i}).pdf`);
    } catch {
      return candidate;
    }
  }
}

interface OutlineItem {
  title: string;
  pageIndex: number;
}

/** Baut eine flache Lesezeichen-Struktur (pdf-lib hat keine Outline-API). */
function addOutline(doc: PDFDocument, items: OutlineItem[]): void {
  if (!items.length) return;
  const ctx = doc.context;
  const pages = doc.getPages();
  const outlinesRef = ctx.nextRef();
  const itemRefs = items.map(() => ctx.nextRef());

  items.forEach((item, i) => {
    const pageRef = pages[item.pageIndex].ref;
    const dest = ctx.obj([pageRef, PDFName.of('Fit')]);
    const dict = ctx.obj({
      Title: PDFHexString.fromText(item.title),
      Parent: outlinesRef,
      Dest: dest,
    }) as PDFDict;
    if (i > 0) dict.set(PDFName.of('Prev'), itemRefs[i - 1]);
    if (i < items.length - 1) dict.set(PDFName.of('Next'), itemRefs[i + 1]);
    ctx.assign(itemRefs[i], dict);
  });

  const outlines = ctx.obj({
    Type: PDFName.of('Outlines'),
    First: itemRefs[0],
    Last: itemRefs[itemRefs.length - 1],
    Count: PDFNumber.of(items.length),
  }) as PDFDict;
  ctx.assign(outlinesRef, outlines);
  doc.catalog.set(PDFName.of('Outlines'), outlinesRef);
  doc.catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines'));
}

export async function runExport(
  outputDir: string,
  jobs: ExportJob[],
  onProgress: (p: ExportProgress) => void,
): Promise<ExportResult[]> {
  const results: ExportResult[] = [];
  const totalPieces = jobs.reduce((n, j) => n + j.pieces.length, 0);
  let done = 0;
  const sourceCache = new Map<string, PDFDocument>();

  for (let jobIndex = 0; jobIndex < jobs.length; jobIndex++) {
    const job = jobs[jobIndex];
    const out = await PDFDocument.create();
    out.setTitle(job.fileName);
    out.setProducer('Notenwart');
    const outline: OutlineItem[] = [];
    let pageCount = 0;
    let pieceCount = 0;

    for (let pieceIndex = 0; pieceIndex < job.pieces.length; pieceIndex++) {
      const piece = job.pieces[pieceIndex];
      onProgress({ jobIndex, pieceIndex, totalPieces, message: `${job.fileName}: ${piece.title}` });
      if (!piece.pages.length) { done++; continue; }
      let src = sourceCache.get(piece.path);
      if (!src) {
        const bytes = await readFile(piece.path);
        src = await PDFDocument.load(bytes, { ignoreEncryption: true, throwOnInvalidObject: false });
        sourceCache.set(piece.path, src);
      }
      const indices = piece.pages.map((p) => p - 1).filter((i) => i >= 0 && i < src!.getPageCount());
      if (!indices.length) { done++; continue; }
      const copied = await out.copyPages(src, indices);
      outline.push({ title: piece.title, pageIndex: out.getPageCount() });
      for (const pg of copied) out.addPage(pg);
      pageCount += copied.length;
      pieceCount++;
      done++;
    }

    addOutline(out, outline);
    const outputPath = await uniquePath(outputDir, sanitizeFileName(job.fileName));
    const bytes = await out.save({ useObjectStreams: true });
    await writeFile(outputPath, bytes);
    results.push({ fileName: job.fileName, outputPath, pieceCount, pageCount });
  }
  void done;
  return results;
}

// Unbenutzte Importe vermeiden, die für spätere Erweiterungen (verschachtelte Outline) nützlich sind
void PDFArray; void PDFRef;
