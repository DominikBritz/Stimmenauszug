/**
 * Synonymtabelle für Blasmusik-Instrumente (Deutsch, Englisch, Italienisch, Abkürzungen).
 * Alle Synonyme sind bereits normalisiert (klein, Umlaute aufgelöst, Bindestriche als Leerzeichen).
 * Mehrwort-Synonyme ("f horn", "alt saxophon") werden als Bigramme geprüft.
 */
export interface InstrumentDef {
  id: string;
  /** Anzeigename */
  label: string;
  synonyms: string[];
  /** Sonderklasse statt Instrument */
  special?: 'partitur' | 'deckblatt';
}

export const INSTRUMENTS: InstrumentDef[] = [
  { id: 'piccolo', label: 'Piccolo', synonyms: ['piccolo', 'pikkolo', 'picc', 'ottavino', 'kleine floete'] },
  { id: 'floete', label: 'Flöte', synonyms: ['floete', 'flote', 'flute', 'flauto', 'querfloete', 'grosse floete'] },
  { id: 'oboe', label: 'Oboe', synonyms: ['oboe', 'hautbois'] },
  { id: 'fagott', label: 'Fagott', synonyms: ['fagott', 'bassoon', 'fagotto', 'fag', 'bsn'] },
  { id: 'es-klarinette', label: 'Es-Klarinette', synonyms: ['es klarinette', 'eb clarinet', 'es klar', 'clarinetto piccolo'] },
  { id: 'klarinette', label: 'Klarinette', synonyms: ['klarinette', 'clarinet', 'clarinetto', 'klar', 'clar', 'klarinetten', 'b klarinette', 'bb clarinet'] },
  { id: 'bassklarinette', label: 'Bassklarinette', synonyms: ['bassklarinette', 'bass klarinette', 'bass clarinet', 'clarinetto basso', 'bassklar'] },
  { id: 'sopransax', label: 'Sopransaxophon', synonyms: ['sopransaxophon', 'sopran saxophon', 'soprano sax', 'soprano saxophone', 'sopran sax', 'sopransax'] },
  { id: 'altsax', label: 'Altsaxophon', synonyms: ['altsaxophon', 'alt saxophon', 'alto sax', 'alto saxophone', 'alt sax', 'altsax', 'sax alto', 'es alt saxophon', 'eb alto sax'] },
  { id: 'tenorsax', label: 'Tenorsaxophon', synonyms: ['tenorsaxophon', 'tenor saxophon', 'tenor sax', 'tenor saxophone', 'tenorsax', 'sax tenore', 'b tenor saxophon', 'bb tenor sax'] },
  { id: 'baritonsax', label: 'Baritonsaxophon', synonyms: ['baritonsaxophon', 'bariton saxophon', 'baritone sax', 'baritone saxophone', 'bari sax', 'baritonsax', 'sax baritono'] },
  { id: 'saxophon', label: 'Saxophon', synonyms: ['saxophon', 'saxophone', 'sax', 'saxofon', 'sassofono'] },
  { id: 'fluegelhorn', label: 'Flügelhorn', synonyms: ['fluegelhorn', 'flugelhorn', 'flugel horn', 'fluegel horn', 'flicorno', 'flh', 'flgh', 'flhn', 'bugle', 'fluegelhoerner', 'flugelhoerner'] },
  { id: 'trompete', label: 'Trompete', synonyms: ['trompete', 'trumpet', 'tromba', 'trp', 'tpt', 'trompette', 'tromp', 'trompeten', 'trumpets', 'solo trompete', 'b trompete', 'bb trumpet', 'trompete solo'] },
  { id: 'kornett', label: 'Kornett', synonyms: ['kornett', 'cornet', 'cornetto'] },
  { id: 'horn', label: 'Horn', synonyms: ['horn', 'waldhorn', 'corno', 'hrn', 'french horn', 'f horn', 'es horn', 'eb horn', 'horn in f', 'horn in es', 'hoerner', 'horns', 'corni'] },
  { id: 'tenorhorn', label: 'Tenorhorn', synonyms: ['tenorhorn', 'tenor horn', 'tenor', 'tenore', 'flicorno tenore', 'thn', 'tenorhoerner', 'tenorh'] },
  { id: 'bariton', label: 'Bariton', synonyms: ['bariton', 'baritone', 'baryton', 'baritono', 'flicorno baritono', 'baritonhorn'] },
  { id: 'euphonium', label: 'Euphonium', synonyms: ['euphonium', 'euph', 'eufonio'] },
  { id: 'posaune', label: 'Posaune', synonyms: ['posaune', 'trombone', 'pos', 'tbn', 'trb', 'trombono', 'posaunen', 'trombones', 'zugposaune', 'tenorposaune', 'tenor posaune', 'tenor trombone'] },
  { id: 'bassposaune', label: 'Bassposaune', synonyms: ['bassposaune', 'bass posaune', 'bass trombone', 'trombone basso'] },
  { id: 'tuba', label: 'Tuba', synonyms: ['tuba', 'bass', 'basso', 'baesse', 'tba', 'basstuba', 'bass tuba', 'b tuba', 'es tuba', 'bombardon', 'sousaphon', 'sousaphone', 'helikon', 'bassi', 'tuben', 'bb tuba', 'eb tuba', 'c tuba', 'f tuba'] },
  { id: 'schlagzeug', label: 'Schlagzeug', synonyms: ['schlagzeug', 'drums', 'drum set', 'drumset', 'percussion', 'perc', 'schlagwerk', 'batteria', 'percussioni', 'drs', 'schlgz', 'schlz', 'schl', 'kleine trommel', 'grosse trommel', 'snare drum', 'bass drum', 'becken', 'cymbals', 'trommel', 'trommeln'] },
  { id: 'pauken', label: 'Pauken', synonyms: ['pauken', 'timpani', 'pauke', 'timp'] },
  { id: 'mallets', label: 'Mallets', synonyms: ['mallets', 'glockenspiel', 'xylophon', 'xylophone', 'vibraphon', 'vibraphone', 'marimba', 'lyra', 'stabspiele'] },
  { id: 'gitarre', label: 'Gitarre', synonyms: ['gitarre', 'guitar', 'chitarra', 'git', 'gtr', 'e gitarre', 'e guitar'] },
  { id: 'bassgitarre', label: 'Bassgitarre', synonyms: ['bassgitarre', 'bass gitarre', 'bass guitar', 'e bass', 'electric bass', 'basso elettrico'] },
  { id: 'keyboard', label: 'Keyboard', synonyms: ['keyboard', 'keys', 'klavier', 'piano', 'pianoforte', 'synthesizer', 'synth', 'orgel', 'organ'] },
  { id: 'akkordeon', label: 'Akkordeon', synonyms: ['akkordeon', 'accordion', 'akkordeon', 'harmonika', 'ziehharmonika', 'steirische', 'begleitung', 'begleitung akkordeon'] },
  { id: 'gesang', label: 'Gesang', synonyms: ['gesang', 'vocal', 'vocals', 'voice', 'stimme gesang', 'singstimme', 'chor', 'choir', 'canto'] },
  { id: 'stimme', label: 'Stimme', synonyms: ['stimme', 'stimmen', 'voice', 'melodie', 'melody', 'melodiestimme', 'melody part', 'nebenstimme', 'begleitstimme', 'gegenstimme', 'solostimme', 'solo'] },
  {
    id: 'partitur',
    label: 'Partitur',
    special: 'partitur',
    synonyms: ['partitur', 'score', 'full score', 'direktion', 'direktionsstimme', 'conductor', 'conductor score', 'condensed score', 'partitura', 'direktionspartitur', 'dirigent', 'klavierauszug', 'spielpartitur'],
  },
  { id: 'deckblatt', label: 'Deckblatt', special: 'deckblatt', synonyms: ['deckblatt', 'titelblatt', 'inhalt', 'inhaltsverzeichnis', 'cover'] },
];

export const INSTRUMENT_BY_ID = new Map(INSTRUMENTS.map((i) => [i.id, i]));

/** Synonym-Index: normalisiertes Synonym -> Instrument-ID. Enthält 1-, 2- und 3-Wort-Synonyme. */
export const SYNONYM_INDEX = new Map<string, string>();
for (const inst of INSTRUMENTS) {
  for (const syn of inst.synonyms) {
    if (!SYNONYM_INDEX.has(syn)) SYNONYM_INDEX.set(syn, inst.id);
  }
}

/** Instrumente, deren Nennung im Titel eines Stücks häufig ist, bekommen ohne Nummer/Stimmung etwas weniger Gewicht. */
export const TITLE_PRONE = new Set(['trompete', 'tuba', 'gesang', 'stimme']);

/** Ordnungszahlen und römische Ziffern -> Nummer */
export const NUMBER_WORDS: Record<string, number> = {
  i: 1, ii: 2, iii: 3, iv: 4,
  '1st': 1, '2nd': 2, '3rd': 3, '4th': 4,
  first: 1, second: 2, third: 3, fourth: 4,
  erste: 1, zweite: 2, dritte: 3, vierte: 4,
  erstes: 1, zweites: 2, drittes: 3, viertes: 4,
  prima: 1, seconda: 2, terza: 3, quarta: 4,
  primo: 1, secondo: 2, terzo: 3, quarto: 4,
};

/** Stimmungen: normalisiertes Token -> kanonische Stimmung */
export const KEYS: Record<string, string> = {
  b: 'B', bb: 'B', 'b flat': 'B', bes: 'B',
  es: 'Es', eb: 'Es', 'e flat': 'Es',
  f: 'F',
  c: 'C',
  as: 'As', ab: 'As',
  des: 'Des', db: 'Des',
  a: 'A', d: 'D', g: 'G',
};

/** Schlüsselangaben */
export const CLEFS: Record<string, 'vs' | 'bs'> = {
  vs: 'vs', 'violinschluessel': 'vs', 'treble clef': 'vs', tc: 'vs', 'chiave di violino': 'vs', 'g schluessel': 'vs',
  bs: 'bs', 'bassschluessel': 'bs', 'bass clef': 'bs', bc: 'bs', 'chiave di basso': 'bs', 'f schluessel': 'bs',
};

export function formatPart(p: { instrument: string; numbers: number[]; key?: string; clef?: 'vs' | 'bs' }): string {
  const def = INSTRUMENT_BY_ID.get(p.instrument);
  let s = def ? def.label : p.instrument;
  if (p.numbers.length) s += ' ' + p.numbers.join('/');
  if (p.key) s += ' in ' + p.key;
  if (p.clef) s += p.clef === 'vs' ? ' (Violinschlüssel)' : ' (Bassschlüssel)';
  return s;
}

export function partKey(p: { instrument: string; numbers: number[]; key?: string; clef?: string }): string {
  return [p.instrument, p.numbers.join('/'), p.key ?? '', p.clef ?? ''].join('|');
}
