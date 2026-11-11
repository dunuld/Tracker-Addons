# Home Assistant Add-on: Zeiterfassung

_Arbeitszeiterfassung mit Kommen/Gehen, Home Office, Arbeitspaketen und Überstundenkonto._

![Version][version-badge]
![amd64][amd64-badge]
![aarch64][aarch64-badge]
![Ingress][ingress-badge]

## Über

Die Zeiterfassung läuft als Panel direkt in Home Assistant. Jeder Home-Assistant-Benutzer hat
seine eigene, getrennte Zeiterfassung – ohne zusätzliche Anmeldung.

- **Kommen/Gehen** per Knopfdruck, Uhrzeit vorbelegt und änderbar, mehrere Stempel pro Tag
- **Home Office oder Office** pro Tag
- **Projekte und Arbeitspakete** je Benutzer, Buchungen in 0,25-Stunden-Schritten mit
  „Rest auffüllen“ und Anzeige der noch zu verteilenden Zeit
- **Gesetzliche Pausen** (ArbZG): fehlende Pause wird automatisch abgezogen oder angemahnt
- **Überstundenkonto** mit eigenen Wochenstunden (gültig ab Datum), Urlaub, Krank, Gleittag
- **Feiertage automatisch** nach Bundesland – pro Tag manuell überschreibbar
- **Monatsübersicht** mit Wochensummen, Soll/Ist und Home-Office-Quote
- **Lokal & privat**: alle Daten bleiben auf deinem Home-Assistant-System

Alle Details zu Installation, Konfiguration und Nutzung findest du im Tab **Dokumentation**
bzw. in der [DOCS.md](DOCS.md).

[version-badge]: https://img.shields.io/badge/dynamic/yaml?label=Version&query=%24.version&url=https%3A%2F%2Fraw.githubusercontent.com%2Fdunuld%2Fhassio-addons%2Fmain%2Ftime_tracker%2Fconfig.yaml
[amd64-badge]: https://img.shields.io/badge/amd64-yes-green
[aarch64-badge]: https://img.shields.io/badge/aarch64-yes-green
[ingress-badge]: https://img.shields.io/badge/ingress-yes-green
