import { app } from 'electron';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FileInfo } from '@shared/ipc-types';
import { SCHEMA_VERSION, type FileAnalysis } from '@shared/types';

function cacheDir(): string {
  return join(app.getPath('userData'), 'cache');
}

export function cacheKey(info: FileInfo): string {
  return createHash('sha1').update(`${info.path}|${info.size}|${Math.round(info.mtimeMs)}`).digest('hex');
}

export async function getCached(info: FileInfo): Promise<FileAnalysis | null> {
  try {
    const raw = await readFile(join(cacheDir(), cacheKey(info) + '.json'), 'utf8');
    const data = JSON.parse(raw) as FileAnalysis;
    if (data.schemaVersion !== SCHEMA_VERSION) return null;
    return data;
  } catch {
    return null;
  }
}

export async function setCached(info: FileInfo, analysis: FileAnalysis): Promise<void> {
  const dir = cacheDir();
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, cacheKey(info) + '.json'), JSON.stringify(analysis));
}

export async function clearCache(): Promise<number> {
  const dir = cacheDir();
  try {
    const entries = await readdir(dir);
    await rm(dir, { recursive: true, force: true });
    return entries.length;
  } catch {
    return 0;
  }
}

export async function cacheStats(): Promise<{ count: number; path: string }> {
  const dir = cacheDir();
  try {
    const entries = await readdir(dir);
    return { count: entries.filter((e) => e.endsWith('.json')).length, path: dir };
  } catch {
    return { count: 0, path: dir };
  }
}
