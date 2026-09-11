import { useMemo, useState } from 'react';
import { formatPart, partKey } from '@shared/instruments';
import { pieceTitle } from '@shared/names';
import { splitFile, type SplitBucket, type SplitWarning } from '@shared/split';
import type { PartRef } from '@shared/types';
import { applyManualAssignment } from '../analysis/manual';
import PageThumb from './PageThumb';
import Vorschau from './Vorschau';
import type { AnalyzedEntry, Selection } from '../state';

interface Props {
  entries: Map<string, AnalyzedEntry>;
  /** Reihenfolge der Dateiliste */
  order: string[];
  /** Einbezogene Seiten je Datei; fehlt ein Eintrag, gelten alle Seiten */
  splitSelection: Selection;
  setSplitSelection: (s: Selection) => void;
  updateEntry: (e: AnalyzedEntry) => void;
  onBack: () => void;
  onNext: () => void;
  onReanalyze: (info: AnalyzedEntry['info']) => void;
  onReanalyzeAll: () => void;
}

const WARN_LABEL: Record<SplitWarning, string> = { unsicher: 'unsicher', mehrfach: 'mehrfach', zweitbezeichnung: 'auch als Zweitstimme' };
const WARN_TITLE: Record<SplitWarning, string> = {
  unsicher: 'Mindestens eine Seite ist nur unsicher zugeordnet',
  mehrfach: 'Diese Stimme kommt an mehreren Stellen vor; die Abschnitte werden in eine Datei zusammengeführt',
  zweitbezeichnung: 'Mindestens ein Blatt gehört über eine Klammer wie „(Bariton, Posaune 2)“ hierher und liegt auch in der Hauptstimme',
};

export function allPages(entry: AnalyzedEntry): Set<number> {
  return new Set(entry.analysis.assignments.map((a) => a.page));
}

export default function KontrolleAufteilen({ entries, order, splitSelection, setSplitSelection, updateEntry, onBack, onNext, onReanalyze, onReanalyzeAll }: Props) {
  const files = useMemo(() => order.map((p) => entries.get(p)).filter((e): e is AnalyzedEntry => !!e), [entries, order]);
  const [byPages, setByPages] = useState<Set<string>>(new Set());
  const [openSkipped, setOpenSkipped] = useState<Set<string>>(new Set());

  const knownParts = useMemo(() => {
    const m = new Map<string, PartRef>();
    for (const f of files) for (const p of f.analysis.pages) if (p.part) m.set(partKey(p.part), p.part);
    return [...m.values()].sort((a, b) => formatPart(a).localeCompare(formatPart(b), 'de'));
  }, [files]);

  const splits = useMemo(() => new Map(files.map((f) => [f.info.path, splitFile(f.analysis, splitSelection.get(f.info.path))])), [files, splitSelection]);

  const [preview, setPreview] = useState<{ path: string; page: number } | null>(null);

  function isIncluded(path: string, page: number): boolean {
    const set = splitSelection.get(path);
    return set ? set.has(page) : true;
  }
  function setPage(path: string, page: number, on: boolean) {
    const entry = entries.get(path);
    if (!entry) return;
    const next = new Map(splitSelection);
    const set = new Set(next.get(path) ?? allPages(entry));
    if (on) set.add(page); else set.delete(page);
    next.set(path, set);
    setSplitSelection(next);
  }
  function toggle(set: Set<string>, setter: (s: Set<string>) => void, path: string) {
    const n = new Set(set);
    if (n.has(path)) n.delete(path); else n.add(path);
    setter(n);
  }

  /** Manuelle Zuweisung: Analyse ändern, Folgeseiten neu berechnen, im Cache speichern, Auswahl der Datei zurücksetzen. */
  async function assignManually(entry: AnalyzedEntry, page: number, value: string) {
    const updated = applyManualAssignment(entry, page, value, knownParts);
    if (!updated) return;
    await window.api.invoke('cache:set', entry.info, updated.analysis);
    updateEntry(updated);
    const next = new Map(splitSelection);
    next.delete(entry.info.path);
    setSplitSelection(next);
  }

  function thumbs(entry: AnalyzedEntry, pages: number[]) {
    return (
      <div className="thumbs">
        {pages.map((pg) => (
          <PageThumb
            key={pg}
            entry={entry}
            page={pg}
            selected={isIncluded(entry.info.path, pg)}
            knownParts={knownParts}
            onToggle={(p, v) => setPage(entry.info.path, p, v)}
            onPreview={(p) => setPreview({ path: entry.info.path, page: p })}
            onAssign={(p, v) => assignManually(entry, p, v)}
          />
        ))}
      </div>
    );
  }

  function bucketRow(entry: AnalyzedEntry, b: SplitBucket) {
    return (
      <div className="bucket" key={b.key}>
        <div className="bucket-head">
          <b>{b.label}.pdf</b>
          <span className="muted">{b.pages.length} Seite{b.pages.length === 1 ? '' : 'n'}</span>
          {b.warnings.map((w) => <span key={w} className="badge warn" title={WARN_TITLE[w]}>{WARN_LABEL[w]}</span>)}
        </div>
        {thumbs(entry, b.pages)}
      </div>
    );
  }

  const exportable = files.filter((f) => !splits.get(f.info.path)?.skipped);
  const skipped = files.filter((f) => splits.get(f.info.path)?.skipped);
  const totalFiles = exportable.reduce((n, f) => n + (splits.get(f.info.path)?.buckets.length ?? 0), 0);
  const totalPages = exportable.reduce((n, f) => n + (splits.get(f.info.path)?.buckets.reduce((m, b) => m + b.pages.length, 0) ?? 0), 0);

  return (
    <>
      <p className="muted">
        {exportable.length} Stück{exportable.length === 1 ? '' : 'e'}, {totalFiles} Datei{totalFiles === 1 ? '' : 'en'} mit {totalPages} Seiten.
        {skipped.length > 0 && <> {skipped.length} Stück{skipped.length === 1 ? '' : 'e'} übersprungen.</>}
        {' '}Prüfe die Abschnitte je Stück. Über das Auswahlfeld unter einer Seite korrigierst du die Stimme, Folgeseiten ziehen mit; „Neue Stimme…“ legt eine noch nicht erkannte Stimme an. Abgewählte Seiten werden nicht exportiert.
      </p>

      {files.map((entry) => {
        const path = entry.info.path;
        const s = splits.get(path)!;
        const pagesView = byPages.has(path);
        const hasWarn = s.buckets.some((b) => b.warnings.includes('unsicher'));
        const onlySonstiges = !s.skipped && s.buckets.every((b) => b.kind !== 'stimme');
        if (s.skipped) {
          const isOpen = openSkipped.has(path);
          const found = entry.analysis.filenamePart ? formatPart(entry.analysis.filenamePart) : undefined;
          return (
            <div key={path} className="piece skipped">
              <div className="piece-head">
                <span className="title">{pieceTitle(entry.info)}</span>
                {entry.info.folder && <span className="muted" style={{ fontSize: 12 }}>{entry.info.folder}</span>}
                <span className="badge neutral">{s.skipped === 'einzelstimme' ? `bereits Einzelstimme${found ? `: ${found}` : ''}` : 'keine Seiten gewählt'}</span>
                <span className="badge neutral">{entry.analysis.pageCount} Seiten</span>
                <button className="btn small" onClick={() => toggle(openSkipped, setOpenSkipped, path)}>{isOpen ? 'Zuklappen' : 'Seiten zeigen'}</button>
                <button className="btn small" title="Cache verwerfen und neu erkennen" onClick={() => onReanalyze(entry.info)}>↻</button>
              </div>
              {isOpen && thumbs(entry, entry.analysis.assignments.map((a) => a.page))}
            </div>
          );
        }
        return (
          <div key={path} className={'piece' + (hasWarn || onlySonstiges ? ' uncertain' : '')}>
            <div className="piece-head">
              <span className="title">{pieceTitle(entry.info)}</span>
              {entry.info.folder && <span className="muted" style={{ fontSize: 12 }}>{entry.info.folder}</span>}
              {onlySonstiges && <span className="badge warn" title="Auf keiner Seite wurde eine Stimme erkannt">keine Stimme erkannt</span>}
              <span className="badge neutral">{s.buckets.length} Datei{s.buckets.length === 1 ? '' : 'en'} · {entry.analysis.pageCount} Seiten</span>
              <button className="btn small" onClick={() => toggle(byPages, setByPages, path)}>{pagesView ? 'Nach Stimme' : 'Seitenfolge'}</button>
              <button className="btn small" title="Cache verwerfen und neu erkennen" onClick={() => onReanalyze(entry.info)}>↻</button>
            </div>
            {pagesView ? thumbs(entry, entry.analysis.assignments.map((a) => a.page)) : s.buckets.map((b) => bucketRow(entry, b))}
          </div>
        );
      })}

      {preview && entries.get(preview.path) && (
        <Vorschau
          entry={entries.get(preview.path)!}
          page={preview.page}
          selected={isIncluded(preview.path, preview.page)}
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
        <button className="btn primary" onClick={onNext} disabled={totalFiles === 0}>Weiter zum Export</button>
      </div>
    </>
  );
}
