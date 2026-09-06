/** Verweis auf eine Stimme: Instrument (kanonische ID) plus optionale Nummer(n) und Stimmung. */
export interface PartRef {
  instrument: string;
  /** z.B. [1] oder [1, 2] bei "Trompete 1/2" */
  numbers: number[];
  /** Stimmung wie "B", "Es", "F", "C" */
  key?: string;
  /** Schlüssel: "vs" Violinschlüssel, "bs" Bassschlüssel */
  clef?: 'vs' | 'bs';
}

export interface Candidate extends PartRef {
  /** 0..1 */
  confidence: number;
  /** Gefundene Textstelle */
  matchedText: string;
  /** Position im normalisierten Text (Token-Index) */
  position: number;
  /** Steht am Zeilenanfang */
  atLineStart: boolean;
  /** Treffer war nur eine Abkürzung (Trp., Pos., Flhn.) – typisch für Notenzeilen-Labels in Partituren */
  abbrev: boolean;
}

export type PageKind = 'stimme' | 'partitur' | 'sonstiges' | 'unsicher';

export type Source = 'text' | 'ocr' | 'ki' | 'dateiname' | 'manuell' | 'fortsetzung';

export interface PageAnalysis {
  /** 1-basiert */
  page: number;
  kind: PageKind;
  /** Beste Stimme dieser Seite (nur bei stimme/unsicher) */
  part?: PartRef;
  /** Weitere Stimmen, für die dieses Blatt ebenfalls gilt, z.B. "4. Stimme in C (Bariton, Posaune 2)" */
  alsoParts?: PartRef[];
  confidence: number;
  candidates: Candidate[];
  text: string;
  source: Source;
  /** Bild-Bereite Breite in px, mit der OCR gelaufen ist */
  ocrWidth?: number;
  /** Stimme wurde nur aus einer Abkürzung gelesen (schwacher Kopf) */
  weak?: boolean;
}

export interface PageAssignment {
  page: number;
  kind: PageKind;
  /** Zugeordnete Stimme, ggf. per Fortsetzung von einer früheren Seite */
  part?: PartRef;
  alsoParts?: PartRef[];
  /** Seite, auf der die Überschrift stand (bei Fortsetzung) */
  headerPage?: number;
  confidence: number;
  source: Source;
}

export interface FileAnalysis {
  path: string;
  name: string;
  pageCount: number;
  pages: PageAnalysis[];
  assignments: PageAssignment[];
  /** Aus dem Dateinamen abgeleitete Stimme */
  filenamePart?: PartRef;
  /** Miniaturen (JPEG data URLs), Index = Seite-1 */
  thumbnails: string[];
  analyzedAt: string;
  schemaVersion: number;
}

export interface UserAlias {
  /** Text wie er auf dem Blatt steht, z.B. "1. Stimme (B)" */
  pattern: string;
  /** Ziel, z.B. "Trompete 1" */
  target: string;
}

export const SCHEMA_VERSION = 1;
