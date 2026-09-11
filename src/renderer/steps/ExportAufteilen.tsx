import { useEffect, useMemo, useState } from 'react';
import type { ExportExistingResult, ExportJob, ExportProgress, ExportResult } from '@shared/ipc-types';
import { pieceTitle, sanitizeFileName, uniqueSubdirs } from '@shared/names';
import { splitFile } from '@shared/split';
import type { AnalyzedEntry, Selection } from '../state';
import { OpenButtons, OutputFolderField, ProgressPanel } from './ExportBits';

interface Props {
  entries: Map<string, AnalyzedEntry>;
  order: string[];
  splitSelection: Selection;
  outputDir: string | null;
  setOutputDir: (d: string | null) => void;
  onBack: () => void;
  onRestart: () => void;
}

/** Baut die Export-Aufträge des Aufteilen-Modus: pro Stück ein Unterordner, pro Stimme eine Datei. */
export function buildSplitJobs(files: AnalyzedEntry[], splitSelection: Selection): { jobs: ExportJob[]; skipped: { entry: AnalyzedEntry; reason: string }[]; subdirs: Map<string, string> } {
  const splits = files.map((f) => ({ f, s: splitFile(f.analysis, splitSelection.get(f.info.path)) }));
  const exportable = splits.filter((x) => !x.s.skipped);
  const subdirs = uniqueSubdirs(exportable.map((x) => x.f.info));
  const jobs: ExportJob[] = [];
  for (const { f, s } of exportable) {
    const subdir = subdirs.get(f.info.path)!;
    for (const b of s.buckets) {
      jobs.push({ fileName: b.label, subdir, pieces: [{ path: f.info.path, title: pieceTitle(f.info), pages: b.pages }] });
    }
  }
  const skipped = splits
    .filter((x) => x.s.skipped)
    .map((x) => ({ entry: x.f, reason: x.s.skipped === 'einzelstimme' ? 'bereits Einzelstimme' : 'keine Seiten gewählt' }));
  return { jobs, skipped, subdirs };
}

export default function ExportAufteilen({ entries, order, splitSelection, outputDir, setOutputDir, onBack, onRestart }: Props) {
  const files = useMemo(() => order.map((p) => entries.get(p)).filter((e): e is AnalyzedEntry => !!e), [entries, order]);
  const { jobs, skipped, subdirs } = useMemo(() => buildSplitJobs(files, splitSelection), [files, splitSelection]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [results, setResults] = useState<ExportResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => window.api.on('export:progress', (p) => setProgress(p as ExportProgress)), []);

  const bySubdir = useMemo(() => {
    const m = new Map<string, ExportJob[]>();
    for (const j of jobs) m.set(j.subdir!, [...(m.get(j.subdir!) ?? []), j]);
    return m;
  }, [jobs]);

  async function run() {
    if (!outputDir) return;
    setError(null);
    try {
      const existing = (await window.api.invoke('export:existing', { outputDir, jobs })) as ExportExistingResult;
      if (existing.count > 0) {
        const ok = window.confirm(`${existing.count} vorhandene Datei${existing.count === 1 ? '' : 'en'} im Zielordner ${existing.count === 1 ? 'wird' : 'werden'} ersetzt. Fortfahren?`);
        if (!ok) return;
      }
      setRunning(true);
      const r = (await window.api.invoke('export:run', { outputDir, jobs, overwrite: true })) as ExportResult[];
      setResults(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  const resultGroups = useMemo(() => {
    const m = new Map<string, ExportResult[]>();
    for (const r of results ?? []) m.set(r.subdir ?? '', [...(m.get(r.subdir ?? '') ?? []), r]);
    return m;
  }, [results]);

  return (
    <>
      <div className="panel">
        <h2>Export</h2>
        <OutputFolderField outputDir={outputDir} setOutputDir={setOutputDir} />
        <p className="hint">Pro Stück entsteht ein Unterordner mit einer PDF je Stimme. Unterordner des Eingabeordners werden übernommen. Vorhandene Dateien werden nach Rückfrage ersetzt. Die Originaldateien bleiben unverändert.</p>
        <div style={{ maxHeight: 360, overflow: 'auto', marginTop: 8 }}>
          <table className="plan">
            <thead><tr><th>Unterordner</th><th>Dateien</th></tr></thead>
            <tbody>
              {[...bySubdir.entries()].map(([subdir, js]) => (
                <tr key={subdir}>
                  <td>{subdir}/</td>
                  <td className="muted">{js.map((j) => `${sanitizeFileName(j.fileName)}.pdf (${j.pieces[0].pages.length})`).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {skipped.length > 0 && (
        <div className="panel">
          <h2>Übersprungen</h2>
          {skipped.map((s) => (
            <p key={s.entry.info.path} style={{ margin: '4px 0' }}><b>{pieceTitle(s.entry.info)}</b> <span className="muted">{s.reason}</span></p>
          ))}
        </div>
      )}

      {running && progress && <ProgressPanel progress={progress} />}
      {error && <div className="panel" style={{ borderColor: 'var(--bad)' }}>Fehler beim Export: {error}</div>}

      {results && (
        <div className="panel">
          <h2>Fertig</h2>
          {[...resultGroups.entries()].map(([subdir, rs]) => (
            <div key={subdir} style={{ marginBottom: 10 }}>
              <div className="row">
                <b>{subdir}/</b>
                <span className="muted">{rs.length} Datei{rs.length === 1 ? '' : 'en'}, {rs.reduce((n, r) => n + r.pageCount, 0)} Seiten</span>
                <button className="btn small" onClick={() => window.api.invoke('shell:showInFolder', rs[0].outputPath)}>Ordner zeigen</button>
              </div>
              <div className="row" style={{ marginLeft: 16, marginTop: 4, gap: 6 }}>
                {rs.map((r) => (
                  <span key={r.outputPath} className="row" style={{ gap: 4 }}>
                    <span className="muted" style={{ fontSize: 12 }}>{r.fileName}.pdf ({r.pageCount})</span>
                    <OpenButtons path={r.outputPath} />
                  </span>
                ))}
              </div>
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
          <button className="btn primary" onClick={run} disabled={!outputDir || running || jobs.length === 0}>
            {running ? 'Exportiere…' : `${jobs.length} PDF${jobs.length === 1 ? '' : 's'} in ${bySubdir.size} Ordner exportieren`}
          </button>
        )}
      </div>
    </>
  );
}
