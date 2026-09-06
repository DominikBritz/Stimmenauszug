import { useEffect, useMemo, useRef, useState } from 'react';
import { INSTRUMENTS, formatPart } from '@shared/instruments';
import { parseQuery } from '@shared/matcher';
import type { FileInfo } from '@shared/ipc-types';
import { formatBytes, type Query } from '../state';

interface Props {
  files: FileInfo[];
  setFiles: (f: FileInfo[]) => void;
  queries: Query[];
  setQueries: (q: Query[]) => void;
  onStart: () => void;
  recentInputs: string[];
  onRecentChange: (recent: string[]) => void;
}

const SUGGESTIONS: string[] = [];
for (const inst of INSTRUMENTS) {
  if (inst.special || inst.id === 'stimme') continue;
  SUGGESTIONS.push(inst.label);
  if (['trompete', 'fluegelhorn', 'horn', 'posaune', 'klarinette', 'tenorhorn', 'bariton', 'tuba', 'floete', 'altsax', 'tenorsax'].includes(inst.id)) {
    for (const n of [1, 2, 3, 4]) SUGGESTIONS.push(`${inst.label} ${n}`);
  }
}
SUGGESTIONS.push('1. Stimme', '2. Stimme', '3. Stimme', '4. Stimme');

export default function Auswahl({ files, setFiles, queries, setQueries, onStart, recentInputs, onRecentChange }: Props) {
  const [over, setOver] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [suggestIdx, setSuggestIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = useMemo(() => {
    const q = input.trim().toLowerCase();
    if (!q) return [];
    return SUGGESTIONS.filter((s) => s.toLowerCase().includes(q) && !queries.some((x) => x.raw === s)).slice(0, 8);
  }, [input, queries]);

  useEffect(() => setSuggestIdx(0), [suggestions.length]);

  async function addPaths(paths: string[]) {
    if (!paths.length) return;
    setBusy(true);
    try {
      const found = (await window.api.invoke('files:scan', paths)) as FileInfo[];
      const known = new Set(files.map((f) => f.path));
      setFiles([...files, ...found.filter((f) => !known.has(f.path))]);
      if (found.length) onRecentChange([...paths, ...recentInputs.filter((r) => !paths.includes(r))].slice(0, 6));
    } catch (e) {
      // Pfad existiert nicht mehr (z.B. externe Platte): aus der Liste nehmen
      onRecentChange(recentInputs.filter((r) => !paths.includes(r)));
      alert(`Konnte nicht öffnen: ${paths.join(', ')}\n${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  function shortPath(p: string): string {
    const home = p.match(/^\/Users\/[^/]+|^[A-Za-z]:\\Users\\[^\\]+/);
    return home ? '~' + p.slice(home[0].length) : p;
  }

  async function pickFiles() {
    addPaths((await window.api.invoke('dialog:openFiles')) as string[]);
  }
  async function pickFolder() {
    addPaths((await window.api.invoke('dialog:openFolder')) as string[]);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setOver(false);
    const paths = Array.from(e.dataTransfer.files).map((f) => window.api.pathForFile(f)).filter(Boolean);
    addPaths(paths);
  }

  function addQuery(raw: string) {
    const t = raw.trim();
    if (!t || queries.some((q) => q.raw.toLowerCase() === t.toLowerCase())) return;
    setQueries([...queries, { raw: t, part: parseQuery(t) }]);
    setInput('');
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addQuery(suggestions.length && suggestIdx >= 0 && input.trim() !== suggestions[suggestIdx] && suggestions.length === 1 ? suggestions[0] : input);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSuggestIdx((i) => Math.min(suggestions.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSuggestIdx((i) => Math.max(0, i - 1));
    } else if (e.key === 'Tab' && suggestions.length) {
      e.preventDefault();
      setInput(suggestions[suggestIdx] ?? suggestions[0]);
    }
  }

  const validQueries = queries.filter((q) => q.part);
  const canStart = files.length > 0 && validQueries.length > 0 && !busy;
  const totalSize = files.reduce((n, f) => n + f.size, 0);

  return (
    <>
      <div className="panel">
        <h2>1. Noten auswählen</h2>
        <div
          className={'dropzone' + (over ? ' over' : '')}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
        >
          PDFs oder Ordner hierher ziehen
          <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
            <button className="btn" onClick={pickFiles} disabled={busy}>PDFs auswählen…</button>
            <button className="btn" onClick={pickFolder} disabled={busy}>Ordner auswählen…</button>
          </div>
        </div>
        {recentInputs.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="muted">Zuletzt geöffnet</span>
              <button className="btn small" onClick={() => onRecentChange([])}>Liste löschen</button>
            </div>
            <div className="chips" style={{ marginTop: 6 }}>
              {recentInputs.map((r) => (
                <span key={r} className="chip recent" title={r}>
                  <button className="recent-open" disabled={busy} onClick={() => addPaths([r])}>{shortPath(r)}</button>
                  <button onClick={() => onRecentChange(recentInputs.filter((x) => x !== r))} aria-label="Aus der Liste entfernen" title="Aus der Liste entfernen">✕</button>
                </span>
              ))}
            </div>
          </div>
        )}
        {files.length > 0 && (
          <>
            <div className="row" style={{ marginTop: 12, justifyContent: 'space-between' }}>
              <span className="muted">{files.length} PDF{files.length === 1 ? '' : 's'}, {formatBytes(totalSize)}</span>
              <button className="btn small danger" onClick={() => setFiles([])}>Liste leeren</button>
            </div>
            <div style={{ maxHeight: 280, overflow: 'auto', marginTop: 8 }}>
              <table className="files">
                <thead><tr><th>Datei</th><th>Ordner</th><th>Größe</th><th></th></tr></thead>
                <tbody>
                  {files.map((f) => (
                    <tr key={f.path}>
                      <td>{f.name}</td>
                      <td className="muted">{f.folder}</td>
                      <td className="muted">{formatBytes(f.size)}</td>
                      <td><button className="btn small" onClick={() => setFiles(files.filter((x) => x.path !== f.path))}>✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div className="panel">
        <h2>2. Gesuchte Stimmen</h2>
        <div className="row" style={{ position: 'relative' }}>
          <div style={{ position: 'relative' }}>
            <input
              ref={inputRef}
              type="text"
              placeholder="z.B. Trompete 1"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              style={{ width: 280 }}
            />
            {suggestions.length > 0 && (
              <div className="suggest">
                {suggestions.map((s, i) => (
                  <div key={s} className={i === suggestIdx ? 'active' : ''} onMouseDown={() => addQuery(s)}>{s}</div>
                ))}
              </div>
            )}
          </div>
          <button className="btn" onClick={() => addQuery(input)} disabled={!input.trim()}>Hinzufügen</button>
          <span className="hint">Enter fügt hinzu, Tab übernimmt den Vorschlag. Englische und italienische Namen gehen auch.</span>
        </div>
        <div className="chips" style={{ marginTop: 10 }}>
          {queries.map((q) => (
            <span key={q.raw} className={'chip' + (q.part ? '' : ' invalid')} title={q.part ? `Erkannt als: ${formatPart(q.part)}` : 'Nicht erkannt. Bitte anderen Namen versuchen.'}>
              {q.raw}
              {q.part && formatPart(q.part) !== q.raw && <span className="muted" style={{ fontWeight: 400 }}>→ {formatPart(q.part)}</span>}
              {!q.part && <span style={{ fontWeight: 400 }}>(unbekannt)</span>}
              <button onClick={() => setQueries(queries.filter((x) => x !== q))} aria-label="Entfernen">✕</button>
            </span>
          ))}
          {queries.length === 0 && <span className="muted">Noch keine Stimme gewählt.</span>}
        </div>
      </div>

      <div className="footer-actions">
        <button className="btn primary" disabled={!canStart} onClick={onStart}>
          Analysieren ({files.length} PDFs, {validQueries.length} Stimme{validQueries.length === 1 ? '' : 'n'})
        </button>
      </div>
    </>
  );
}
