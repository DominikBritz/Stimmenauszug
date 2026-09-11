import type { ExportProgress } from '@shared/ipc-types';

export function OutputFolderField({ outputDir, setOutputDir }: { outputDir: string | null; setOutputDir: (d: string | null) => void }) {
  async function pick() {
    const d = (await window.api.invoke('dialog:outputFolder')) as string | null;
    if (d) setOutputDir(d);
  }
  return (
    <div className="field">
      <span>Zielordner</span>
      <div className="row">
        <span className="muted">{outputDir ?? 'noch nicht gewählt'}</span>
        <button className="btn small" onClick={pick}>Wählen…</button>
      </div>
    </div>
  );
}

export function ProgressPanel({ progress }: { progress: ExportProgress }) {
  return (
    <div className="panel">
      <div className="progress"><div style={{ width: `${Math.round((progress.done / Math.max(1, progress.totalPieces)) * 100)}%` }} /></div>
      <p className="muted">{progress.message}</p>
    </div>
  );
}

export function OpenButtons({ path }: { path: string }) {
  return (
    <>
      <button className="btn small" onClick={() => window.api.invoke('shell:openPath', path)}>Öffnen</button>
      <button className="btn small" onClick={() => window.api.invoke('shell:showInFolder', path)}>Im Ordner zeigen</button>
    </>
  );
}
