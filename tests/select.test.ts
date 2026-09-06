import { describe, expect, it } from 'vitest';
import { selectForQuery, type AnalyzedFile } from '../src/renderer/analysis/select';
import { parseQuery } from '../src/shared/matcher';
import type { PageAssignment, PartRef } from '../src/shared/types';

function file(name: string, pages: { part: PartRef; also?: PartRef[]; kind?: PageAssignment['kind'] }[]): AnalyzedFile {
  const assignments: PageAssignment[] = pages.map((p, i) => ({ page: i + 1, kind: p.kind ?? 'stimme', part: p.part, alsoParts: p.also, confidence: 1, source: 'ocr' }));
  return {
    info: { path: '/x/' + name, name, size: 0, mtimeMs: 0, folder: '' },
    analysis: { path: '/x/' + name, name, pageCount: pages.length, pages: [], assignments, thumbnails: [], analyzedAt: '', schemaVersion: 1 },
  };
}
const P = (instrument: string, numbers: number[] = [], key?: string): PartRef => ({ instrument, numbers, key });

describe('selectForQuery', () => {
  const f = file('Alles steht still.pdf', [
    { part: P('posaune', [2], 'C'), also: [P('bariton', [], 'C')] },
    { part: P('bariton', [], 'C') },
    { part: P('posaune', [2], 'B'), also: [P('bariton', [], 'B')] },
    { part: P('bariton', [], 'B') },
  ]);
  it('"Bariton in B" liefert nur die Bariton-in-B-Seite', () => {
    const hits = selectForQuery([f], parseQuery('Bariton in B')!, { includeUnnumbered: true });
    expect(hits[0].pages).toEqual([4]);
    expect(hits[0].uncertain).toBe(false);
  });
  it('"Bariton" ohne Stimmung liefert beide Bariton-Seiten, aber keine Posaunen', () => {
    const hits = selectForQuery([f], parseQuery('Bariton')!, { includeUnnumbered: true });
    expect(hits[0].pages).toEqual([2, 4]);
  });
  it('Zweitbezeichnung zählt, wenn es keine eigene Seite gibt', () => {
    const g = file('Rundel.pdf', [{ part: P('stimme', [4], 'C'), also: [P('bariton'), P('posaune', [2])] }]);
    expect(selectForQuery([g], parseQuery('Bariton')!, { includeUnnumbered: true })[0].pages).toEqual([1]);
    expect(selectForQuery([g], parseQuery('Posaune 2')!, { includeUnnumbered: true })[0].pages).toEqual([1]);
  });
  it('Seite ohne Stimmungsangabe bleibt bei Suche mit Stimmung nur, wenn keine passende Seite existiert', () => {
    const g = file('x.pdf', [{ part: P('bariton') }, { part: P('bariton', [], 'C') }]);
    const hits = selectForQuery([g], parseQuery('Bariton in B')!, { includeUnnumbered: true });
    expect(hits[0].pages).toEqual([1]);
    expect(hits[0].uncertain).toBe(true);
  });
});
