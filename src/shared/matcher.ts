import { CLEFS, INSTRUMENT_BY_ID, KEYS, NUMBER_WORDS, SYNONYM_INDEX, TITLE_PRONE } from './instruments';
import { fixOcrLetters, levenshtein, normalizeText, tokenize, type Token } from './normalize';
import type { Candidate, PartRef, UserAlias } from './types';

export interface MatchOptions {
  aliases?: UserAlias[];
  /** Titel des Stücks (Dateiname ohne Endung). Instrumente, die darin vorkommen, gelten ohne Nummer/Stimmung als Titelwort. */
  title?: string;
}

const NUMBER_RE = /^([1-6])\.?$/;
const NUMBER_PAIR_RE = /^([1-6])\.?[/.]([1-6])\.?$/;
const ROMAN_OCR_RE = /^[il|!1]{1,3}$/;
const JOINERS = new Set(['u', 'und', 'and', 'e', 'et', 'or', 'oder']);
const MAX_NGRAM = 3;

/** Alle Synonyme mit Länge >= 4 für die unscharfe Suche (Einzelwörter). */
const FUZZY_SYNONYMS: { syn: string; id: string }[] = [];
for (const [syn, id] of SYNONYM_INDEX) {
  if (!syn.includes(' ') && syn.length >= 4) FUZZY_SYNONYMS.push({ syn, id });
}

function parseNumberToken(t: string): number[] | undefined {
  const pair = t.match(NUMBER_PAIR_RE);
  if (pair) return [Number(pair[1]), Number(pair[2])];
  const single = t.match(NUMBER_RE);
  if (single) return [Number(single[1])];
  if (t in NUMBER_WORDS) return [NUMBER_WORDS[t]];
  // OCR liest römische Ziffern als "IL", "ll", "1l"
  if (ROMAN_OCR_RE.test(t)) return [t.length];
  return undefined;
}

function isKeyToken(t: Token): boolean {
  return t.text in KEYS && (t.parenthesized || t.text.length <= 2);
}

/** Abkürzung: höchstens 3 Zeichen oder ohne Vokal (trp, pos, flhn, schlz) */
export function isAbbreviation(matchedText: string): boolean {
  if (matchedText.includes(' ')) return false;
  return matchedText.length <= 3 || !/[aeiouy]/.test(matchedText);
}

interface RawMatch {
  id: string;
  start: number;
  length: number;
  score: number;
  matchedText: string;
}

/** Findet an Position i das längste passende Synonym (exakt), sonst unscharf ein Einzelwort. */
function matchAt(tokens: Token[], i: number): RawMatch | undefined {
  for (let n = Math.min(MAX_NGRAM, tokens.length - i); n >= 1; n--) {
    const gram = tokens.slice(i, i + n).map((t) => t.text).join(' ');
    const id = SYNONYM_INDEX.get(gram);
    if (id) return { id, start: i, length: n, score: 1, matchedText: gram };
  }
  const raw = tokens[i].text;
  if (!/[a-z]/.test(raw)) return undefined;
  const t = fixOcrLetters(raw);
  const id = SYNONYM_INDEX.get(t);
  if (id) return { id, start: i, length: 1, score: 0.95, matchedText: raw };
  if (t.length < 4) return undefined;

  let best: RawMatch | undefined;
  for (const { syn, id } of FUZZY_SYNONYMS) {
    // zusammengesetzte Wörter: "solotrompete", "tenorposaune"
    if (t.length > syn.length + 2 && syn.length >= 5 && (t.endsWith(syn) || t.startsWith(syn))) {
      const score = 0.85;
      if (!best || score > best.score) best = { id, start: i, length: 1, score, matchedText: raw };
      continue;
    }
    const shorter = Math.min(t.length, syn.length);
    const maxDist = shorter >= 8 ? 2 : shorter >= 5 ? 1 : 0;
    if (maxDist === 0 || Math.abs(t.length - syn.length) > maxDist) continue;
    const d = levenshtein(t, syn, maxDist);
    if (d <= maxDist) {
      const score = 1 - d * 0.17;
      if (!best || score > best.score) best = { id, start: i, length: 1, score, matchedText: raw };
    }
  }
  return best;
}

/** Liest ab Position j eine Nummer und ggf. Fortsetzungen ("1, 2", "1 u. 2", "1 und 2"). */
function readNumberSequence(tokens: Token[], j: number): { numbers: number[]; end: number } | undefined {
  const first = parseNumberToken(tokens[j].text);
  if (!first) return undefined;
  const numbers = [...first];
  let k = j + 1;
  while (k < tokens.length && numbers.length < 4) {
    const t = tokens[k].text;
    if (JOINERS.has(t) && k + 1 < tokens.length) {
      const n = parseNumberToken(tokens[k + 1].text);
      if (n && !ROMAN_OCR_RE.test(tokens[k + 1].text)) { numbers.push(...n); k += 2; continue; }
      break;
    }
    const n = NUMBER_RE.test(t) ? parseNumberToken(t) : undefined;
    if (n && !numbers.includes(n[0])) { numbers.push(...n); k++; continue; }
    break;
  }
  return { numbers: [...new Set(numbers)], end: k };
}

function findNumbers(tokens: Token[], start: number, length: number): { numbers: number[]; from?: number } {
  // vorwärts: direkt hinter dem Instrument oder mit genau einem Qualifizierer ("Horn Melody 1") dazwischen,
  // aber nicht über "in <Stimmung>" oder ein anderes Instrument hinweg
  for (let j = start + length; j < Math.min(tokens.length, start + length + 3); j++) {
    const t = tokens[j];
    // "in B" oder "(B)" beendet die Suche; ein nackter Stimmungsbuchstabe ("Trp. B 1") wird übersprungen
    if (t.text === 'in' || (isKeyToken(t) && t.parenthesized)) break;
    if (isKeyToken(t)) continue;
    const prev = tokens[j - 1];
    if (j > start + length && SYNONYM_INDEX.get(prev.text) !== 'stimme' && !isKeyToken(prev)) break;
    const seq = readNumberSequence(tokens, j);
    if (seq) {
      // "Polka für Trompete 1. Posaune": die Nummer gehört zum folgenden Instrument
      const after = tokens[seq.end];
      const afterId = after ? SYNONYM_INDEX.get(after.text) : undefined;
      if (afterId && afterId !== 'stimme' && !INSTRUMENT_BY_ID.get(afterId)?.special) break;
      return { numbers: seq.numbers, from: j };
    }
    // Qualifizierer wie "melody", "solo", "stimme" überspringen, andere Instrumente beenden die Suche
    const synId = SYNONYM_INDEX.get(t.text);
    if (synId && synId !== 'stimme') break;
  }
  // rückwärts bis 2 Tokens ("1. Trompete", "1st Trumpet", "erste", "1. u. 2. Trompete")
  for (let j = start - 1; j >= Math.max(0, start - 3); j--) {
    const t = tokens[j].text;
    if (JOINERS.has(t)) continue;
    const seq = readNumberSequence(tokens, j);
    if (seq && seq.end >= start - 1) return { numbers: seq.numbers, from: j };
    if (!parseNumberToken(t)) break;
  }
  return { numbers: [] };
}

function findKey(tokens: Token[], start: number, length: number, matchedText: string): string | undefined {
  // Stimmung im Synonym selbst ("f horn", "es klarinette", "bb trumpet", "horn in f")
  if (matchedText.includes(' ')) {
    const words = matchedText.split(' ');
    if (words[0] in KEYS) return KEYS[words[0]];
    const inIdx = words.indexOf('in');
    if (inIdx >= 0 && words[inIdx + 1] in KEYS) return KEYS[words[inIdx + 1]];
  }
  // vorangestellte Stimmung: "Bb Trompete", "Es Klarinette", "F Horn"
  if (start > 0) {
    const before = tokens[start - 1];
    if (before.text in KEYS && (before.text.length === 2 || before.parenthesized || before.text === 'b' || before.text === 'f' || before.text === 'c')) {
      return KEYS[before.text];
    }
  }
  const end = start + length;
  for (let j = end; j < Math.min(tokens.length, end + 6); j++) {
    const t = tokens[j];
    if (t.text === 'in' && j + 1 < tokens.length) {
      const k = tokens[j + 1].text;
      if (k in KEYS) return KEYS[k];
    }
    if (t.parenthesized && t.text in KEYS) return KEYS[t.text];
    if (SYNONYM_INDEX.has(t.text) && t.text.length > 3) break;
  }
  return undefined;
}

function findClef(tokens: Token[], start: number, length: number): 'vs' | 'bs' | undefined {
  const end = start + length;
  for (let j = end; j < Math.min(tokens.length, end + 6); j++) {
    const one = tokens[j].text;
    const two = j + 1 < tokens.length ? one + ' ' + tokens[j + 1].text : '';
    if (two in CLEFS) return CLEFS[two];
    if (one in CLEFS) return CLEFS[one];
  }
  return undefined;
}

/** Findet Stimmen-Kandidaten in einem (OCR-)Text. */
export function findCandidates(text: string, opts: MatchOptions = {}): Candidate[] {
  const norm = normalizeText(text);
  const tokens = tokenize(norm);
  const out: Candidate[] = [];
  const used = new Set<number>();
  const titleTokens = new Set(opts.title ? tokenize(normalizeText(opts.title)).map((t) => t.text) : []);

  // 1) Benutzer-Aliase zuerst (exakte Teilstring-Treffer im normalisierten Text)
  if (opts.aliases?.length) {
    const joined = tokens.map((t) => t.text);
    for (const alias of opts.aliases) {
      const pat = tokenize(normalizeText(alias.pattern)).map((t) => t.text);
      if (!pat.length) continue;
      const target = parseQuery(alias.target);
      if (!target) continue;
      for (let i = 0; i + pat.length <= joined.length; i++) {
        let ok = true;
        for (let k = 0; k < pat.length; k++) if (joined[i + k] !== pat[k]) { ok = false; break; }
        if (!ok) continue;
        out.push({
          ...target,
          confidence: 0.95,
          matchedText: pat.join(' '),
          position: i,
          atLineStart: tokens[i].atLineStart,
          abbrev: false,
        });
        for (let k = 0; k < pat.length; k++) used.add(i + k);
        i += pat.length - 1;
      }
    }
  }

  // 2) Synonymtabelle
  for (let i = 0; i < tokens.length; i++) {
    if (used.has(i)) continue;
    const m = matchAt(tokens, i);
    if (!m) continue;
    const def = INSTRUMENT_BY_ID.get(m.id)!;
    const { numbers, from } = findNumbers(tokens, m.start, m.length);
    const key = def.special ? undefined : findKey(tokens, m.start, m.length, m.matchedText);
    const clef = def.special ? undefined : findClef(tokens, m.start, m.length);

    let confidence = m.score;
    const isAbbrev = isAbbreviation(m.matchedText);
    if (isAbbrev) confidence -= m.matchedText.length <= 3 ? 0.3 : 0.15;
    if (def.id === 'stimme' && !numbers.length) confidence -= 0.5;
    if (numbers.length) confidence += 0.1;
    if (key) confidence += 0.05;
    const bare = !numbers.length && !key && !clef;
    if (bare && TITLE_PRONE.has(def.id)) confidence -= 0.15;
    // Instrument kommt im Stücktitel vor ("Polka für Trompete", "Tuba Wahnsinn"): ohne Nummer/Stimmung nur ein Titelwort
    if (bare && !def.special && m.matchedText.split(' ').some((w) => titleTokens.has(w) && !(w in KEYS) && SYNONYM_INDEX.get(w) !== 'stimme')) confidence -= 0.35;
    confidence = Math.max(0, Math.min(1, confidence));

    const atLineStart = tokens[m.start].atLineStart || (from !== undefined && from < m.start && tokens[from].atLineStart);
    out.push({
      instrument: def.id,
      numbers,
      key,
      clef,
      confidence,
      matchedText: m.matchedText,
      position: m.start,
      atLineStart,
      abbrev: isAbbrev,
    });
    for (let k = 0; k < m.length; k++) used.add(m.start + k);
    i = m.start + m.length - 1;
  }

  return out.sort((a, b) => a.position - b.position);
}

/** Wandelt eine Benutzereingabe wie "Trompete 1" oder "1st Bb Trumpet" in eine Stimme um. */
export function parseQuery(query: string): PartRef | undefined {
  const cands = findCandidates(query).filter((c) => !INSTRUMENT_BY_ID.get(c.instrument)?.special || c.instrument === 'partitur');
  if (!cands.length) return undefined;
  const best = cands.sort((a, b) => b.confidence - a.confidence)[0];
  return { instrument: best.instrument, numbers: best.numbers, key: best.key, clef: best.clef };
}

export interface QueryMatchOptions {
  /** Stimmen ohne Nummer zählen auch, wenn die Anfrage eine Nummer hat (z.B. "Trompete" bei Anfrage "Trompete 1") */
  includeUnnumbered?: boolean;
  /** Stimmung muss passen, wenn beide angegeben */
  strictKey?: boolean;
}

export function partMatchesQuery(part: PartRef, query: PartRef, opts: QueryMatchOptions = {}): boolean {
  if (part.instrument !== query.instrument) return false;
  if (query.numbers.length) {
    if (!part.numbers.length) {
      if (!opts.includeUnnumbered) return false;
    } else if (!part.numbers.some((n) => query.numbers.includes(n))) {
      return false;
    }
  }
  if (opts.strictKey && query.key && part.key && query.key !== part.key) return false;
  if (query.clef && part.clef && query.clef !== part.clef) return false;
  return true;
}

export function samePart(a: PartRef, b: PartRef): boolean {
  return (
    a.instrument === b.instrument &&
    a.numbers.join('/') === b.numbers.join('/') &&
    (a.key ?? '') === (b.key ?? '') &&
    (a.clef ?? '') === (b.clef ?? '')
  );
}
