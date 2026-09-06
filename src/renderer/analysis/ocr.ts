import { createScheduler, createWorker, PSM, type Scheduler, type Worker } from 'tesseract.js';

let scheduler: Scheduler | null = null;
let workerCount = 0;
let starting: Promise<Scheduler> | null = null;

const BASE = new URL('/', document.baseURI).href; // http://localhost:5173/ oder app://-/

async function makeWorker(): Promise<Worker> {
  const worker = await createWorker('deu+eng', 1, {
    workerPath: BASE + 'tesseract/worker.min.js',
    corePath: BASE + 'tesseract/',
    langPath: BASE + 'tessdata/',
    workerBlobURL: false,
    cacheMethod: 'none',
    gzip: true,
    logger: () => {},
  });
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.SPARSE_TEXT,
    preserve_interword_spaces: '1',
  });
  return worker;
}

export async function getScheduler(workers: number): Promise<Scheduler> {
  const n = Math.max(1, Math.min(16, workers));
  if (scheduler && workerCount === n) return scheduler;
  if (starting) return starting;
  starting = (async () => {
    if (scheduler) await scheduler.terminate();
    const s = createScheduler();
    const ws = await Promise.all(Array.from({ length: n }, () => makeWorker()));
    for (const w of ws) s.addWorker(w);
    scheduler = s;
    workerCount = n;
    starting = null;
    return s;
  })();
  return starting;
}

export interface OcrResult {
  text: string;
  /** mittlere Wortkonfidenz 0..100 */
  confidence: number;
}

export async function ocr(canvas: HTMLCanvasElement, workers: number): Promise<OcrResult> {
  const s = await getScheduler(workers);
  const res = await s.addJob('recognize', canvas);
  const data = res.data;
  return { text: data.text ?? '', confidence: data.confidence ?? 0 };
}

export async function shutdownOcr(): Promise<void> {
  if (scheduler) {
    await scheduler.terminate();
    scheduler = null;
    workerCount = 0;
  }
}
