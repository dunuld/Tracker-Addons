# Changelog

## 0.1.0 (unveröffentlicht)

### Hinzugefügt

- Mehrbenutzerfähig: Erkennung des angemeldeten Home-Assistant-Benutzers über Ingress,
  getrennte Daten je Benutzer und Ersteinrichtung beim ersten Öffnen
- Kommen/Gehen mit vorbelegter, änderbarer Uhrzeit; mehrere Stempel pro Tag, Nachtragen,
  Korrigieren und Löschen mit Überschneidungsprüfung
- Arbeitsort pro Tag (Home Office / Office) und Tagesnotiz
- Tagesarten Arbeitstag, Urlaub, Krank, Feiertag und Gleittag; gesetzliche Feiertage automatisch
  nach Bundesland (`date-holidays`), pro Tag manuell überschreibbar
- Pausenregeln nach Arbeitszeitgesetz mit automatischem Abzug oder Hinweis, Warnung über 10 h
- Projekte und Arbeitspakete je Benutzer mit optionalem Code, Budget und Archivierung
- Buchungen in 0,25-Stunden-Schritten mit Schnellwahl, „Rest auffüllen“ und Verteil-Ampel
- Überstundenkonto mit Übertrag und Wochenstunden-Modellen „gültig ab“
- Monatsübersicht mit Wochensummen, Soll/Ist, Home-Office-Quote und Saldo
- Theme-Umschalter, der das Home-Assistant-Theme übernimmt

### Technik

- Angular 22, Node.js 24/Express (TypeScript), SQLite (`node:sqlite`), Docker-Image auf Basis
  von `node:24-alpine`
- Gemeinsame Rechenlogik (`shared/time-calc.ts`) für Backend und Frontend
- Tests mit Vitest inkl. Coverage-Schwellen, ESLint, Prettier und TypeScript-Typprüfung
