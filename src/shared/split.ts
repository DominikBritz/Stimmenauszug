import { formatPart, partKey } from './instruments';
import type { FileAnalysis, PageAssignment, PartRef } from './types';

export type SplitKind = 'stimme' | 'partitur' | 'sonstiges';
export type SplitWarning = 'unsicher' | 'mehrfach' | 'zweitbezeichnung';

export interface SplitSection {
  /** Zusammenhängende Seiten (1-basiert) */
  pages: number[];
  headerPage?: number;
  /** Mindestens eine Seite ist nur "unsicher" zugeordnet */
  uncertain: boolean;
  /** Abschnitt kam nur über eine Zweitbezeichnung ("… (Bariton, Posaune 2)") hierher */
  viaAlso: boolean;
}

export interface SplitBucket {
  /** partKey(part) | '__partitur' | '__sonstiges' */
  key: string;
  kind: SplitKind;
  part?: PartRef;
  /** Dateiname ohne Endung: formatPart(part) | 'Partitur' | 'Sonstiges' */
  label: string;
  /** Alle Seiten, sortiert, ohne Dubletten */
  pages: number[];
  sections: SplitSection[];
  warnings: SplitWarning[];
}

export type SkipReason = 'einzelstimme' | 'leer';

export interface SplitFile {
  path: string;
  buckets: SplitBucket[];
  skipped?: SkipReason;
}

export const PARTITUR_KEY = '__partitur';
export const SONSTIGES_KEY = '__sonstiges';

/**
 * Datei, die schon eine Einzelstimme ist: Stimme steht im Dateinamen und die Seiten nennen
 * höchstens dieses eine Instrument (Vergleich wie in assignPages). Solche Dateien werden beim
 * Aufteilen übersprungen, sonst entstünde "Kaiserin Sissi Tenor/Tenorhorn in B.pdf".
 */
export function isSinglePartFile(a: Pick<FileAnalysis, 'assignments' | 'filenamePart'>): boolean {
  const fp = a.filenamePart;
  if (!fp) return false;
  if (fp.instrument === 'partitur') return true;
  const distinct = new Set<string>();
  for (const s of a.assignments) {
    if (s.part && (s.kind === 'stimme' || s.kind === 'unsicher')) {
      distinct.add(partKey(s.part));
      if (s.part.instrument !== fp.instrument) return false;
    }
  }
  return distinct.size <= 1;
}

interface Target {
  key: string;
  kind: SplitKind;
  part?: PartRef;
  viaAlso: boolean;
}

function targetsOf(a: PageAssignment): Target[] {
  if (a.kind === 'partitur') return [{ key: PARTITUR_KEY, kind: 'partitur', viaAlso: false }];
  if (a.part && (a.kind === 'stimme' || a.kind === 'unsicher')) {
    const out: Target[] = [{ key: partKey(a.part), kind: 'stimme', part: a.part, viaAlso: false }];
    for (const p of a.alsoParts ?? []) {
      const key = partKey(p);
      if (!out.some((t) => t.key === key)) out.push({ key, kind: 'stimme', part: p, viaAlso: true });
    }
    return out;
  }
  return [{ key: SONSTIGES_KEY, kind: 'sonstiges', viaAlso: false }];
}

/**
 * Gruppiert die Seitenzuordnungen einer Datei zu Ausgabedateien: eine pro Stimme, dazu
 * "Partitur" und "Sonstiges", wenn es solche Seiten gibt. Eine Seite mit Zweitbezeichnungen
 * landet in jeder genannten Stimme. Nicht zusammenhängende Abschnitte derselben Stimme
 * werden zusammengeführt (Warnung "mehrfach").
 * @param include Seiten, die einbezogen werden (Standard: alle)
 */
export function splitFile(a: Pick<FileAnalysis, 'path' | 'assignments' | 'filenamePart'>, include?: Set<number>): SplitFile {
  if (isSinglePartFile(a)) return { path: a.path, buckets: [], skipped: 'einzelstimme' };

  const buckets = new Map<string, SplitBucket>();
  const sorted = [...a.assignments].sort((x, y) => x.page - y.page);
  for (const asg of sorted) {
    if (include && !include.has(asg.page)) continue;
    for (const t of targetsOf(asg)) {
      let b = buckets.get(t.key);
      if (!b) {
        b = {
          key: t.key,
          kind: t.kind,
          part: t.part,
          label: t.kind === 'partitur' ? 'Partitur' : t.kind === 'sonstiges' ? 'Sonstiges' : formatPart(t.part!),
          pages: [],
          sections: [],
          warnings: [],
        };
        buckets.set(t.key, b);
      }
      const last = b.sections[b.sections.length - 1];
      const contiguous = last && last.pages[last.pages.length - 1] === asg.page - 1;
      const sameHeader = last && (t.kind !== 'stimme' || last.headerPage === asg.headerPage);
      const uncertain = asg.kind === 'unsicher';
      if (last && contiguous && sameHeader) {
        last.pages.push(asg.page);
        last.uncertain ||= uncertain;
        last.viaAlso &&= t.viaAlso;
      } else {
        b.sections.push({ pages: [asg.page], headerPage: t.kind === 'stimme' ? asg.headerPage : undefined, uncertain, viaAlso: t.viaAlso });
      }
      b.pages.push(asg.page);
    }
  }

  const out: SplitBucket[] = [];
  for (const b of buckets.values()) {
    b.pages = [...new Set(b.pages)].sort((x, y) => x - y);
    if (b.sections.some((s) => s.uncertain)) b.warnings.push('unsicher');
    if (b.kind === 'stimme' && b.sections.length > 1) b.warnings.push('mehrfach');
    if (b.sections.some((s) => s.viaAlso)) b.warnings.push('zweitbezeichnung');
    out.push(b);
  }
  out.sort((x, y) => {
    if (x.kind === 'sonstiges' !== (y.kind === 'sonstiges')) return x.kind === 'sonstiges' ? 1 : -1;
    return x.pages[0] - y.pages[0];
  });
  if (!out.length) return { path: a.path, buckets: [], skipped: 'leer' };
  return { path: a.path, buckets: out };
}
