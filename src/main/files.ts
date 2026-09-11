import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, dirname, join, relative } from 'node:path';
import type { FileInfo } from '@shared/ipc-types';

const IGNORED_DIRS = new Set(['node_modules', '.git', '__MACOSX']);

async function collect(root: string, dir: string, out: FileInfo[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true, sensitivity: 'base' }));
  const dirs: string[] = [];
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = join(dir, e.name);
    let s;
    try {
      s = await stat(full); // folgt Symlinks
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      if (!IGNORED_DIRS.has(e.name)) dirs.push(full);
    } else if (s.isFile() && /\.pdf$/i.test(e.name)) {
      out.push({ path: full, name: e.name, size: s.size, mtimeMs: s.mtimeMs, folder: relative(root, dir), subdir: relative(root, dir) });
    }
  }
  for (const d of dirs) await collect(root, d, out);
}

/** Nimmt Datei- und Ordnerpfade entgegen und liefert alle PDFs sortiert (Ordner alphabetisch, Unterordner danach). */
export async function scanPaths(paths: string[]): Promise<FileInfo[]> {
  const out: FileInfo[] = [];
  const seen = new Set<string>();
  for (const p of paths) {
    const s = await stat(p);
    if (s.isDirectory()) {
      const found: FileInfo[] = [];
      await collect(p, p, found);
      for (const f of found) {
        if (!seen.has(f.path)) { seen.add(f.path); out.push(f); }
      }
    } else if (s.isFile() && /\.pdf$/i.test(p)) {
      if (!seen.has(p)) {
        seen.add(p);
        out.push({ path: p, name: basename(p), size: s.size, mtimeMs: s.mtimeMs, folder: basename(dirname(p)) });
      }
    }
  }
  return out;
}

export async function readPdf(path: string): Promise<Buffer> {
  return readFile(path);
}
