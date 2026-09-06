import { INSTRUMENT_BY_ID, TITLE_PRONE } from './instruments';
import { findCandidates, type MatchOptions } from './matcher';
import type { PartRef } from './types';

/**
 * Leitet aus einem Dateinamen eine Stimme ab, z.B. "Kaiserin Sissi Tenor.pdf" -> Tenorhorn,
 * "Don't Stop Believin Posaune 2 in B.pdf" -> Posaune 2 in B.
 * Titel wie "Polka für Trompete" oder "Farmers Tuba" liefern nur einen schwachen Hinweis,
 * deshalb muss der Treffer am Ende des Namens stehen und eine Nummer oder Stimmung haben,
 * oder das Instrument ist als letztes Wort eindeutig und nicht titeltypisch.
 */
export function partFromFilename(fileName: string, opts: MatchOptions = {}): PartRef | undefined {
  const base = fileName.replace(/\.pdf$/i, '');
  const all = findCandidates(base, opts);
  if (all.some((c) => c.instrument === 'partitur' && c.confidence >= 0.9)) {
    return { instrument: 'partitur', numbers: [] };
  }
  const cands = all.filter((c) => {
    const def = INSTRUMENT_BY_ID.get(c.instrument);
    return def && !def.special && !(c.instrument === 'stimme' && !c.numbers.length);
  });
  if (!cands.length) return undefined;
  const last = cands[cands.length - 1];
  const words = base.trim().split(/\s+/).length;
  // Instrument muss im hinteren Teil des Namens stehen
  const inTail = last.position >= Math.max(0, words - 6);
  const strong = last.numbers.length > 0 || !!last.key || !!last.clef;
  const lastWordIsInstrument = last.position + last.matchedText.split(' ').length >= words;
  const weakOk = last.confidence >= 0.8 && lastWordIsInstrument && !TITLE_PRONE.has(last.instrument);
  if (inTail && (strong || weakOk)) {
    return { instrument: last.instrument, numbers: last.numbers, key: last.key, clef: last.clef };
  }
  return undefined;
}
