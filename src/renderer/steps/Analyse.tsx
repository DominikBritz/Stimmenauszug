import { useEffect, useRef, useState } from 'react';
import type { FileInfo } from '@shared/ipc-types';
import type { Settings } from '@shared/settings';
import { analyzeFile, type PipelineProgress } from '../analysis/pipeline';
import type { AnalyzedEntry } from '../state';

interface Props {
  files: FileInfo[];
  settings: Settings;
  workers: number;
  existing: Map<string, AnalyzedEntry>;
  onDone: (entries: Map<string, AnalyzedEntry>, errors: { file: FileInfo; error: string }[]) => void;
  onCancel: () => void;
}

const PHASE_LABEL: Record<PipelineProgress['phase'], string> = {
  cache: 'Cache prüfen', lesen: 'Datei lesen', text: 'Textlayer lesen', ocr: 'Texterkennung', ki: 'KI-Erkennung', fertig: 'fertig',
};

export default function Analyse({ files, settings, workers, existing, onDone, onCancel }: Props) {
  const [fileIdx, setFileIdx] = useState(0);
  const [progress, setProgress] = useState<PipelineProgress | null>(null);
  const [pagesDone, setPagesDone] = useState(0);
  const [errors, setErrors] = useState<{ file: FileInfo; error: string }[]>([]);
  const [cachedCount, setCachedCount] = useState(0);
  const startedAt = useRef(Date.now());
  const abort = useRef(new AbortController());

  useEffect(() => {
    const ctrl = abort.current;
    const results = new Map(existing);
    const errs: { file: FileInfo; error: string }[] = [];
    let cached = 0;
    (async () => {
      for (let i = 0; i < files.length; i++) {
        if (ctrl.signal.aborted) break;
        const info = files[i];
        setFileIdx(i);
        if (results.has(info.path)) { cached++; setCachedCount(cached); continue; }
        try {
          const seen = new Set<number>();
          let wasCached = true;
          const analysis = await analyzeFile(info, {
            settings,
            workers,
            signal: ctrl.signal,
            onProgress: (p) => {
              if (p.phase !== 'cache') wasCached = false;
              setProgress(p);
              if (p.page > 0 && !seen.has(p.page) && (p.phase === 'fertig' || p.phase === 'ocr' || p.phase === 'text')) {
                seen.add(p.page);
                setPagesDone((n) => n + 1);
              }
            },
          });
          if (wasCached) { cached++; setCachedCount(cached); }
          results.set(info.path, { info, analysis });
        } catch (e) {
          if (e instanceof DOMException && e.name === 'AbortError') break;
          const msg = e instanceof Error ? e.message : String(e);
          errs.push({ file: info, error: msg });
          setErrors([...errs]);
        }
      }
      if (!ctrl.signal.aborted) onDone(results, errs);
    })();
    return () => { /* Abbruch über Button */ };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const elapsed = Math.round((Date.now() - startedAt.current) / 1000);
  const pct = files.length ? Math.round((fileIdx / files.length) * 100) : 0;

  return (
    <div className="panel">
      <h2>Analyse läuft…</h2>
      <div className="progress"><div style={{ width: `${pct}%` }} /></div>
      <p>
        Datei {Math.min(fileIdx + 1, files.length)} von {files.length}
        {cachedCount > 0 && <span className="muted"> · {cachedCount} aus dem Cache</span>}
        {pagesDone > 0 && <span className="muted"> · {pagesDone} Seiten erkannt</span>}
        <span className="muted"> · {elapsed}s</span>
      </p>
      {progress && (
        <p className="muted">
          {progress.file.name}
          {progress.pageCount > 0 && ` – Seite ${progress.page}/${progress.pageCount}`}
          {' – '}{PHASE_LABEL[progress.phase]}
        </p>
      )}
      <p className="hint">Erste Durchläufe mit gescannten Noten dauern etwa 1 bis 2 Sekunden pro Seite. Ergebnisse werden zwischengespeichert, der nächste Lauf ist sofort fertig.</p>
      {errors.length > 0 && (
        <div className="log">{errors.map((e) => `${e.file.name}: ${e.error}`).join('\n')}</div>
      )}
      <div className="footer-actions">
        <button className="btn" onClick={() => { abort.current.abort(); onCancel(); }}>Abbrechen</button>
      </div>
    </div>
  );
}
