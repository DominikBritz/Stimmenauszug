import { INSTRUMENT_BY_ID, TITLE_PRONE, partKey } from './instruments';
import { findCandidates, type MatchOptions } from './matcher';
import type { Candidate, PageKind, PartRef } from './types';

export interface Classification {
  kind: PageKind;
  part?: PartRef;
  alsoParts?: PartRef[];
  confidence: number;
  candidates: Candidate[];
  /** Beste Stimme stammt nur aus einer Abkürzung */
  weak?: boolean;
}

export const CONFIDENT = 0.6;
/** Ab so vielen verschiedenen Stimmen auf einer Seite gilt sie als Partitur */
export const SCORE_PARTS = 3;

function scoreCandidate(c: Candidate): number {
  let s = c.confidence;
  if (c.numbers.length) s += 0.1;
  if (c.key) s += 0.05;
  if (c.atLineStart) s += 0.08;
  s -= c.position * 0.003;
  return s;
}

function toPart(c: Candidate): PartRef {
  return { instrument: c.instrument, numbers: c.numbers, key: c.key, clef: c.clef };
}

/** Ordnet einen Seitentext einer Seitenart und ggf. einer Stimme zu. */
export function classifyText(text: string, opts: MatchOptions = {}): Classification {
  const candidates = findCandidates(text, opts);
  const real = candidates.filter((c) => {
    const def = INSTRUMENT_BY_ID.get(c.instrument);
    return def && !def.special && c.confidence >= 0.45;
  });
  const partitur = candidates.find((c) => c.instrument === 'partitur' && c.confidence >= 0.5);
  if (partitur) {
    // "Flügelhorn 1 in B (Direktion)" ist eine Direktionsstimme, also die Stimme selbst mit Stichnoten
    const strong = real.filter((c) => c.confidence >= 0.9 && c.instrument !== 'stimme');
    const isDirektion = /direktion|conductor|dirigent/.test(partitur.matchedText);
    if (!(isDirektion && strong.length === 1)) return { kind: 'partitur', confidence: partitur.confidence, candidates };
  }
  if (!real.length) return { kind: 'sonstiges', confidence: 0, candidates };

  // Verschiedene Stimmen auf der Seite zählen (nur halbwegs sichere)
  const distinct = new Map<string, Candidate>();
  const generics = new Set<string>();
  for (const c of real) {
    // volle Wörter ab 0.85, nummerierte Abkürzungen (Trp. 1, Pos. 2) ab 0.75
    if (c.confidence < (c.numbers.length ? 0.75 : 0.85)) continue;
    if (c.instrument === 'stimme') {
      if (c.numbers.length) generics.add(c.numbers.join('/'));
      continue;
    }
    const k = partKey(c);
    if (!distinct.has(k)) distinct.set(k, c);
  }
  const families = new Set([...distinct.values()].map((c) => c.instrument));
  // "1. Stimme, 2. Stimme, 3. Stimme" auf einer Seite zählt nur als Liste, wenn mehrere Nummern vorkommen
  const listed = distinct.size + (generics.size >= 2 ? generics.size : 0);
  // Rundel "Quintett +": "3. Stimme in B" oder "Begleitung 1, 2 in C", gefolgt von den Instrumenten,
  // die diese Stimme spielen können ("Tenorhorn, Tenorsaxophon 1, Posaune 1"), ist eine Stimme
  // mit Zweitbezeichnungen, keine Partitur. Bedingung: genau eine solche Kopfstimme, alle anderen dahinter.
  const lead = real.find((c) => c.confidence >= 0.85 && c.numbers.length > 0 && (c.instrument === 'stimme' || /^begleitung/.test(c.matchedText)));
  const alternativeList =
    !!lead &&
    generics.size <= (lead.instrument === 'stimme' ? 1 : 0) &&
    [...distinct.values()].every((c) => c === lead || c.position > lead.position);
  if (!alternativeList && (listed >= SCORE_PARTS || families.size >= SCORE_PARTS)) {
    return { kind: 'partitur', confidence: Math.min(1, 0.5 + listed * 0.1), candidates };
  }

  // Generisches "Stimme" ohne Nummer nur nehmen, wenn nichts Konkretes da ist
  const concrete = real.filter((c) => !(c.instrument === 'stimme' && !c.numbers.length));
  const pool = concrete.length ? concrete : real;
  const ranked = [...pool].sort((a, b) => scoreCandidate(b) - scoreCandidate(a));
  const best = ranked[0];
  const part = toPart(best);
  const kind: PageKind = best.confidence >= CONFIDENT ? 'stimme' : 'unsicher';

  // Weitere Stimmen, für die das Blatt ebenfalls gilt: sicher erkannt, nicht bloß ein Titelwort
  const also: PartRef[] = [];
  for (const c of ranked.slice(1)) {
    if (c.confidence < CONFIDENT) continue;
    if (c.instrument === best.instrument && c.numbers.join('/') === best.numbers.join('/')) continue;
    const bare = !c.numbers.length && !c.key && !c.clef;
    if (bare && TITLE_PRONE.has(c.instrument)) continue;
    if (c.instrument === 'stimme' && !c.numbers.length) continue;
    const p = toPart(c);
    // "1. Stimme in B (Flügelhorn 1, Trompete 1)": die genannten Instrumente lesen aus dieser Stimmung
    if (!p.key && part.key) p.key = part.key;
    if (!also.some((x) => partKey(x) === partKey(p))) also.push(p);
  }
  return { kind, part, alsoParts: also.length ? also : undefined, confidence: best.confidence, candidates, weak: best.abbrev || undefined };
}

/** Prüft den Text einer ganzen Seite nur auf eine Instrumentenliste (Partitur). */
export function looksLikeScore(fullText: string, opts: MatchOptions = {}): boolean {
  const c = classifyText(fullText, opts);
  return c.kind === 'partitur';
}
