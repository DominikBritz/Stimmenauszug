import { useEffect, useState } from 'react';
import { formatPart } from '@shared/instruments';
import type { ExportJob, ExportProgress, ExportResult } from '@shared/ipc-types';
import { pieceTitle } from '../analysis/select';
import type { AnalyzedEntry, Query, Selection } from '../state';

interface Props {
  entries: Map<string, AnalyzedEntry>;
  queries: Query[];
  selections: Selection[];
  order: string[];
  outputDir: string | null;
  setOutputDir: (d: string | null) => void;
  onBack: () => void;
  onRestart: () => void;
}

export default function Export({ entries, queries, selections, order, outputDir, setOutputDir, onBack, onRestart }: Props) {
  const validQueries = queries.filter((q) => q.part);
  const [names, setNames] = useState<string[]>(() => validQueries.map((q) => formatPart(q.part!)));
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [results, setResults] = useState<ExportResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => window.api.on('export:progress', (p) => setProgress(p as ExportProgress)), []);

  const jobs: ExportJob[] = validQueries.map((_, qi) => ({
    fileName: names[qi],
    pieces: order
      .map((path) => entries.get(path))
      .filter((e): e is AnalyzedEntry => !!e)
      .map((e) => ({ path: e.info.path, title: pieceTitle(e.info), pages: [...(selections[qi].get(e.info.path) ?? [])].sort((a, b) => a - b) }))
      .filter((p) => p.pages.length > 0),
  }));

  async function pickOutput() {
    const d = (await window.api.invoke('dialog:outputFolder')) as string | null;
    if (d) setOutputDir(d);
  }

  async function run() {
    if (!outputDir) return;
    setRunning(true);
    setError(null);
    try {
      const r = (await window.api.invoke('export:run', { outputDir, jobs: jobs.filter((j) => j.pieces.length) })) as ExportResult[];
      setResults(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  const total = jobs.reduce((n, j) => n + j.pieces.length, 0);
  const missing = validQueries.map((q, qi) => ({
    q,
    files: order.map((p) => entries.get(p)).filter((e): e is AnalyzedEntry => !!e && !(selections[qi].get(e.info.path)?.size)),
  }));

  return (
    <>
      <div className="panel">
        <h2>Export</h2>
        <div className="field">
          <span>Zielordner</span>
          <div className="row">
            <span className="muted">{outputDir ?? 'noch nicht gewählt'}</span>
            <button className="btn small" onClick={pickOutput}>Wählen…</button>
          </div>
        </div>
        {validQueries.map((q, qi) => (
          <div className="field" key={q.raw}>
            <span>{formatPart(q.part!)}</span>
            <div className="row">
              <input type="text" value={names[qi]} onChange={(e) => setNames(names.map((n, i) => (i === qi ? e.target.value : n)))} style={{ width: 260 }} />
              <span className="muted">.pdf · {jobs[qi].pieces.length} Stücke, {jobs[qi].pieces.reduce((n, p) => n + p.pages.length, 0)} Seiten</span>
            </div>
          </div>
        ))}
        <p className="hint">Die Stücke landen in der Reihenfolge der Dateiliste in der PDF, mit einem Lesezeichen pro Stück. Die Originaldateien bleiben unverändert.</p>
      </div>

      {missing.some((m) => m.files.length) && (
        <div className="panel">
          <h2>Ohne Treffer</h2>
          {missing.filter((m) => m.files.length).map((m) => (
            <p key={m.q.raw}><b>{formatPart(m.q.part!)}:</b> <span className="muted">{m.files.map((f) => pieceTitle(f.info)).join(', ')}</span></p>
          ))}
        </div>
      )}

      {running && progress && (
        <div className="panel">
          <div className="progress"><div style={{ width: `${Math.round(((progress.jobIndex * 0 + progress.pieceIndex + 1) / Math.max(1, progress.totalPieces)) * 100)}%` }} /></div>
          <p className="muted">{progress.message}</p>
        </div>
      )}
      {error && <div className="panel" style={{ borderColor: 'var(--bad)' }}>Fehler beim Export: {error}</div>}

      {results && (
        <div className="panel">
          <h2>Fertig</h2>
          {results.map((r) => (
            <div className="row" key={r.outputPath} style={{ marginBottom: 6 }}>
              <b>{r.fileName}.pdf</b>
              <span className="muted">{r.pieceCount} Stücke, {r.pageCount} Seiten</span>
              <button className="btn small" onClick={() => window.api.invoke('shell:openPath', r.outputPath)}>Öffnen</button>
              <button className="btn small" onClick={() => window.api.invoke('shell:showInFolder', r.outputPath)}>Im Ordner zeigen</button>
            </div>
          ))}
          {results.length === 0 && <p className="muted">Nichts exportiert.</p>}
        </div>
      )}

      <div className="footer-actions">
        <button className="btn" onClick={onBack} disabled={running}>Zurück</button>
        {results ? (
          <button className="btn primary" onClick={onRestart}>Neuer Durchlauf</button>
        ) : (
          <button className="btn primary" onClick={run} disabled={!outputDir || running || total === 0}>
            {running ? 'Exportiere…' : `${validQueries.length} PDF${validQueries.length === 1 ? '' : 's'} exportieren`}
          </button>
        )}
      </div>
    </>
  );
}
