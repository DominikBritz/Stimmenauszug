import type { PDFDocumentProxy } from 'pdfjs-dist';
import { canvasToJpeg, openPdf, renderPage } from './pdf';

/** Hält wenige geöffnete PDFs für die Großansicht im Speicher. */
const docs = new Map<string, Promise<PDFDocumentProxy>>();
const images = new Map<string, string>();
const MAX_DOCS = 3;
const MAX_IMAGES = 24;

async function getDoc(path: string): Promise<PDFDocumentProxy> {
  let p = docs.get(path);
  if (!p) {
    p = (async () => {
      const data = (await window.api.invoke('files:read', path)) as ArrayBuffer;
      return openPdf(data);
    })();
    docs.set(path, p);
    if (docs.size > MAX_DOCS) {
      const [oldest, oldP] = docs.entries().next().value as [string, Promise<PDFDocumentProxy>];
      docs.delete(oldest);
      oldP.then((d) => d.loadingTask.destroy()).catch(() => {});
    }
  }
  return p;
}

/** Rendert eine Seite groß (JPEG-Data-URL) und cached das Ergebnis. */
export async function renderLarge(path: string, page: number, width = 1600): Promise<string> {
  const key = `${path}#${page}@${width}`;
  const cached = images.get(key);
  if (cached) return cached;
  const doc = await getDoc(path);
  const pg = await doc.getPage(page);
  const r = await renderPage(pg, width, 1);
  const url = canvasToJpeg(r.canvas, 0.85);
  pg.cleanup();
  images.set(key, url);
  if (images.size > MAX_IMAGES) images.delete(images.keys().next().value as string);
  return url;
}
