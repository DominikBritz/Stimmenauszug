# Installation

Die App ist nicht signiert (kein Apple-Developer-Account, kein Windows-Zertifikat). Deshalb warnen macOS und Windows beim ersten Start. Das ist einmalig.

## macOS (Apple Silicon)

1. `Stimmenauszug-<Version>-arm64.dmg` öffnen und die App in den Ordner *Programme* ziehen.
2. Beim ersten Start meldet macOS „Stimmenauszug ist beschädigt und kann nicht geöffnet werden“ oder „kann nicht überprüft werden“. Das liegt nur an der fehlenden Signatur.
3. Terminal öffnen und einmalig ausführen:

```bash
xattr -cr "/Applications/Stimmenauszug.app"
```

4. Danach startet die App normal per Doppelklick.

Alternative ohne Terminal: In *Systemeinstellungen > Datenschutz & Sicherheit* nach unten scrollen, dort erscheint nach dem ersten Startversuch „Trotzdem öffnen“.

## Windows (64 Bit)

Zwei Varianten liegen bei:

- `Stimmenauszug Setup <Version>.exe`: Installer, legt Startmenü-Eintrag an.
- `Stimmenauszug <Version>.exe`: portable Version, läuft direkt ohne Installation (z.B. vom USB-Stick).

Beim ersten Start zeigt Windows SmartScreen „Der Computer wurde durch Windows geschützt“. Auf **Weitere Informationen** klicken, dann **Trotzdem ausführen**.

## Voraussetzungen

Keine. Texterkennung, PDF-Verarbeitung und Sprachdaten sind in der App enthalten. Internet wird nur gebraucht, wenn in den Einstellungen die optionale KI-Erkennung eingeschaltet ist.

## Speicherorte

- Einstellungen und Erkennungs-Cache: macOS `~/Library/Application Support/Stimmenauszug/`, Windows `%APPDATA%\Stimmenauszug\`.
- Der Cache kann jederzeit in den Einstellungen geleert werden; er wird beim nächsten Lauf neu aufgebaut.
