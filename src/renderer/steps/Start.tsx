import type { Mode } from '../state';

interface Props {
  onChoose: (mode: Mode) => void;
}

const TILES: { mode: Mode; icon: string; title: string; text: string; scheme: string }[] = [
  {
    mode: 'suchen',
    icon: '🔎',
    title: 'Stimmen heraussuchen',
    text: 'Eine oder mehrere Stimmen aus allen Stücken eines Ordners finden und je Stimme in eine PDF legen, mit einem Lesezeichen pro Stück. Für die Notenmappe einer Musikerin.',
    scheme: 'Trompete 1.pdf\n  ├ Böhmischer Traum\n  ├ Amsel Polka\n  └ …',
  },
  {
    mode: 'aufteilen',
    icon: '✂️',
    title: 'Stimmen aufteilen',
    text: 'Jedes Stück in eine PDF pro Stimme zerlegen, benannt nach der Stimme. Partitur und Restseiten getrennt. Für das Notenarchiv.',
    scheme: 'Böhmischer Traum/\n  ├ Trompete 1 in B.pdf\n  ├ Tenorhorn in B.pdf\n  └ Partitur.pdf',
  },
];

export default function Start({ onChoose }: Props) {
  return (
    <div className="start">
      <h1>Was möchtest du tun?</h1>
      <p className="lead">Beide Werkzeuge lesen die Überschrift jeder Seite per Texterkennung. Die Originale bleiben unverändert.</p>
      <div className="tiles">
        {TILES.map((t) => (
          <button key={t.mode} className="tile" onClick={() => onChoose(t.mode)}>
            <div className="icon" aria-hidden>{t.icon}</div>
            <h3>{t.title}</h3>
            <p>{t.text}</p>
            <div className="scheme">{t.scheme}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
