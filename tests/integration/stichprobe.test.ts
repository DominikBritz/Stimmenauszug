import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * Startet die gebaute App im Autorun-Modus über eine feste Stichprobe aus NOTEN_DIR
 * und prüft bekannte Zuordnungen. Vorher: npm run build.
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

interface Report {
  files: { file: string; assignments: { page: number; kind: string; part: string | null }[] }[];
  selection: { file: string; pages: number[] }[] | null;
}

describe.skipIf(!NOTEN_DIR)('Stichprobe aus echten Scans', () => {
  it('erkennt bekannte Stimmen und Partiturseiten', () => {
    const dir = mkdtempSync(join(tmpdir(), 'se-stichprobe-'));
    for (const rel of SAMPLE) {
      const src = join(NOTEN_DIR!, rel);
      if (existsSync(src)) symlinkSync(src, join(dir, rel.split('/').pop()!));
    }
    const out = join(dir, 'report.json');
    const electron = require('electron') as string;
    execFileSync(electron, [resolve('out/main/index.js')], {
      env: { ...process.env, SE_AUTORUN: dir, SE_OUT: out, SE_QUERY: 'Trompete 1', SE_FORCE: '1' },
      stdio: 'ignore',
      timeout: 600_000,
    });
    const report = JSON.parse(readFileSync(out, 'utf8')) as Report;
    const byName = (n: string) => report.files.find((f) => f.file.endsWith('/' + n))!;
    const part = (n: string, p: number) => byName(n).assignments[p - 1];

    expect(part('Brass Mood.pdf', 1)).toMatchObject({ kind: 'stimme', part: 'Schlagzeug' });
    expect(part('Brass Mood.pdf', 3)).toMatchObject({ kind: 'stimme', part: 'Trompete 2 in B' });
    expect(part('Böhmischer Traum.pdf', 1).kind).toBe('partitur');
    expect(part('Böhmischer Traum.pdf', 2).kind).toBe('partitur');
    expect(part('Böhmischer Traum.pdf', 11).part).toBe('Stimme 1 in B');
    expect(part('Radetzky Marsch.pdf', 1).kind).toBe('partitur');
    expect(part('Radetzky Marsch.pdf', 9).part).toBe('Trompete 1');
    expect(part('Stimmen.pdf', 2).part).toBe('Flöte 2');
    expect(part('Stimmen.pdf', 14).part).toBe('Trompete 1');
    expect(part('Kaiserin Sissi Tenor.pdf', 1).part).toMatch(/^Tenorhorn/);
    expect(part('Polka für Trompete.pdf', 19).part).toBe('Schlagzeug');

    const sel = report.selection!;
    expect(sel.find((s) => s.file === 'Brass Mood.pdf')?.pages).toEqual([2]);
    expect(sel.find((s) => s.file === 'Stimmen.pdf')?.pages).toEqual([14]);
    expect(sel.find((s) => s.file === 'Radetzky Marsch.pdf')?.pages).toEqual([9]);
  });
});
