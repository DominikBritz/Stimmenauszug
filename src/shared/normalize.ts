/** Textnormalisierung für OCR-Ausgaben und Suchanfragen. */

const UMLAUTS: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' };

export function normalizeText(input: string): string {
  let s = input.toLowerCase();
  s = s.replace(/[äöüß]/g, (c) => UMLAUTS[c]);
  // restliche Diakritika entfernen
  s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  // typografische Zeichen vereinheitlichen
  s = s.replace(/[’‘`´]/g, "'").replace(/[–—]/g, '-');
  // Bindestriche innerhalb von Wörtern zu Leerzeichen (Solo-Trompete, F-Horn)
  s = s.replace(/-/g, ' ');
  // Zeilenumbrüche behalten wir als Marker
  s = s.replace(/\r/g, '');
  // Alles außer Buchstaben, Ziffern, Slash, Punkt, Klammern, Zeilenumbruch wird Leerzeichen
  s = s.replace(/[^a-z0-9/.()\n]+/g, ' ');
  // Punkte nur hinter Ziffern behalten ("1.")
  s = s.replace(/(?<!\d)\./g, ' ');
  s = s.replace(/[ \t]+/g, ' ');
  return s.trim();
}

export interface Token {
  text: string;
  index: number;
  atLineStart: boolean;
  /** Token stand in Klammern, z.B. "(B)" */
  parenthesized: boolean;
}

/** Zerlegt normalisierten Text in Tokens; trennt angehängte Ziffern ("flote2" -> "flote", "2"). */
export function tokenize(normalized: string): Token[] {
  const tokens: Token[] = [];
  const lines = normalized.split('\n');
  let depth = 0;
  for (const line of lines) {
    let first = true;
    depth = 0;
    for (const raw of line.split(' ')) {
      if (!raw) continue;
      const parenthesized = raw.includes('(') || depth > 0;
      if (raw.includes('(')) depth++;
      const parts = splitToken(raw);
      for (const p of parts) {
        tokens.push({ text: p, index: tokens.length, atLineStart: first, parenthesized });
        first = false;
      }
      if (raw.includes(')')) depth = Math.max(0, depth - 1);
    }
  }
  return tokens;
}

function splitToken(raw: string): string[] {
  // Klammern abtrennen
  let t = raw.replace(/[()]/g, '');
  if (!t) return [];
  const out: string[] = [];
  // "1./2." oder "1/2" -> als eigenes Token behalten
  if (/^\d\.?\/\d\.?$/.test(t)) return [t];
  // "3.4." / "1./2." als Nummernpaar behalten
  if (/^\d\.?[./]\d\.?$/.test(t)) return [t];
  // An Buchstabe/Ziffer-Grenzen trennen: flote2 -> flote 2, 1in -> 1 in, tuba1u -> tuba 1 u
  const parts = t.split(/(?<=[a-z])(?=\d)|(?<=\d\.?)(?=[a-z])/).filter(Boolean);
  if (parts.length > 1) {
    // Ordnungszahlen (1st, 2nd, 3rd, 4th) bleiben zusammen
    if (parts.length === 2 && /^\d$/.test(parts[0]) && /^(st|nd|rd|th)$/.test(parts[1])) return [t];
    // lange Ziffernfolgen (Bestellnummern, Jahreszahlen) nicht als Nummer missverstehen: bleiben zusammen
    if (parts.some((x) => /^\d{3,}/.test(x))) return [t];
    out.push(...parts);
    return out;
  }
  return [t];
}

/** OCR-Verwechsler in einem überwiegend alphabetischen Token korrigieren. */
export function fixOcrLetters(token: string): string {
  const letters = (token.match(/[a-z]/g) || []).length;
  const digits = (token.match(/\d/g) || []).length;
  if (letters < 3 || digits === 0 || digits > letters) return token;
  return token
    .replace(/0/g, 'o')
    .replace(/1/g, 'l')
    .replace(/5/g, 's')
    .replace(/8/g, 'b')
    .replace(/6/g, 'b');
}

export function levenshtein(a: string, b: string, max = Infinity): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array(n + 1);
  let cur = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1;
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}
