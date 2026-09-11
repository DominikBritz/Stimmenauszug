import { describe, expect, it } from 'vitest';
import { assignPages } from '../src/shared/assign';
import { isSinglePartFile, splitFile } from '../src/shared/split';
import type { PageAnalysis, PartRef } from '../src/shared/types';

const P = (instrument: string, numbers: number[] = [], key?: string): PartRef => ({ instrument, numbers, key });
const TRP1 = P('trompete', [1]);
const TRP2 = P('trompete', [2]);

type Spec = 'part' | 'sonst' | 'folge' | { part: PartRef; also?: PartRef[]; kind?: 'stimme' | 'unsicher' };

/** Baut Seiten und lässt assignPages die echten Folgeseiten berechnen. */
function pages(specs: Spec[]): PageAnalysis[] {
  return specs.map((s, i): PageAnalysis => {
    const base = { page: i + 1, confidence: 0.9, candidates: [], text: '', source: 'ocr' as const };
    if (s === 'part') return { ...base, kind: 'partitur' };
    if (s === 'sonst') return { ...base, kind: 'sonstiges' };
    if (s === 'folge') return { ...base, kind: 'sonstiges' }; // ohne Kopf: hängt an der letzten Überschrift
    return { ...base, kind: s.kind ?? 'stimme', part: s.part, alsoParts: s.also, confidence: s.kind === 'unsicher' ? 0.4 : 0.9 };
  });
}
function analysis(specs: Spec[], filenamePart?: PartRef) {
  const p = pages(specs);
  return { path: '/x/a.pdf', assignments: assignPages(p, filenamePart), filenamePart };
}
const labels = (r: ReturnType<typeof splitFile>) => r.buckets.map((b) => [b.label, b.pages] as const);

describe('splitFile', () => {
  it('zwei mehrseitige Stimmen ergeben zwei Buckets ohne Warnungen', () => {
    const r = splitFile(analysis([{ part: TRP1 }, 'folge', { part: TRP2 }, 'folge']));
    expect(labels(r)).toEqual([['Trompete 1', [1, 2]], ['Trompete 2', [3, 4]]]);
    expect(r.buckets.every((b) => b.warnings.length === 0 && b.sections.length === 1)).toBe(true);
    expect(r.skipped).toBeUndefined();
  });

  it('Partitur unterbricht: Partitur-Bucket zuerst, Stimme wird zusammengeführt mit "mehrfach"', () => {
    const r = splitFile(analysis(['part', 'part', { part: TRP1 }, 'folge', 'part', { part: TRP1 }, 'folge']));
    expect(labels(r)).toEqual([['Partitur', [1, 2, 5]], ['Trompete 1', [3, 4, 6, 7]]]);
    const trp = r.buckets[1];
    expect(trp.sections.map((s) => s.pages)).toEqual([[3, 4], [6, 7]]);
    expect(trp.warnings).toEqual(['mehrfach']);
    expect(r.buckets[0].kind).toBe('partitur');
    expect(r.buckets[0].warnings).toEqual([]);
  });

  it('nicht zusammenhängende Abschnitte ohne Partitur werden zusammengeführt', () => {
    const r = splitFile(analysis([{ part: TRP1 }, 'folge', { part: TRP2 }, { part: TRP1 }]));
    expect(labels(r)).toEqual([['Trompete 1', [1, 2, 4]], ['Trompete 2', [3]]]);
    expect(r.buckets[0].warnings).toEqual(['mehrfach']);
  });

  it('Zweitbezeichnungen: das Blatt landet in jeder genannten Stimme, eigene Kopfseite kommt dazu', () => {
    const r = splitFile(
      analysis([
        { part: TRP1 },
        'folge',
        'folge',
        'folge',
        { part: P('stimme', [4], 'C'), also: [P('bariton'), P('posaune', [2])] },
        'folge',
        { part: P('bariton') },
        { part: P('bariton', [], 'C') },
      ]),
    );
    expect(labels(r)).toEqual([
      ['Trompete 1', [1, 2, 3, 4]],
      ['Stimme 4 in C', [5, 6]],
      ['Bariton', [5, 6, 7]],
      ['Posaune 2', [5, 6]],
      ['Bariton in C', [8]],
    ]);
    expect(r.buckets[1].warnings).toEqual([]);
    expect(r.buckets[2].warnings).toEqual(['mehrfach', 'zweitbezeichnung']);
    expect(r.buckets[3].warnings).toEqual(['zweitbezeichnung']);
  });

  it('Seiten ohne Stimme landen zuletzt in "Sonstiges", nur wenn es welche gibt', () => {
    const r = splitFile(analysis(['sonst', { part: TRP1 }, 'folge', 'part', { part: P('horn'), kind: 'unsicher' }]));
    // Seite 5: unsicher nach Partitur, behält eigene Stimme (assign.ts) → eigener Bucket mit Warnung
    expect(labels(r)).toEqual([
      ['Trompete 1', [2, 3]],
      ['Partitur', [4]],
      ['Horn', [5]],
      ['Sonstiges', [1]],
    ]);
    expect(r.buckets[2].warnings).toEqual(['unsicher']);
    const ohne = splitFile(analysis([{ part: TRP1 }, 'folge']));
    expect(ohne.buckets.map((b) => b.kind)).toEqual(['stimme']);
  });

  it('unsichere Folgeseite markiert den Bucket als unsicher', () => {
    const r = splitFile(analysis([{ part: TRP1 }, { part: TRP2, kind: 'unsicher' }]));
    expect(labels(r)).toEqual([['Trompete 1', [1, 2]]]);
    expect(r.buckets[0].warnings).toEqual(['unsicher']);
    expect(r.buckets[0].sections[0].uncertain).toBe(true);
  });

  it('include beschränkt die Seiten, leere Buckets verschwinden, alles abgewählt ergibt "leer"', () => {
    const a = analysis([{ part: TRP1 }, 'folge', { part: TRP2 }]);
    expect(labels(splitFile(a, new Set([1, 3])))).toEqual([['Trompete 1', [1]], ['Trompete 2', [3]]]);
    expect(labels(splitFile(a, new Set([1, 2])))).toEqual([['Trompete 1', [1, 2]]]);
    expect(splitFile(a, new Set()).skipped).toBe('leer');
  });

  it('Datei mit unvollständiger Zuordnung im Include behält Abschnitte getrennt', () => {
    const a = analysis([{ part: TRP1 }, 'folge', 'folge']);
    const r = splitFile(a, new Set([1, 3]));
    expect(r.buckets[0].sections.map((s) => s.pages)).toEqual([[1], [3]]);
  });
});

describe('isSinglePartFile', () => {
  it('Stimme im Dateinamen und nur Sonstiges-Seiten → Einzelstimme', () => {
    const a = analysis(['sonst', 'sonst'], P('tenorhorn'));
    expect(isSinglePartFile(a)).toBe(true);
    expect(splitFile(a)).toEqual({ path: '/x/a.pdf', buckets: [], skipped: 'einzelstimme' });
  });
  it('Stimme im Dateinamen und passender Kopf "Tenorhorn in B" → Einzelstimme', () => {
    expect(isSinglePartFile(analysis([{ part: P('tenorhorn', [], 'B') }, 'folge'], P('tenorhorn')))).toBe(true);
  });
  it('Stimme im Dateinamen, aber mehrere Stimmen auf den Seiten → keine Einzelstimme', () => {
    expect(isSinglePartFile(analysis([{ part: TRP1 }, { part: TRP2 }], P('tuba')))).toBe(false);
    expect(isSinglePartFile(analysis([{ part: TRP1 }], P('tuba')))).toBe(false);
  });
  it('"Partitur" im Dateinamen → wird übersprungen', () => {
    expect(splitFile(analysis(['part', 'part'], P('partitur'))).skipped).toBe('einzelstimme');
  });
  it('ohne Stimme im Dateinamen ist eine einzelne Stimme keine Einzelstimmen-Datei', () => {
    const a = analysis([{ part: TRP1 }, 'folge']);
    expect(isSinglePartFile(a)).toBe(false);
    expect(splitFile(a).buckets).toHaveLength(1);
  });
});
