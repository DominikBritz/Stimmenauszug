import { describe, expect, it } from 'vitest';
import { pieceSubdir, pieceTitle, sanitizeFileName, uniqueSubdirs } from '../src/shared/names';

describe('names', () => {
  it('sanitizeFileName ersetzt verbotene Zeichen und entfernt Endpunkte', () => {
    expect(sanitizeFileName('Trompete 1/2 in B')).toBe('Trompete 1-2 in B');
    expect(sanitizeFileName('Op. 12.')).toBe('Op. 12');
    expect(sanitizeFileName('  a:b*c?  ')).toBe('a-b-c-');
    expect(sanitizeFileName('???')).toBe('-');
    expect(sanitizeFileName('')).toBe('Stimme');
  });
  it('pieceTitle entfernt die Endung', () => {
    expect(pieceTitle({ name: 'Böhmischer Traum.PDF' })).toBe('Böhmischer Traum');
  });
  it('pieceSubdir spiegelt den relativen Ordner, Einzeldateien liegen direkt im Ziel', () => {
    expect(pieceSubdir({ name: 'Böhmischer Traum.pdf', subdir: 'Archiv/2019' })).toBe('Archiv/2019/Böhmischer Traum');
    expect(pieceSubdir({ name: 'Böhmischer Traum.pdf', subdir: '' })).toBe('Böhmischer Traum');
    expect(pieceSubdir({ name: 'Böhmischer Traum.pdf' })).toBe('Böhmischer Traum');
  });
  it('uniqueSubdirs nummeriert gleiche Zielordner', () => {
    const m = uniqueSubdirs([
      { path: '/a/Stimmen.pdf', name: 'Stimmen.pdf', subdir: '' },
      { path: '/b/Stimmen.pdf', name: 'Stimmen.pdf', subdir: '' },
      { path: '/c/stimmen.pdf', name: 'stimmen.pdf' },
      { path: '/a/Archiv/Stimmen.pdf', name: 'Stimmen.pdf', subdir: 'Archiv' },
    ]);
    expect([...m.values()]).toEqual(['Stimmen', 'Stimmen (2)', 'stimmen (3)', 'Archiv/Stimmen']);
  });
});
