import { useMemo, useState } from 'react';
import { assignPages } from '@shared/assign';
import { formatPart, partKey } from '@shared/instruments';
import { parseQuery, samePart } from '@shared/matcher';
import type { PartRef, PageAssignment } from '@shared/types';
import { pieceTitle, selectForQuery } from '../analysis/select';
import Vorschau from './Vorschau';
import type { AnalyzedEntry, Query, Selection } from '../state';

interface Props {
  entries: Map<string, AnalyzedEntry>;
  queries: Query[];
  selections: Selection[];
  setSelections: (s: Selection[]) => void;
  includeUnnumbered: boolean;
  updateEntry: (e: AnalyzedEntry) => void;
  onBack: () => void;
  onNext: () => void;
  onReanalyze: (info: AnalyzedEntry['info']) => void;
  onReanalyzeAll: () => void;
  /** Testmodus: Großansicht des ersten Treffers sofort öffnen */
  autoPreview?: boolean;
}

const KIND_LABEL = { stimme: 'Stimme', partitur: 'Partitur', sonstiges: 'kein Kopf', unsicher: 'unsicher' } as const;
const SOURCE_LABEL = { text: 'Text', ocr: 'OCR', ki: 'KI', dateiname: 'Dateiname', manuell: 'manuell', fortsetzung: 'Folgeseite' } as const;

function assignmentLabel(a: PageAssignment): string {
  if (a.kind === 'partitur') return 'Partitur';
  if (a.part) return formatPart(a.part);
  return KIND_LABEL[a.kind];
}

export default function Kontrolle({ entries, queries, selections, setSelections, includeUnnumbered, updateEntry, onBack, onNext, onReanalyze, onReanalyzeAll, autoPreview }: Props) {
  const validQueries = queries.filter((q) => q.part);
  const [tab, setTab] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showMisses, setShowMisses] = useState(false);
  const [preview, setPreview] = useState<{ path: string; page: number } | null>(() => {
    if (!autoPreview) return null;
    for (const [path, set] of selections[0] ?? []) if (set.size) return { path, page: [...set][0] };
    return null;
  });
  const query = validQueries[tab];
  const files = useMemo(() => [...entries.values()], [entries]);

  // Alle im Lauf vorkommenden Stimmen (für manuelle Zuweisung)
  const knownParts = useMemo(() => {
    const m = new Map<string, PartRef>();
    for (const q of validQueries) m.set(partKey(q.part!), q.part!);
    for (const f of files) for (const p of f.analysis.pages) if (p.part) m.set(partKey(p.part), p.part);
    return [...m.values()].sort((a, b) => formatPart(a).localeCompare(formatPart(b), 'de'));
  }, [files, validQueries]);

  const sel = selections[tab];
  if (!query?.part) return <div className="panel">Keine gültige Stimme gewählt.</div>;
  if (!sel) return <div className="panel muted">Auswahl wird vorbereitet…</div>;

  const hits = selectForQuery(files, query.part, { includeUnnumbered });
  const hitPaths = new Set(hits.map((h) => h.file.info.path));
  const misses = files.filter((f) => !hitPaths.has(f.info.path));

  function setPage(path: string, page: number, on: boolean) {
    const next = selections.map((s) => new Map(s));
    const set = new Set(next[tab].get(path) ?? []);
    if (on) set.add(page); else set.delete(page);
    next[tab].set(path, set);
    setSelections(next);
  }

  function toggleExpanded(path: string) {
    const n = new Set(expanded);
    if (n.has(path)) n.delete(path); else n.add(path);
    setExpanded(n);
  }

  /** Manuelle Zuweisung einer Seite: ändert die Analyse, berechnet Folgeseiten neu, speichert im Cache. */
  async function assignManually(entry: AnalyzedEntry, page: number, value: string) {
    const pages = entry.analysis.pages.map((p) => ({ ...p }));
    const target = pages[page - 1];
    if (value === '__partitur') {
      target.kind = 'partitur'; target.part = undefined;
    } else if (value === '__none') {
      target.kind = 'sonstiges'; target.part = undefined;
    } else {
      const part = knownParts.find((p) => partKey(p) === value) ?? parseQuery(value);
      if (!part) return;
      target.kind = 'stimme'; target.part = part;
    }
    target.source = 'manuell';
    target.confidence = 1;
    const analysis = { ...entry.analysis, pages, assignments: assignPages(pages, entry.analysis.filenamePart) };
    const updated = { ...entry, analysis };
    await window.api.invoke('cache:set', entry.info, analysis);
    updateEntry(updated);
    // Auswahl für diese Datei in allen Tabs neu aus der Analyse ableiten
    const next = selections.map((s, qi) => {
      const m = new Map(s);
      const q = validQueries[qi].part!;
      const found = selectForQuery([updated], q, { includeUnnumbered })[0];
      m.set(entry.info.path, new Set(found?.pages ?? []));
      return m;
    });
    setSelections(next);
  }

  function selectedCount(path: string): number {
    return sel.get(path)?.size ?? 0;
  }

  const totalPages = [...sel.values()].reduce((n, s) => n + s.size, 0);
  const totalPieces = [...sel.values()].filter((s) => s.size > 0).length;

  function renderPageGrid(entry: AnalyzedEntry, only?: number[]) {
    const a = entry.analysis;
    const pagesToShow = only ?? a.assignments.map((x) => x.page);
    return (
      <div className="thumbs">
        {pagesToShow.map((pg) => {
          const asg = a.assignments[pg - 1];
          const pa = a.pages[pg - 1];
          const on = sel.get(entry.info.path)?.has(pg) ?? false;
          const matches = !!asg.part && samePart(asg.part, query.part!);
          return (
            <div
              key={pg}
              className={'thumb' + (on ? ' selected' : '') + (!on && !matches ? ' dim' : '')}
              title={`Seite ${pg}\n${assignmentLabel(asg)} (${SOURCE_LABEL[asg.source]}, ${Math.round(asg.confidence * 100)} %)\n${pa.text.slice(0, 200)}`}
            >
              <input className="check" type="checkbox" checked={on} onChange={(e) => setPage(entry.info.path, pg, e.target.checked)} />
              <img src={a.thumbnails[pg - 1]} alt="" title="Klicken für Großansicht" onClick={() => setPreview({ path: entry.info.path, page: pg })} />
              <div className="cap">
                <b>S. {pg}</b>
                <span className={'badge ' + (asg.kind === 'stimme' ? (asg.source === 'fortsetzung' ? 'neutral' : 'ok') : asg.kind === 'unsicher' ? 'warn' : 'neutral')}>{SOURCE_LABEL[asg.source]}</span>
              </div>
              <span className="lbl">{assignmentLabel(asg)}</span>
              <select value={asg.part && asg.kind !== 'partitur' ? partKey(asg.part) : asg.kind === 'partitur' ? '__partitur' : '__none'} onChange={(e) => assignManually(entry, pg, e.target.value)}>
                <option value="__none">– keine Stimme –</option>
                <option value="__partitur">Partitur</option>
                {knownParts.map((p) => <option key={partKey(p)} value={partKey(p)}>{formatPart(p)}</option>)}
              </select>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <>
      <div className="tabs">
        {validQueries.map((q, i) => (
          <button key={q.raw} className={i === tab ? 'active' : ''} onClick={() => setTab(i)}>
            {formatPart(q.part!)} <span className="muted">({[...selections[i].values()].filter((s) => s.size).length})</span>
          </button>
        ))}
      </div>

      <p className="muted">
        {totalPieces} Stück{totalPieces === 1 ? '' : 'e'}, {totalPages} Seiten für <b>{formatPart(query.part)}</b>. Klicke auf Seiten, um sie ab- oder zuzuwählen. Über das Auswahlfeld unter einer Seite kannst du die erkannte Stimme korrigieren; Folgeseiten werden dann automatisch neu zugeordnet.
      </p>

      {hits.map((h) => {
        const path = h.file.info.path;
        const isOpen = expanded.has(path);
        return (
          <div key={path} className={'piece' + (h.uncertain ? ' uncertain' : '')}>
            <div className="piece-head">
              <span className="title">{pieceTitle(h.file.info)}</span>
              {h.uncertain && <span className="badge warn">unsicher</span>}
              <span className="muted">{h.labels.join(', ')}</span>
              <span className="badge neutral">{selectedCount(path)} / {h.file.analysis.pageCount} Seiten</span>
              <button className="btn small" onClick={() => toggleExpanded(path)}>{isOpen ? 'Nur Treffer' : 'Alle Seiten'}</button>
              <button className="btn small" title="Cache verwerfen und neu erkennen" onClick={() => onReanalyze(h.file.info)}>↻</button>
            </div>
            {renderPageGrid(h.file, isOpen ? undefined : Array.from(new Set([...h.pages, ...(sel.get(path) ?? [])])).sort((a, b) => a - b))}
          </div>
        );
      })}

      {misses.length > 0 && (
        <div className="panel">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <b>{misses.length} Stück{misses.length === 1 ? '' : 'e'} ohne Treffer für {formatPart(query.part)}</b>
            <button className="btn small" onClick={() => setShowMisses(!showMisses)}>{showMisses ? 'Ausblenden' : 'Anzeigen'}</button>
          </div>
          {showMisses && misses.map((m) => {
            const path = m.info.path;
            const isOpen = expanded.has(path);
            const found = new Set(m.analysis.pages.filter((p) => p.part).map((p) => formatPart(p.part!)));
            return (
              <div key={path} className="piece">
                <div className="piece-head">
                  <span className="title">{pieceTitle(m.info)}</span>
                  <span className="muted" style={{ fontSize: 12 }}>{found.size ? `gefunden: ${[...found].join(', ')}` : 'keine Stimme erkannt'}</span>
                  <span className="badge neutral">{m.analysis.pageCount} Seiten</span>
                  <button className="btn small" onClick={() => toggleExpanded(path)}>{isOpen ? 'Zuklappen' : 'Seiten zeigen'}</button>
                  <button className="btn small" title="Cache verwerfen und neu erkennen" onClick={() => onReanalyze(m.info)}>↻</button>
                </div>
                {isOpen && renderPageGrid(m)}
              </div>
            );
          })}
        </div>
      )}

      {preview && entries.get(preview.path) && (
        <Vorschau
          entry={entries.get(preview.path)!}
          page={preview.page}
          selected={sel.get(preview.path)?.has(preview.page) ?? false}
          knownParts={knownParts}
          onToggle={(pg, on) => setPage(preview.path, pg, on)}
          onAssign={(pg, value) => assignManually(entries.get(preview.path)!, pg, value)}
          onNavigate={(pg) => setPreview({ path: preview.path, page: pg })}
          onClose={() => setPreview(null)}
        />
      )}

      <div className="footer-actions">
        <button className="btn" onClick={onBack}>Zurück zur Auswahl</button>
        <button className="btn" onClick={onReanalyzeAll} title="Alle Dateien erneut analysieren (Cache wird genutzt)">Analyse wiederholen</button>
        <button className="btn primary" onClick={onNext} disabled={selections.every((s) => [...s.values()].every((x) => x.size === 0))}>Weiter zum Export</button>
      </div>
    </>
  );
}
