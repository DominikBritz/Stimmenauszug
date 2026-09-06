import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/** Anteil der Seitenhöhe, der als Kopfbereich gilt */
export const HEADER_FRACTION = 0.27;

const BASE = new URL('/', document.baseURI).href;

export async function openPdf(data: ArrayBuffer): Promise<PDFDocumentProxy> {
  return pdfjs.getDocument({
    data,
    // WASM-Decoder für CCITT/JBIG2 (Fax-Scans) und JPX müssen lokal mitgeliefert werden
    wasmUrl: BASE + 'pdfjs/wasm/',
    standardFontDataUrl: BASE + 'pdfjs/standard_fonts/',
  }).promise;
}

/** Text des Textlayers im oberen Seitenbereich, zeilenweise. */
export async function headerTextLayer(page: PDFPageProxy): Promise<string> {
  const viewport = page.getViewport({ scale: 1 });
  const limitY = viewport.height * (1 - HEADER_FRACTION); // PDF-Koordinaten: y wächst nach oben
  const content = await page.getTextContent();
  const items = content.items
    .filter((it): it is import('pdfjs-dist/types/src/display/api').TextItem => 'str' in it && 'transform' in it)
    .map((it) => {
      const [x, y] = viewport.convertToViewportPoint(it.transform[4], it.transform[5]);
      return { str: it.str, x, y: viewport.height - y, hasEOL: it.hasEOL };
    })
    .filter((it) => it.str.trim() && viewport.height - it.y <= viewport.height && it.y >= limitY);
  // in Zeilen bündeln (nach y gerundet), innerhalb der Zeile nach x
  items.sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: string[] = [];
  let lastY: number | null = null;
  let cur: string[] = [];
  for (const it of items) {
    if (lastY !== null && Math.abs(it.y - lastY) > 4) {
      lines.push(cur.join(' '));
      cur = [];
    }
    cur.push(it.str);
    lastY = it.y;
  }
  if (cur.length) lines.push(cur.join(' '));
  return lines.join('\n');
}

/** Gesamter Textlayer der Seite (für die Partitur-Erkennung). */
export async function fullTextLayer(page: PDFPageProxy): Promise<string> {
  const content = await page.getTextContent();
  const parts: string[] = [];
  for (const it of content.items) {
    if ('str' in it) {
      parts.push(it.str);
      if ((it as { hasEOL?: boolean }).hasEOL) parts.push('\n');
    }
  }
  return parts.join(' ');
}

export interface Rendered {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

/** Rendert die Seite auf eine Zielbreite und schneidet optional den oberen Bereich aus. */
export async function renderPage(page: PDFPageProxy, targetWidth: number, topFraction = 1): Promise<Rendered> {
  const base = page.getViewport({ scale: 1 });
  const scale = targetWidth / base.width;
  const viewport = page.getViewport({ scale });
  const fullH = Math.ceil(viewport.height);
  const cropH = Math.ceil(fullH * topFraction);
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = cropH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport, canvas } as unknown as Parameters<PDFPageProxy['render']>[0]).promise;
  return { canvas, width: canvas.width, height: canvas.height };
}

/** Dreht eine gerenderte Seite um 90° (cw) oder 270° (ccw) und liefert den oberen Bereich der gedrehten Seite. */
export function rotatedHeader(full: HTMLCanvasElement, direction: 'cw' | 'ccw', topFraction = HEADER_FRACTION): HTMLCanvasElement {
  const w = full.height; // gedrehte Breite
  const h = full.width;
  const cropH = Math.ceil(h * topFraction);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = cropH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, cropH);
  ctx.save();
  if (direction === 'cw') {
    ctx.translate(w, 0);
    ctx.rotate(Math.PI / 2);
  } else {
    ctx.translate(0, h);
    ctx.rotate(-Math.PI / 2);
  }
  ctx.drawImage(full, 0, 0);
  ctx.restore();
  return canvas;
}

export function canvasToJpeg(canvas: HTMLCanvasElement, quality = 0.7): string {
  return canvas.toDataURL('image/jpeg', quality);
}

/** Kleines Vorschaubild der ganzen Seite. */
export async function renderThumbnail(page: PDFPageProxy, width = 160): Promise<string> {
  const r = await renderPage(page, width, 1);
  return canvasToJpeg(r.canvas, 0.6);
}
