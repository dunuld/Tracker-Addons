# Home Assistant Add-on: ING Depot

_Depotübersicht aus ING-PDFs – Abrechnungen, Ertragsabrechnungen und Depotauszüge._

![Version][version-badge]
![Stage][stage-badge]
![amd64][amd64-badge]
![aarch64][aarch64-badge]
![Ingress][ingress-badge]

## Über

Das Add-on liest die PDFs deines ING-Depots und zeigt je Kalenderjahr (ab 01.01.):

- **Investiert**: Summe der Käufe – brutto und netto nach Verkäufen
- **Realisierte Gewinne** (FIFO) und **ausgezahlte Dividenden**
- **Kursgewinn** je Position und gesamt, in Euro und Prozent – seit Kauf und seit Jahresbeginn
- **PDF-Import** per Upload oder automatisch aus einem Eingangsordner, mit Duplikaterkennung
- **Sensoren** für Home-Assistant-Dashboards und Automationen
- **Lokal & privat**: Alle Daten bleiben auf deinem Home-Assistant-System

Alle Details zu Installation, Konfiguration und Nutzung findest du im Tab **Dokumentation**
bzw. in der [DOCS.md](DOCS.md).

[version-badge]: https://img.shields.io/badge/dynamic/yaml?label=Version&query=%24.version&url=https%3A%2F%2Fraw.githubusercontent.com%2Fdunuld%2Fhassio-addons%2Fmain%2Fing_depot%2Fconfig.yaml
[stage-badge]: https://img.shields.io/badge/stage-experimental-orange
[amd64-badge]: https://img.shields.io/badge/amd64-yes-green
[aarch64-badge]: https://img.shields.io/badge/aarch64-yes-green
[ingress-badge]: https://img.shields.io/badge/ingress-yes-green
