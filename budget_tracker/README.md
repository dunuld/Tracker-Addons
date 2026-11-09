# Home Assistant Add-on: Haushaltsbuch

_Haushaltsbuch für ING-Kontoauszüge (PDF) mit automatischer Kategorisierung._

![Version][version-badge]
![amd64][amd64-badge]
![aarch64][aarch64-badge]
![Ingress][ingress-badge]

## Über

Das Haushaltsbuch hilft dir, den Überblick über dein Haushaltsbudget zu behalten – direkt in
Home Assistant. Lade monatlich deinen ING-Kontoauszug als PDF hoch; alle Buchungen werden
automatisch ausgelesen, anhand von Regeln kategorisiert und als Diagramme dargestellt.

- **PDF-Import** von ING-Girokonto-Auszügen inkl. Saldo-Prüfung und Duplikaterkennung
- **Mehrere Konten** mit Kontoauswahl in Übersicht, Transaktionen und Verlauf
- **Regelbasierte Kategorisierung** mit anpassbaren Kategorien und Regeln
- **Monatsübersicht** mit Einnahmen, Ausgaben, Saldo und Ausgaben nach Kategorie
- **Transaktionsliste** mit Filtern und direkter Kategorie-Zuordnung
- **Verlauf** über mehrere Monate als gestapeltes Balkendiagramm
- **Nahtlose Integration** als Panel über Ingress – übernimmt das aktive Home-Assistant-Theme
- **Lokal & privat**: Alle Daten bleiben auf deinem Home-Assistant-System

Alle Details zu Installation, Konfiguration und Nutzung findest du im Tab **Dokumentation**
bzw. in der [DOCS.md](DOCS.md).

[version-badge]: https://img.shields.io/badge/dynamic/yaml?label=Version&query=%24.version&url=https%3A%2F%2Fraw.githubusercontent.com%2Fdunuld%2Fhassio-addons%2Fmain%2Fbudget_tracker%2Fconfig.yaml
[amd64-badge]: https://img.shields.io/badge/amd64-yes-green
[aarch64-badge]: https://img.shields.io/badge/aarch64-yes-green
[ingress-badge]: https://img.shields.io/badge/ingress-yes-green
