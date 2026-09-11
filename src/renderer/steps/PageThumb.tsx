import { formatPart } from '@shared/instruments';
import type { PageAssignment, PartRef } from '@shared/types';
import type { AnalyzedEntry } from '../state';
import PartSelect, { selectValueOf } from './PartSelect';

export const KIND_LABEL = { stimme: 'Stimme', partitur: 'Partitur', sonstiges: 'kein Kopf', unsicher: 'unsicher' } as const;
export const SOURCE_LABEL = { text: 'Text', ocr: 'OCR', ki: 'KI', dateiname: 'Dateiname', manuell: 'manuell', fortsetzung: 'Folgeseite' } as const;

export function assignmentLabel(a: PageAssignment): string {
  if (a.kind === 'partitur') return 'Partitur';
  if (a.part) return formatPart(a.part);
  return KIND_LABEL[a.kind];
}

interface Props {
  entry: AnalyzedEntry;
  page: number;
  selected: boolean;
  /** Abgeblendet darstellen (Seite gehört nicht zur aktuellen Stimme) */
  dim?: boolean;
  knownParts: PartRef[];
  onToggle: (page: number, on: boolean) => void;
  onPreview: (page: number) => void;
  onAssign: (page: number, value: string) => void;
}

/** Miniatur einer Seite mit Häkchen, Quelle, erkannter Stimme und Korrekturfeld. */
export default function PageThumb({ entry, page, selected, dim, knownParts, onToggle, onPreview, onAssign }: Props) {
  const a = entry.analysis;
  const asg = a.assignments[page - 1];
  const pa = a.pages[page - 1];
  return (
    <div
      className={'thumb' + (selected ? ' selected' : '') + (dim ? ' dim' : '')}
      title={`Seite ${page}\n${assignmentLabel(asg)} (${SOURCE_LABEL[asg.source]}, ${Math.round(asg.confidence * 100)} %)\n${pa.text.slice(0, 200)}`}
    >
      <input className="check" type="checkbox" checked={selected} onChange={(e) => onToggle(page, e.target.checked)} />
      <img src={a.thumbnails[page - 1]} alt="" title="Klicken für Großansicht" onClick={() => onPreview(page)} />
      <div className="cap">
        <b>S. {page}</b>
        <span className={'badge ' + (asg.kind === 'stimme' ? (asg.source === 'fortsetzung' ? 'neutral' : 'ok') : asg.kind === 'unsicher' ? 'warn' : 'neutral')}>{SOURCE_LABEL[asg.source]}</span>
      </div>
      <span className="lbl">{assignmentLabel(asg)}</span>
      <PartSelect value={selectValueOf(asg)} knownParts={knownParts} onChange={(v) => onAssign(page, v)} />
    </div>
  );
}
