import { useEffect, useState } from 'react';
import { formatPart, partKey } from '@shared/instruments';
import type { PartRef } from '@shared/types';
import { renderLarge } from '../analysis/preview';
import type { AnalyzedEntry } from '../state';

interface Props {
  entry: AnalyzedEntry;
  page: number;
  selected: boolean;
  knownParts: PartRef[];
  onToggle: (page: number, on: boolean) => void;
  onAssign: (page: number, value: string) => void;
  onNavigate: (page: number) => void;
  onClose: () => void;
}

const SOURCE_LABEL = { text: 'Textlayer', ocr: 'OCR', ki: 'KI', dateiname: 'Dateiname', manuell: 'manuell', fortsetzung: 'Folgeseite' } as const;

export default function Vorschau({ entry, page, selected, knownParts, onToggle, onAssign, onNavigate, onClose }: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const a = entry.analysis.assignments[page - 1];
  const pa = entry.analysis.pages[page - 1];
  const total = entry.analysis.pageCount;

  useEffect(() => {
    let alive = true;
    setSrc(null);
    setError(null);
    renderLarge(entry.info.path, page)
      .then((u) => { if (alive) setSrc(u); })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : String(e)); });
    return () => { alive = false; };
  }, [entry.info.path, page]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight' && page < total) onNavigate(page + 1);
      else if (e.key === 'ArrowLeft' && page > 1) onNavigate(page - 1);
      else if (e.key === ' ') { e.preventDefault(); onToggle(page, !selected); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [page, total, selected, onClose, onNavigate, onToggle]);

  const label = a.kind === 'partitur' ? 'Partitur' : a.part ? formatPart(a.part) : a.kind === 'unsicher' ? 'unsicher' : 'keine Stimme';
  const selectValue = a.part && a.kind !== 'partitur' ? partKey(a.part) : a.kind === 'partitur' ? '__partitur' : '__none';

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="preview" onClick={(e) => e.stopPropagation()}>
        <div className="preview-side">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <b>{entry.info.name.replace(/\.pdf$/i, '')}</b>
            <button className="btn small" onClick={onClose} aria-label="Schließen">✕</button>
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn small" disabled={page <= 1} onClick={() => onNavigate(page - 1)}>◀</button>
            <span>Seite {page} / {total}</span>
            <button className="btn small" disabled={page >= total} onClick={() => onNavigate(page + 1)}>▶</button>
          </div>
          <p style={{ marginBottom: 4 }}>
            <span className={'badge ' + (a.kind === 'stimme' ? 'ok' : a.kind === 'unsicher' ? 'warn' : 'neutral')}>{SOURCE_LABEL[a.source]}</span>
            {' '}<b>{label}</b>
            {a.alsoParts?.length ? <span className="muted"> · auch {a.alsoParts.map(formatPart).join(', ')}</span> : null}
            <span className="muted"> · {Math.round(a.confidence * 100)} %</span>
          </p>
          {a.headerPage && a.headerPage !== page && <p className="hint">Überschrift stand auf Seite {a.headerPage}.</p>}
          <label className="row" style={{ marginTop: 8 }}>
            <input type="checkbox" checked={selected} onChange={(e) => onToggle(page, e.target.checked)} />
            <span>In den Export aufnehmen</span>
          </label>
          <div style={{ marginTop: 10 }}>
            <div className="hint">Stimme dieser Seite korrigieren</div>
            <select value={selectValue} onChange={(e) => onAssign(page, e.target.value)} style={{ width: '100%' }}>
              <option value="__none">– keine Stimme –</option>
              <option value="__partitur">Partitur</option>
              {knownParts.map((p) => <option key={partKey(p)} value={partKey(p)}>{formatPart(p)}</option>)}
            </select>
          </div>
          <div style={{ marginTop: 12 }}>
            <div className="hint">Erkannter Text im Kopfbereich</div>
            <div className="log" style={{ maxHeight: 220 }}>{pa.text.trim() || '(nichts erkannt)'}</div>
          </div>
          <p className="hint" style={{ marginTop: 12 }}>Tasten: ◀ ▶ blättern, Leertaste wählt an/ab, Esc schließt.</p>
        </div>
        <div className="preview-page">
          {src ? <img src={src} alt={`Seite ${page}`} /> : error ? <span className="muted">Fehler: {error}</span> : <span className="muted">Seite wird gerendert…</span>}
        </div>
      </div>
    </div>
  );
}
