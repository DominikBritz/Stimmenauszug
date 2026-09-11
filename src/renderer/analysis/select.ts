import { partMatchesQuery } from '@shared/matcher';
import { formatPart } from '@shared/instruments';
import type { FileInfo } from '@shared/ipc-types';
import type { FileAnalysis, PartRef } from '@shared/types';

export interface AnalyzedFile {
  info: FileInfo;
  analysis: FileAnalysis;
}

export interface PieceSelection {
  file: AnalyzedFile;
  /** Seiten, die die Stimme enthalten (1-basiert) */
  pages: number[];
  /** Mindestens eine Seite ist nur "unsicher" zugeordnet */
  uncertain: boolean;
  /** Anzeigetext der gefundenen Stimme(n) */
  labels: string[];
}

export interface SelectOptions {
  includeUnnumbered: boolean;
}

export function selectForQuery(files: AnalyzedFile[], query: PartRef, opts: SelectOptions): PieceSelection[] {
  const out: PieceSelection[] = [];
  for (const file of files) {
    const pages: number[] = [];
    const labels = new Set<string>();
    let uncertain = false;
    // Gibt es in dieser Datei nummerierte Stimmen des gesuchten Instruments, sind unnummerierte
    // Treffer vermutlich Lesefehler einer anderen Nummer und werden nicht einbezogen.
    const hasNumbered = file.analysis.assignments.some(
      (a) => a.part && a.part.instrument === query.instrument && a.part.numbers.length > 0 && a.kind === 'stimme',
    );
    const includeUnnumbered = opts.includeUnnumbered && !hasNumbered;
    const matchOpts = { includeUnnumbered, strictKey: true };
    const usable = file.analysis.assignments.filter((a) => a.part && (a.kind === 'stimme' || a.kind === 'unsicher'));
    // Passt irgendeine Seite über ihre Hauptbezeichnung, zählen Zweitbezeichnungen ("Posaune 2, auch Bariton") nicht mehr
    const primaryHit = usable.some((a) => partMatchesQuery(a.part!, query, matchOpts));
    // Gibt es Seiten mit passender Stimmung, sind Seiten ohne Stimmungsangabe vermutlich Lesefehler
    const keyedHit = !!query.key && usable.some((a) => a.part!.key === query.key && partMatchesQuery(a.part!, query, matchOpts));
    for (const a of usable) {
      const parts = primaryHit ? [a.part!] : [a.part!, ...(a.alsoParts ?? [])];
      const hit = parts.find((p) => partMatchesQuery(p, query, matchOpts));
      if (!hit) continue;
      if (keyedHit && !hit.key) continue;
      pages.push(a.page);
      labels.add(formatPart(a.part!) + (hit !== a.part ? ` (${formatPart(hit)})` : ''));
      if (a.kind === 'unsicher' || (!hit.numbers.length && query.numbers.length) || (query.key && !hit.key)) uncertain = true;
    }
    if (pages.length) out.push({ file, pages, uncertain, labels: [...labels] });
  }
  return out;
}

export { pieceTitle } from '@shared/names';
