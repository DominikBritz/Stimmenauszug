import { samePart } from './matcher';
import type { PageAnalysis, PageAssignment, PartRef } from './types';

/**
 * Ordnet Seiten Stimmenabschnitten zu: eine erkannte Überschrift gilt bis zur nächsten.
 * Partiturseiten unterbrechen den Abschnitt. Eine Stimme aus dem Dateinamen gilt für alle
 * Seiten, wenn die Seitenanalyse höchstens eine (kompatible) Stimme gefunden hat.
 */
export function assignPages(pages: PageAnalysis[], filenamePart?: PartRef): PageAssignment[] {
  if (filenamePart?.instrument === 'partitur') {
    return pages.map((p) => ({ page: p.page, kind: 'partitur' as const, confidence: 0.9, source: 'dateiname' as const }));
  }
  const distinct: PartRef[] = [];
  for (const p of pages) {
    if (p.kind === 'stimme' && p.part && !distinct.some((d) => samePart(d, p.part!))) distinct.push(p.part);
  }
  const useFilename =
    !!filenamePart && (distinct.length === 0 || (distinct.length === 1 && distinct[0].instrument === filenamePart.instrument));

  const out: PageAssignment[] = [];
  let current: PartRef | undefined;
  let currentAlso: PartRef[] | undefined;
  let headerPage: number | undefined;
  let currentConf = 0;

  let lastWasScore = false;
  for (const p of pages) {
    // Seite direkt nach einer Partiturseite, deren "Kopf" nur eine Abkürzung ist (Trp. 1): Partitur-Folgeseite
    if (lastWasScore && p.kind === 'stimme' && p.weak) {
      out.push({ page: p.page, kind: 'partitur', confidence: 0.6, source: p.source });
      continue;
    }
    lastWasScore = p.kind === 'partitur';
    if (p.kind === 'partitur') {
      current = undefined;
      currentAlso = undefined;
      headerPage = undefined;
      out.push({ page: p.page, kind: 'partitur', confidence: p.confidence, source: p.source });
      continue;
    }
    if (p.kind === 'stimme' && p.part) {
      current = p.part;
      currentAlso = p.alsoParts;
      headerPage = p.page;
      currentConf = p.confidence;
      out.push({ page: p.page, kind: 'stimme', part: p.part, alsoParts: p.alsoParts, headerPage: p.page, confidence: p.confidence, source: p.source });
      continue;
    }
    if (useFilename && filenamePart && (!current || current === filenamePart || p.kind === 'unsicher')) {
      // Dateiname deckt die Seite ab
      out.push({ page: p.page, kind: 'stimme', part: filenamePart, confidence: 0.8, source: 'dateiname' });
      current = filenamePart;
      currentAlso = undefined;
      headerPage = undefined;
      currentConf = 0.8;
      continue;
    }
    if (current) {
      out.push({
        page: p.page,
        kind: p.kind === 'unsicher' ? 'unsicher' : 'stimme',
        part: current,
        alsoParts: currentAlso,
        headerPage,
        confidence: Math.min(currentConf, p.kind === 'unsicher' ? 0.5 : 0.7),
        source: 'fortsetzung',
      });
      continue;
    }
    out.push({ page: p.page, kind: p.kind === 'unsicher' ? 'unsicher' : 'sonstiges', part: p.part, confidence: p.confidence, source: p.source });
  }
  return out;
}
