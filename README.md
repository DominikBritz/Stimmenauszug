# Stimmenauszug

Desktop-App (macOS, Windows), die aus Noten-PDFs einzelne Stimmen herauszieht: PDFs oder Ordner auswählen, „Trompete 1“ eingeben, und die App sucht in allen Dateien die passenden Seiten und exportiert sie in eine neue PDF (mit Lesezeichen pro Stück).

Funktioniert mit gescannten Noten: Die Stimmenbezeichnung im Kopf jeder Seite wird per OCR (tesseract.js, Deutsch + Englisch) gelesen, Textlayer werden bevorzugt genutzt. Erkannte Ergebnisse werden zwischengespeichert.

## Entwicklung

```bash
npm install
node node_modules/electron/install.js   # falls npm die Install-Skripte blockiert hat
npm run dev
```

Tests der Erkennungslogik:

```bash
npm test
```

Integrationstest über echte PDFs (Ordner per Umgebungsvariable):

```bash
NOTEN_DIR=/pfad/zu/noten npm run test:integration
```

Builds für macOS (arm64) und Windows (x64), beide auf dem Mac erzeugt:

```bash
npm run dist
```

Ergebnisse liegen in `dist/`. Siehe [docs/INSTALLATION.md](docs/INSTALLATION.md) für die Hinweise zu unsignierten Apps.

## Testmodus ohne Oberfläche

```bash
SE_AUTORUN=/pfad/zu/noten SE_OUT=ergebnis.json SE_QUERY="Trompete 1" npx electron out/main/index.js
```

Analysiert alle PDFs, schreibt die Zuordnung pro Seite als JSON und beendet sich. `SE_FORCE=1` ignoriert den Cache, `SE_LIMIT=10` begrenzt die Dateianzahl.

## Aufbau

- `src/shared/`: Erkennungslogik ohne Electron-Abhängigkeit (Synonymtabelle, Matcher, Klassifikation, Seitenzuordnung).
- `src/renderer/analysis/`: pdf.js-Rendering, tesseract-Worker, Pipeline pro Datei.
- `src/main/`: Dateizugriff, Cache, Einstellungen, PDF-Export (pdf-lib), KI-Anbindung (OpenAI-kompatibel).
- `src/renderer/steps/`: Oberfläche in vier Schritten (Auswahl, Analyse, Kontrolle, Export).
