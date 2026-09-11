import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findExisting, runExport } from '../src/main/exporter';

let dir: string;
let src: string;

async function pageCount(p: string): Promise<number> {
  const { readFile } = await import('node:fs/promises');
  return (await PDFDocument.load(await readFile(p))).getPageCount();
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'notenwart-export-'));
  const doc = await PDFDocument.create();
  for (let i = 0; i < 4; i++) doc.addPage([200, 300]).drawText(`Seite ${i + 1}`);
  src = join(dir, 'Stück.pdf');
  await writeFile(src, await doc.save());
});
afterAll(() => rm(dir, { recursive: true, force: true }));

describe('runExport', () => {
  it('ohne subdir und ohne overwrite: Datei im Zielordner, zweiter Lauf hängt "(2)" an', async () => {
    const out = join(dir, 'suchen');
    const jobs = [{ fileName: 'Trompete 1', pieces: [{ path: src, title: 'Stück', pages: [1, 2] }] }];
    const r1 = await runExport(out, jobs, () => {});
    expect(r1[0].outputPath).toBe(join(out, 'Trompete 1.pdf'));
    expect(await pageCount(r1[0].outputPath)).toBe(2);
    const r2 = await runExport(out, jobs, () => {});
    expect(r2[0].outputPath).toBe(join(out, 'Trompete 1 (2).pdf'));
  });

  it('mit subdir und overwrite: Unterordner werden angelegt, zweiter Lauf ersetzt die Datei', async () => {
    const out = join(dir, 'aufteilen');
    const jobs = [
      { fileName: 'Trompete 1 in B', subdir: 'Archiv/Stück', pieces: [{ path: src, title: 'Stück', pages: [1, 2, 3] }] },
      { fileName: 'Partitur', subdir: 'Archiv/Stück', pieces: [{ path: src, title: 'Stück', pages: [4] }] },
    ];
    expect((await findExisting(out, jobs)).count).toBe(0);
    const progress: number[] = [];
    const r1 = await runExport(out, jobs, (p) => progress.push(p.done), { overwrite: true });
    expect(r1.map((r) => r.outputPath)).toEqual([join(out, 'Archiv', 'Stück', 'Trompete 1 in B.pdf'), join(out, 'Archiv', 'Stück', 'Partitur.pdf')]);
    expect(progress[progress.length - 1]).toBe(2);
    expect(await pageCount(r1[0].outputPath)).toBe(3);
    expect((await findExisting(out, jobs)).count).toBe(2);
    await runExport(out, jobs, () => {}, { overwrite: true });
    expect((await readdir(join(out, 'Archiv', 'Stück'))).sort()).toEqual(['Partitur.pdf', 'Trompete 1 in B.pdf']);
  });

  it('overwrite verweigert Zieldateien, die Quelldateien sind oder doppelt vorkommen', async () => {
    const jobs = [{ fileName: 'Stück', pieces: [{ path: src, title: 'Stück', pages: [1] }] }];
    await expect(runExport(dir, jobs, () => {}, { overwrite: true })).rejects.toThrow(/Quelldatei/);
    const dup = [
      { fileName: 'A', subdir: 'x', pieces: [{ path: src, title: 'Stück', pages: [1] }] },
      { fileName: 'A', subdir: 'x', pieces: [{ path: src, title: 'Stück', pages: [2] }] },
    ];
    await expect(runExport(join(dir, 'dup'), dup, () => {}, { overwrite: true })).rejects.toThrow(/derselben Zieldatei/);
  });
});
