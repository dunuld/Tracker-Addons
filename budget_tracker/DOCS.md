# Home Assistant Add-on: Haushaltsbuch

Das Haushaltsbuch verwaltet dein Haushaltsbudget auf Basis von ING-Kontoauszügen. Monatlich wird
ein Kontoauszug (PDF) hochgeladen, alle Transaktionen werden automatisch kategorisiert und als
Diagramme dargestellt.

## Installation

Die Installation dieses Add-ons ist einfach und unterscheidet sich nicht von anderen
Home Assistant Add-ons:

1. Das Repository `https://github.com/dunuld/hassio-addons` im Add-on Store hinzufügen
   (**Einstellungen → Add-ons → Add-on Store → ⋮ → Repositories**).
2. Im Add-on Store nach **Haushaltsbuch** suchen und auf **Installieren** klicken.
3. Das Add-on **starten**.
4. Optional **In Seitenleiste anzeigen** aktivieren – das Haushaltsbuch erscheint dann als Panel
   mit dem Icon `mdi:cash-multiple` in der Seitenleiste.
5. Über **Benutzeroberfläche öffnen** oder das Panel in der Seitenleiste starten.

## Konfiguration

Das Add-on benötigt keine Konfiguration – es gibt keine Optionen im Tab **Konfiguration**.
Der Zugriff erfolgt ausschließlich über Home Assistant Ingress; es werden keine Ports nach außen
geöffnet.

## Nutzung

### Kontoauszug hochladen

1. Im Menü auf **Upload** klicken.
2. Den ING-Kontoauszug als PDF auswählen und hochladen.
3. Nach dem Import siehst du Zeitraum, Anzahl der Buchungen, Saldo-Prüfung und die Anzahl der
   automatisch kategorisierten Buchungen.

Wurde ein Auszug bereits importiert, wird dies erkannt und du kannst ihn ersetzen.

### Mehrere Konten

Du kannst Auszüge mehrerer ING-Konten importieren, z. B. Girokonto und Gemeinschaftskonto. Beim
ersten Import eines Auszugs wird das Konto anhand der IBAN automatisch angelegt, zunächst mit dem
Namen `ING ••<letzte 4 Ziffern>`. Unter **Einstellungen → Konten** kannst du Name und Farbe ändern.

Sobald es mehr als ein Konto gibt, erscheint in Übersicht, Transaktionen und Verlauf eine
**Kontoauswahl**. Dort wählst du „Alle Konten“ oder ein einzelnes Konto. Die Auswahl gilt für alle
Seiten und bleibt im Browser gespeichert. Unter „Alle Konten“ zeigt die Transaktionsliste
zusätzlich, zu welchem Konto eine Buchung gehört.

#### Umbuchungen zwischen eigenen Konten

Überweisungen zwischen deinen Konten sind weder Einnahme noch Ausgabe. Das Haushaltsbuch erkennt
sie automatisch und ordnet beide Seiten der Kategorie **Umbuchungen** zu (die erste Kategorie vom
Typ „Umbuchung“). Diese Buchungen zählen dann nicht mehr zu Einnahmen und Ausgaben:

- **Gegenbuchung**: Eine Abbuchung auf einem Konto und eine Gutschrift über genau denselben Betrag
  auf einem anderen deiner Konten, höchstens 3 Tage auseinander. Dafür müssen die Auszüge beider
  Konten importiert sein.
- **IBAN**: Steht die IBAN eines anderen deiner Konten im Empfänger oder Verwendungszweck, gilt
  die Buchung auch ohne importierten Gegenauszug als Umbuchung.

Automatisch erkannte Umbuchungen sind in der Transaktionsliste mit ⇄ markiert. Ist eine Buchung
fälschlich erkannt, ordne sie einfach manuell einer anderen Kategorie zu – manuelle Zuordnungen
werden nie überschrieben. Die Erkennung läuft beim Import, beim Löschen von Auszügen oder Konten,
bei **Regeln neu anwenden** und beim Start des Add-ons.

### Monatsübersicht

- Die Startseite zeigt Einnahmen, Ausgaben und Saldo des gewählten Monats.
- Unter **Kontostände zum Monatsende** steht für jedes Konto der neue Saldo seines Auszugs aus
  diesem Monat, bei mehreren Konten auch die Gesamtsumme. Fehlt der Auszug eines Kontos für den
  Monat, wird der letzte frühere Saldo mit dem Hinweis „Stand <Monat>“ angezeigt. Es zählen die
  Konten der aktuellen Kontoauswahl.
- Ein Donut-Diagramm visualisiert die Ausgaben nach Kategorie.
- Ein Klick auf eine Kategorie öffnet die gefilterte Transaktionsliste.
- Mit den Pfeilen navigierst du zwischen den Monaten.

### Transaktionen

- Alle Buchungen sind filterbar nach Monat, Kategorie und Freitext.
- Die Kategorie einer Buchung kann direkt geändert werden.
- Optional kann dabei eine neue Regel für den Empfänger angelegt werden, damit künftige Buchungen
  automatisch zugeordnet werden.

### Verlauf

- Mehrere Monate lassen sich in einem gestapelten Balkendiagramm vergleichen.
- Der Zeitraum wird über die Monatsauswahl festgelegt (maximal 120 Monate).

### Einstellungen

- **Kategorien**: Neue Kategorien anlegen (Name, Farbe, Typ) oder bestehende löschen.
- **Regeln**: Kategorisierungsregeln verwalten (Feld, Match-Typ, Muster, Priorität).
  **Regeln neu anwenden** aktualisiert alle nicht manuell zugeordneten Buchungen.
- **Konten**: Name und Farbe ändern, Saldo des jüngsten Auszugs sehen und festlegen, ob ein Konto
  in „Alle Konten“ einfließt. Ein ausgeblendetes Konto, z. B. ein Tagesgeldkonto, ist nur zu sehen,
  wenn es ausdrücklich ausgewählt ist. Beim Löschen eines Kontos werden auch alle seine Auszüge und
  Buchungen gelöscht.
- **Auszüge**: Importierte Kontoauszüge mit Konto auflisten und löschen.

### Darstellung

Über den Theme-Umschalter in der Navigation wählst du zwischen Hell, Dunkel und System. Im Modus
„System“ übernimmt das Panel Farben, Schrift und Hell/Dunkel des aktiven Home-Assistant-Themes.

## Datenspeicherung

Alle Daten werden lokal im persistenten Add-on-Verzeichnis `/data` gespeichert, das vom
Supervisor verwaltet wird und bei Updates erhalten bleibt:

| Pfad              | Beschreibung                                                            |
| ----------------- | ----------------------------------------------------------------------- |
| `/data/budget.db` | SQLite-Datenbank mit Konten, Kategorien, Regeln, Auszügen und Buchungen |
| `/data/uploads/`  | Original-PDFs der hochgeladenen Kontoauszüge                            |

Die Daten verlassen niemals dein Home-Assistant-System und sind in Home-Assistant-Backups des
Add-ons enthalten.

## Bekannte Einschränkungen

- Es werden **nur ING-Kontoauszüge** unterstützt. Das Parser-Interface ist für weitere Banken
  vorbereitet, diese sind aber noch nicht implementiert.
- Das Add-on stellt **keine Sensoren oder Entitäten** bereit – es ist nur über die Weboberfläche
  (Ingress) erreichbar.
- Die Kategorisierung ist **regelbasiert** (Keyword-/Regex-Abgleich), nicht KI-gestützt.
- Unterstützte Architekturen: `amd64`, `aarch64`.

## Support

Hast du Fragen oder ein Problem gefunden?

- [GitHub Issues](https://github.com/dunuld/hassio-addons/issues) – Fehler melden oder
  Verbesserungen vorschlagen
- [GitHub Discussions](https://github.com/dunuld/hassio-addons/discussions) – Fragen stellen und
  Ideen teilen

## Lizenz

MIT – siehe [LICENSE](https://github.com/dunuld/hassio-addons/blob/main/LICENSE).
