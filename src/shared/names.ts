import type { FileInfo } from './ipc-types';

/** Entfernt Zeichen, die in Datei- und Ordnernamen auf Windows/macOS nicht erlaubt sind. */
export function sanitizeFileName(name: string): string {
  const s = name
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '');
  return s || 'Stimme';
}

/** Titel eines Stücks: Dateiname ohne Endung. */
export function pieceTitle(info: Pick<FileInfo, 'name'>): string {
  return info.name.replace(/\.pdf$/i, '');
}

/**
 * Zielunterordner eines Stücks beim Aufteilen: spiegelt den relativen Ordner innerhalb der
 * gewählten Wurzel ("Archiv/Böhmischer Traum"), einzeln gewählte Dateien landen direkt im Ziel.
 * Segmente sind mit "/" getrennt, jedes einzeln bereinigt.
 */
export function pieceSubdir(info: Pick<FileInfo, 'name' | 'subdir'>): string {
  const segs = (info.subdir ?? '').split(/[\\/]+/).filter(Boolean).map(sanitizeFileName);
  segs.push(sanitizeFileName(pieceTitle(info)));
  return segs.join('/');
}

/** Unterordner je Datei; gleiche Namen (z.B. zwei Wurzelordner mit je "Stimmen.pdf") werden nummeriert. */
export function uniqueSubdirs(files: Pick<FileInfo, 'path' | 'name' | 'subdir'>[]): Map<string, string> {
  const out = new Map<string, string>();
  const used = new Map<string, number>();
  for (const f of files) {
    const base = pieceSubdir(f);
    const key = base.toLowerCase();
    const n = (used.get(key) ?? 0) + 1;
    used.set(key, n);
    out.set(f.path, n === 1 ? base : `${base} (${n})`);
  }
  return out;
}
