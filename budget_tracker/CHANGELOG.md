# Changelog

## 1.3.0 (2026-11-09)

### Neu

- **Kontostände in der Monatsübersicht**: Saldo je Konto zum Monatsende und bei mehreren Konten
  die Gesamtsumme. Fehlt der Auszug eines Kontos für den Monat, wird der letzte frühere Saldo mit
  „Stand <Monat>“ angezeigt. Die Kontoauswahl gilt auch hier.

### Technik

- `api/reports/monthly` liefert zusätzlich `accountBalances` und `totalBalanceCents`

## 1.2.0 (2026-11-08)

### Neu

- **Mehrere Konten**: Beim Import wird je IBAN automatisch ein Konto angelegt. Übersicht,
  Transaktionen und Verlauf haben eine Kontoauswahl („Alle Konten“ oder ein einzelnes Konto), die
  im Browser gespeichert bleibt. Unter „Alle Konten“ zeigt die Transaktionsliste das Konto jeder
  Buchung.
- **Einstellungen → Konten**: Name und Farbe ändern, Saldo des jüngsten Auszugs anzeigen, Konto aus
  „Alle Konten“ ausblenden und Konto samt Auszügen löschen
- **Upload**: Das Import-Ergebnis zeigt das Konto und weist darauf hin, wenn es neu angelegt wurde

### Technik

- Datenbank-Schema v2 mit neuer Tabelle `accounts`. Vorhandene Daten werden beim Start automatisch
  migriert: Aus jeder IBAN wird ein Konto.
- API: `GET/PATCH/DELETE api/accounts`, optionaler Parameter `accountId` für `api/transactions`,
  `api/reports/monthly` und `api/reports/trend`; `Statement` und `Transaction` enthalten die
  Konto-ID

## 1.1.1 (2026-11-06)

### Geändert

- **Dokumentation**: README und DOCS nach Home-Assistant-Add-on-Standard strukturiert; Links, Badges und „Repository hinzufügen“-Button zeigen auf das umbenannte Repository `dunuld/hassio-addons`

### Technik

- CI, Code Quality und Releases für mehrere Add-ons im Repository vorbereitet; Release-Tags haben jetzt die Form `budget_tracker-v<version>`

## 1.1.0 (2026-11-06)

### Geändert

- **Home-Assistant-Einbettung**: Im Modus „System“ übernimmt das Panel jetzt Farben, Schrift und Hell/Dunkel des aktiven HA-Themes (auch bei Theme-Wechsel zur Laufzeit); manuelle Auswahl Hell/Dunkel hat weiterhin Vorrang
- **Layout**: Kein weißer Rand/doppelter Scrollbalken mehr im Ingress-iframe; Navigation als fixierte, horizontal scrollbare Tab-Leiste im HA-Stil; Titel wird eingebettet ausgeblendet (steht bereits in HA)
- **Karten-Design**: Diagramme und Tabellen in HA-ähnlichen Karten; Tabellen scrollen horizontal statt die Seite zu verbreitern
- **Mobil / Companion-App**: Transaktionen als kompakte Liste, Formulare und Monatsauswahl auf schmale Breiten angepasst, kein Auto-Zoom bei Eingabefeldern unter iOS

### Behoben

- **Regex-Regeln**: Muster wurden vor dem Abgleich in Großbuchstaben gewandelt (`\b` → `\B`), daher griffen u. a. die Standardregeln für ESSO, ARAL, NETTO, DM und LOHN nie
- **Regeln neu anwenden**: Buchungen ohne Treffer wurden als „Regel“ statt „Standard“ markiert; gemeldet werden jetzt nur tatsächlich geänderte Buchungen
- **Transaktionsfilter nach Monat**: Monat wurde als Text verkettet (`"3" + 1 = "31"`), wodurch z. B. der März auch April–Dezember enthielt
- **Verlauf**: Ungültiger Monat (z. B. `2025-13`) führte zu einer Endlosschleife im Server; Zeitraum ist jetzt auf 120 Monate begrenzt
- **Kategorien/Regeln**: Ungültige Eingaben, doppelte Namen und das Löschen der Standardkategorie liefern verständliche 400/409-Fehler statt 500
- **Suche**: `%` und `_` werden wörtlich gesucht
- **Verlauf**: Der Standardzeitraum begann am 29.–31. eines Monats einen Monat zu spät (Datumsüberlauf bei `setMonth`)
- **Fehlermeldungen im Frontend**: Beim Ersetzen eines Auszugs und beim Ändern einer Kategorie wurde statt der Server-Meldung nur „Ersetzen fehlgeschlagen“ bzw. „Fehler“ angezeigt
- **Kategorie-Auswahl**: Die Auswahlfelder in der Transaktionsliste und im Kategoriefilter zeigten immer die erste Kategorie statt der tatsächlich zugeordneten; unkategorisierte Buchungen zeigen jetzt „— unkategorisiert —“

### Technik

- Neue Tests für Kategorien-, Regel-, Transaktions- und Report-API sowie den Categorizer (Server-Coverage 65 % → 95 % Zeilen)
- Coverage-Schwellen für Server und Angular; CI bricht bei Unterschreitung ab
- ESLint (typescript-eslint, angular-eslint) und Prettier-Prüfung; Templates auf Built-in Control Flow (`@if`/`@for`) migriert
- Neuer Workflow „Code Quality“: Formatierung, Lint, Typprüfung, Dependency-Audit
- Frontend-Tests für Einstellungen, Upload-Duplikate, Theme-Service, API-Service und Verlauf (Funktions-Coverage 50 % → 86 %); Coverage-Schwellen entsprechend angehoben
- Services werden in Komponenten per `inject()` statt `new` bezogen
- Dependabot: wöchentliche Update-PRs für npm (gruppiert: Angular, Lint, Vitest, Minor/Patch), GitHub Actions und das Docker-Basisimage; Node-Majors werden bewusst ausgelassen
- GitHub Actions aktualisiert (`actions/checkout`, `actions/setup-node`, `actions/upload-artifact` auf v7)
- Release-Workflow: Release Notes werden jetzt korrekt aus dem passenden CHANGELOG-Abschnitt übernommen (waren bisher immer leer)

## 1.0.0 (2026-11-05)

### Hinzugefügt

- **PDF-Import**: ING-Girokonto-Kontoauszüge als PDF hochladen, Transaktionen automatisch parsen
- **Kategorisierung**: Regelbasierte Zuordnung mit vordefinierten Kategorien (Lebensmittel, Streaming, Versicherungen, etc.)
- **Monatsübersicht**: Einnahmen, Ausgaben, Saldo mit Donut-Diagramm nach Kategorie
- **Transaktionsliste**: Filterbar nach Monat, Kategorie, Freitext; Kategorie inline änderbar
- **Verlauf**: Gestapeltes Balkendiagramm für mehrere Monate
- **Einstellungen**: Kategorien, Regeln und Auszüge verwalten
- **Duplikaterkennung**: Bereits importierte Auszüge werden erkannt und können ersetzt werden
- **Saldo-Prüfung**: Warnung wenn Summe der Buchungen nicht der Saldo-Differenz entspricht
- **Regeln neu anwenden**: Alle nicht-manuell zugeordneten Buchungen mit aktuellen Regeln aktualisieren
- **Dark Mode**: Umschaltbarer dunkler Modus mit drei Stufen (Hell, Dunkel, System-Einstellung); Wahl wird im localStorage gespeichert; Diagramme passen sich automatisch an

### Technik

- Angular 22 Frontend mit Signal-basierten Komponenten
- Node.js/Express Backend (TypeScript)
- SQLite-Datenbank über `node:sqlite` (Node 24)
- PDF-Parser mit pdfjs-dist
- Chart.js für Diagramme
- Docker-Container für HomeAssistant-Ingress
- Multi-Architektur-Unterstützung (amd64, aarch64)
