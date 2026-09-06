import type { FileInfo } from '@shared/ipc-types';
import type { FileAnalysis, PartRef } from '@shared/types';

export type Step = 'auswahl' | 'analyse' | 'kontrolle' | 'export';

export interface Query {
  raw: string;
  part?: PartRef;
}

export interface AnalyzedEntry {
  info: FileInfo;
  analysis: FileAnalysis;
}

/** Manuelle Seitenauswahl je Anfrage: Pfad -> gewählte Seiten */
export type Selection = Map<string, Set<number>>;

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
