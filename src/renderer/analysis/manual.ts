import { assignPages } from '@shared/assign';
import { partKey } from '@shared/instruments';
import { parseQuery } from '@shared/matcher';
import type { PartRef } from '@shared/types';
import type { AnalyzedEntry } from '../state';

export const NONE_VALUE = '__none';
export const PARTITUR_VALUE = '__partitur';

/**
 * Wendet eine manuelle Korrektur auf eine Seite an: "__none", "__partitur", ein partKey aus
 * knownParts oder Freitext wie "Horn 3 in F". Folgeseiten werden über assignPages neu berechnet.
 * Liefert undefined, wenn der Freitext keine Stimme ergibt. Reine Funktion, speichert nichts.
 */
export function applyManualAssignment(entry: AnalyzedEntry, page: number, value: string, knownParts: PartRef[]): AnalyzedEntry | undefined {
  const pages = entry.analysis.pages.map((p) => ({ ...p }));
  const target = pages[page - 1];
  if (!target) return undefined;
  let part: PartRef | undefined;
  if (value === PARTITUR_VALUE) {
    target.kind = 'partitur'; target.part = undefined; target.alsoParts = undefined;
  } else if (value === NONE_VALUE) {
    target.kind = 'sonstiges'; target.part = undefined; target.alsoParts = undefined;
  } else {
    part = knownParts.find((p) => partKey(p) === value) ?? parseQuery(value);
    if (!part) return undefined;
    if (part.instrument === 'partitur') {
      target.kind = 'partitur'; target.part = undefined; target.alsoParts = undefined;
    } else {
      target.kind = 'stimme'; target.part = part; target.alsoParts = undefined;
    }
  }
  target.source = 'manuell';
  target.confidence = 1;
  const analysis = { ...entry.analysis, pages, assignments: assignPages(pages, entry.analysis.filenamePart) };
  return { ...entry, analysis };
}
