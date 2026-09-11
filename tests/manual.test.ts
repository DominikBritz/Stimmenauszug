import { describe, expect, it } from 'vitest';
import { assignPages } from '../src/shared/assign';
import { applyManualAssignment } from '../src/renderer/analysis/manual';
import type { AnalyzedEntry } from '../src/renderer/state';
import type { PageAnalysis, PartRef } from '../src/shared/types';

const TRP1: PartRef = { instrument: 'trompete', numbers: [1] };

function entry(): AnalyzedEntry {
  const pages: PageAnalysis[] = [
    { page: 1, kind: 'stimme', part: TRP1, confidence: 0.9, candidates: [], text: '', source: 'ocr' },
    { page: 2, kind: 'sonstiges', confidence: 0, candidates: [], text: '', source: 'ocr' },
    { page: 3, kind: 'sonstiges', confidence: 0, candidates: [], text: '', source: 'ocr' },
  ];
  const info = { path: '/x/a.pdf', name: 'a.pdf', size: 0, mtimeMs: 0, folder: '' };
  return { info, analysis: { path: info.path, name: info.name, pageCount: 3, pages, assignments: assignPages(pages), thumbnails: [], analyzedAt: '', schemaVersion: 1 } };
}
const parts = (e: AnalyzedEntry) => e.analysis.assignments.map((a) => (a.kind === 'partitur' ? 'PART' : a.part ? `${a.part.instrument}${a.part.numbers.join('/')}${a.part.key ?? ''}` : a.kind));

describe('applyManualAssignment', () => {
  it('Freitext legt eine neue Stimme an, Folgeseiten folgen', () => {
    const r = applyManualAssignment(entry(), 2, 'Horn 3 in F', [])!;
    expect(parts(r)).toEqual(['trompete1', 'horn3F', 'horn3F']);
    expect(r.analysis.pages[1]).toMatchObject({ source: 'manuell', confidence: 1 });
  });
  it('bekannter Schlüssel wird aus knownParts übernommen', () => {
    const r = applyManualAssignment(entry(), 3, 'trompete|1||', [TRP1])!;
    expect(parts(r)).toEqual(['trompete1', 'trompete1', 'trompete1']);
    expect(r.analysis.assignments[2].source).toBe('manuell');
  });
  it('__partitur und Freitext "Partitur" ergeben eine Partiturseite, keine Stimme', () => {
    expect(parts(applyManualAssignment(entry(), 2, '__partitur', [])!)).toEqual(['trompete1', 'PART', 'sonstiges']);
    expect(parts(applyManualAssignment(entry(), 2, 'Partitur', [])!)).toEqual(['trompete1', 'PART', 'sonstiges']);
  });
  it('__none macht die Kopfseite zur Seite ohne Stimme', () => {
    expect(parts(applyManualAssignment(entry(), 1, '__none', [])!)).toEqual(['sonstiges', 'sonstiges', 'sonstiges']);
  });
  it('unbrauchbarer Freitext liefert undefined und verändert nichts', () => {
    const e = entry();
    expect(applyManualAssignment(e, 2, 'xyzzy', [])).toBeUndefined();
    expect(parts(e)).toEqual(['trompete1', 'trompete1', 'trompete1']);
  });
});
