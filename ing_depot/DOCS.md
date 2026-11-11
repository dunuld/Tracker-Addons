# Home Assistant Add-on: ING Depot

Das Add-on liest PDFs aus dem ING-Depot und erstellt daraus eine Jahresübersicht: investierte
Beträge, realisierte Gewinne, ausgezahlte Dividenden und Kursgewinne.

> **Hinweis:** Der PDF-Parser wurde anhand des bekannten Aufbaus der ING-Dokumente entwickelt und
> mit synthetischen Dokumenten getestet. Prüfe nach dem ersten Import, ob die Werte zu deinen
> Abrechnungen passen. Wird ein Dokument nicht erkannt, melde das bitte als
> [Issue](https://github.com/dunuld/hassio-addons/issues) – ohne persönliche Daten.

## Installation

1. Das Repository `https://github.com/dunuld/hassio-addons` im Add-on Store hinzufügen
   (**Einstellungen → Add-ons → Add-on Store → ⋮ → Repositories**).
2. Im Add-on Store nach **ING Depot** suchen und auf **Installieren** klicken.
   Da das Add-on als _experimentell_ markiert ist, wird es nur im erweiterten Modus angezeigt.
3. Das Add-on **starten**.
4. Optional **In Seitenleiste anzeigen** aktivieren.
5. Über **Benutzeroberfläche öffnen** oder das Panel in der Seitenleiste starten.

## Konfiguration

| Option            | Standard           | Bedeutung                                                                                     |
| ----------------- | ------------------ | --------------------------------------------------------------------------------------------- |
| `inbox_folder`    | `/share/ing_depot` | Eingangsordner, aus dem PDFs automatisch importiert werden. Leer lassen, um ihn abzuschalten. |
| `publish_sensors` | `true`             | Kennzahlen des laufenden Jahres als Sensoren an Home Assistant melden.                        |
| `exemption_order` | `0`                | Freistellungsauftrag in Euro (z. B. `1000`). Bei `0` wird die Nutzung nicht angezeigt.        |

Der Zugriff erfolgt ausschließlich über Home Assistant Ingress; es werden keine Ports nach außen
geöffnet.

## Nutzung

### PDFs importieren

Unterstützt werden diese Dokumente aus der ING-Postbox:

| Dokument                                    | Verwendung                                    |
| ------------------------------------------- | --------------------------------------------- |
| Wertpapierabrechnung Kauf (auch Sparplan)   | Investition, Einstandswert, Kurs              |
| Wertpapierabrechnung Verkauf                | Realisierter Gewinn, Gebühren, Steuern        |
| Ertragsabrechnung (Dividende, Ausschüttung) | Dividenden brutto/netto, Steuern              |
| Depotauszug / Jahresdepotauszug             | Kurse zum Stichtag, Kontrolle der Stückzahlen |

Es gibt zwei Wege:

- **Upload**: Auf der Seite **Import** PDFs auswählen oder hineinziehen (mehrere gleichzeitig).
- **Eingangsordner**: PDFs in `/share/ing_depot` legen (z. B. über das Samba-Add-on). Der Ordner
  wird jede Minute geprüft. Importierte Dateien wandern nach `importiert/`, nicht erkannte nach
  `fehler/` und erscheinen auf der Seite **Import** unter „Nicht erkannt“.

Jedes Dokument wird nur einmal importiert – erkannt an der Datei und an der Ordernummer bzw. dem
Inhalt. Löschst du ein Dokument, verschwinden auch seine Buchungen.

### Startbestand

Realisierte Gewinne und Kursgewinne brauchen den Einstandswert. Am genauesten ist es, **alle
Kaufabrechnungen seit Depoteröffnung** zu importieren. Fehlen ältere Abrechnungen, trage auf der
Seite **Buchungen** einen **Startbestand** ein (ISIN, Kaufdatum, Stückzahl, gesamter
Einstandswert). Die Übersicht weist darauf hin, wenn Käufe fehlen oder der Bestand vom jüngsten
Depotauszug abweicht.

### Kennzahlen

Alle Jahreswerte beziehen sich auf den Zeitraum ab 01.01. des gewählten Jahres.

- **Investiert**: Summe aller Käufe inklusive Gebühren; „netto“ zieht Verkaufserlöse ab.
- **Realisierte Gewinne**: Verkaufserlös nach Gebühren minus Einstandswert der verkauften Stücke.
  Zuerst gekaufte Stücke gelten als zuerst verkauft (FIFO), wie im deutschen Steuerrecht. Der Wert
  ist vor Steuern.
- **Dividenden ausgezahlt**: Gutschriften nach Steuern; zusätzlich der Bruttobetrag.
- **Kursgewinn seit Kauf**: aktueller Wert minus Einstandswert des Bestands.
- **Kursgewinn seit 01.01.**: aktueller Wert plus Verkaufserlöse, minus Wert am 31.12. des
  Vorjahres und minus Käufe des Jahres. Den Kurs zum 31.12. liefert der Jahresdepotauszug.
- **Freistellungsauftrag**: rechnerische Nutzung aus Bruttoerträgen plus realisierten Gewinnen –
  eine Näherung, maßgeblich ist die Abrechnung der Bank.

### Kurse

Der aktuelle Kurs einer Position stammt aus der jeweils jüngsten Quelle:

1. **Dokumente**: Kurs der letzten Abrechnung bzw. des letzten Depotauszugs. Ohne weitere Quelle
   ist der Kurs so alt wie dein letztes Dokument.
2. **Manuell**: In der Positionsliste auf **Kurs** klicken und den aktuellen Kurs eintragen.
3. **Home-Assistant-Entität**: Dort eine Entität hinterlegen (z. B. `sensor.msci_world`), deren
   Zustand der Kurs in Euro ist. Das Add-on liest sie alle 15 Minuten.

### Sensoren

Mit `publish_sensors: true` stellt das Add-on diese Sensoren bereit (Werte des laufenden Jahres):

| Entität                                     | Inhalt                              |
| ------------------------------------------- | ----------------------------------- |
| `sensor.ing_depot_wert`                     | Depotwert                           |
| `sensor.ing_depot_investiert_jahr`          | Investiert (Käufe inkl. Gebühren)   |
| `sensor.ing_depot_investiert_netto_jahr`    | Investiert abzüglich Verkaufserlöse |
| `sensor.ing_depot_realisierte_gewinne_jahr` | Realisierte Gewinne                 |
| `sensor.ing_depot_dividenden_jahr`          | Ausgezahlte Dividenden (netto)      |
| `sensor.ing_depot_kursgewinn`               | Kursgewinn seit Kauf in €           |
| `sensor.ing_depot_kursgewinn_prozent`       | Kursgewinn seit Kauf in %           |
| `sensor.ing_depot_kursgewinn_jahr`          | Kursgewinn seit Jahresbeginn in €   |
| `sensor.ing_depot_kursgewinn_jahr_prozent`  | Kursgewinn seit Jahresbeginn in %   |

Die Sensoren werden nach jedem Import und alle 15 Minuten aktualisiert. Nach einem Neustart von
Home Assistant erscheinen sie erst mit der nächsten Aktualisierung wieder.

### Darstellung

Über den Theme-Umschalter in der Navigation wählst du zwischen Hell, Dunkel und System. Im Modus
„System“ übernimmt das Panel Farben, Schrift und Hell/Dunkel des aktiven Home-Assistant-Themes.

## Grenzen

- Aktiensplits, Spin-offs, Fusionen, Ein- und Auslieferungen sowie Vorabpauschalen werden nicht
  ausgewertet.
- Beträge werden in Euro geführt; Fremdwährungsdividenden mit dem umgerechneten Betrag der
  Abrechnung.
- Die Übersicht ersetzt keine Steuerbescheinigung.

## Datenspeicherung

Datenbank (`depot.db`) und Original-PDFs (`documents/`) liegen im persistenten Add-on-Verzeichnis
`/data`, das bei Updates erhalten bleibt und in Home-Assistant-Backups des Add-ons enthalten ist.
Es werden keine Daten an Dritte übertragen.

## Support

- [GitHub Issues](https://github.com/dunuld/hassio-addons/issues) – Fehler melden oder
  Verbesserungen vorschlagen
- [GitHub Discussions](https://github.com/dunuld/hassio-addons/discussions) – Fragen stellen und
  Ideen teilen

## Lizenz

MIT – siehe [LICENSE](https://github.com/dunuld/hassio-addons/blob/main/LICENSE).
