import { useState } from 'react';
import { formatPart, partKey } from '@shared/instruments';
import { parseQuery } from '@shared/matcher';
import type { PageAssignment, PartRef } from '@shared/types';
import { NONE_VALUE, PARTITUR_VALUE } from '../analysis/manual';

const NEW_VALUE = '__new';

/** Wert des Auswahlfelds für eine Seitenzuordnung. */
export function selectValueOf(a: PageAssignment): string {
  if (a.kind === 'partitur') return PARTITUR_VALUE;
  return a.part ? partKey(a.part) : NONE_VALUE;
}

interface Props {
  value: string;
  knownParts: PartRef[];
  onChange: (value: string) => void;
  style?: React.CSSProperties;
}

/** Auswahlfeld zur Korrektur der Stimme einer Seite, mit Freitext für eine noch unbekannte Stimme. */
export default function PartSelect({ value, knownParts, onChange, style }: Props) {
  const [custom, setCustom] = useState<string | null>(null);

  function submit() {
    const text = (custom ?? '').trim();
    if (!text) { setCustom(null); return; }
    if (!parseQuery(text)) {
      alert(`„${text}“ wurde nicht als Stimme erkannt. Beispiele: Horn 3 in F, Tenorhorn, 2. Stimme`);
      return;
    }
    setCustom(null);
    onChange(text);
  }

  if (custom !== null) {
    return (
      <input
        type="text"
        autoFocus
        value={custom}
        placeholder="z.B. Horn 3 in F"
        title="Enter übernimmt, Esc bricht ab"
        style={style}
        onChange={(e) => setCustom(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); submit(); }
          else if (e.key === 'Escape') { e.preventDefault(); setCustom(null); }
          e.stopPropagation();
        }}
        onBlur={() => setCustom(null)}
      />
    );
  }
  return (
    <select value={value} style={style} onChange={(e) => (e.target.value === NEW_VALUE ? setCustom('') : onChange(e.target.value))}>
      <option value={NONE_VALUE}>– keine Stimme –</option>
      <option value={PARTITUR_VALUE}>Partitur</option>
      {knownParts.map((p) => <option key={partKey(p)} value={partKey(p)}>{formatPart(p)}</option>)}
      <option value={NEW_VALUE}>Neue Stimme…</option>
    </select>
  );
}
