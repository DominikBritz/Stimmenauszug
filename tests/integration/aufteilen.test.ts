import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PDFDocument } from 'pdf-lib';

/**
 * Aufteilen-Modus über dieselbe Stichprobe wie stichprobe.test.ts: prüft Buckets, Ordnerstruktur,
 * übersprungene Einzelstimme und dass ein zweiter Export überschreibt statt zu nummerieren.
 * Nutzt den Cache aus dem ersten Test (kein SE_FORCE). Vorher: npm run build.
 */
const NOTEN_DIR = process.env.NOTEN_DIR;
const SAMPLE = [
  'Lordis 7er/Brass Mood.pdf',
  'Chianti Lied/Stimmen.pdf',
  'Lordis 7er/Böhmischer Traum.pdf',
  'Lordis 7er/Radetzky Marsch.pdf',
  'Lordis 7er/Kaiserin Sissi Tenor.pdf',
  'Lordis 7er/Polka für Trompete.pdf',
];

interface SplitReport {
  split: { file: string; subdir: string | null; skipped: string | null; buckets: { label: string; kind: string; pages: number[]; warnings: string[] }[] }[];
  export: { outputPath: string; pageCount: number }[];
}

async function pageCount(p: string): Promise<number> {
  return (await PDFDocument.load(readFileSync(p))).getPageCount();
}

describe.skipIf(!NOTEN_DIR)('Aufteilen der Stichprobe', () => {
  it('teilt jedes Stück in einen Ordner mit einer PDF pro Stimme', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nw-aufteilen-'));
    const input = join(dir, 'noten');
    const out = join(dir, 'out');
    require('node:fs').mkdirSync(input);
    for (const rel of SAMPLE) {
      const src = join(NOTEN_DIR!, rel);
      if (existsSync(src)) symlinkSync(src, join(input, rel.split('/').pop()!));
    }
    const reportPath = join(dir, 'report.json');
    const electron = require('electron') as string;
    const run = () =>
      execFileSync(electron, [resolve('out/main/index.js')], {
        env: { ...process.env, SE_AUTORUN: input, SE_MODE: 'aufteilen', SE_OUT: reportPath, SE_EXPORT: out },
        stdio: 'ignore',
        timeout: 600_000,
      });
    run();
    const report = JSON.parse(readFileSync(reportPath, 'utf8')) as SplitReport;
    const byName = (n: string) => report.split.find((f) => f.file === n)!;
    const bucket = (n: string, label: string) => byName(n).buckets.find((b) => b.label === label);

    expect(byName('Stimmen.pdf').skipped).toBeNull();
    expect(bucket('Stimmen.pdf', 'Flöte 2')?.pages).toContain(2);
    expect(bucket('Stimmen.pdf', 'Trompete 1')?.pages).toContain(14);
    expect(bucket('Böhmischer Traum.pdf', 'Partitur')?.pages).toEqual(expect.arrayContaining([1, 2]));
    expect(bucket('Böhmischer Traum.pdf', 'Stimme 1 in B')?.pages).toContain(11);
    expect(byName('Kaiserin Sissi Tenor.pdf').skipped).toBe('einzelstimme');
    expect(existsSync(join(out, 'Kaiserin Sissi Tenor'))).toBe(false);

    const trp = join(out, 'Stimmen', 'Trompete 1.pdf');
    const part = join(out, 'Böhmischer Traum', 'Partitur.pdf');
    expect(existsSync(trp)).toBe(true);
    expect(existsSync(part)).toBe(true);
    expect(await pageCount(trp)).toBe(bucket('Stimmen.pdf', 'Trompete 1')!.pages.length);
    expect(await pageCount(part)).toBe(bucket('Böhmischer Traum.pdf', 'Partitur')!.pages.length);
    expect(report.export.find((e) => e.outputPath === trp)?.pageCount).toBe(await pageCount(trp));

    // zweiter Lauf überschreibt, statt "(2)" anzuhängen
    const before = readdirSync(join(out, 'Stimmen')).sort();
    run();
    const after = readdirSync(join(out, 'Stimmen')).sort();
    expect(after).toEqual(before);
    expect(after.some((f) => /\(2\)\.pdf$/.test(f))).toBe(false);
  });
});
