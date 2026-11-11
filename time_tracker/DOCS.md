# Home Assistant Add-on: Zeiterfassung

Arbeitszeiterfassung direkt in Home Assistant: ein- und ausstempeln, Home Office oder Office
festhalten, Zeiten in Viertelstunden auf Arbeitspakete buchen und das Überstundenkonto im Blick
behalten.

## Installation

1. Das Repository `https://github.com/dunuld/hassio-addons` im Add-on Store hinzufügen
   (**Einstellungen → Add-ons → Add-on Store → ⋮ → Repositories**).
2. Im Add-on Store nach **Zeiterfassung** suchen und auf **Installieren** klicken.
3. Das Add-on **starten**.
4. Optional **In Seitenleiste anzeigen** aktivieren – das Add-on erscheint dann als Panel mit dem
   Icon `mdi:clock-check-outline` in der Seitenleiste.
5. Über **Benutzeroberfläche öffnen** oder das Panel in der Seitenleiste starten.

## Konfiguration

Im Tab **Konfiguration** gibt es keine Optionen – alle Einstellungen nimmt jeder Benutzer selbst
im Panel unter **Einstellungen** vor. Der Zugriff erfolgt ausschließlich über Home Assistant
Ingress; es werden keine Ports nach außen geöffnet.

### Mehrere Benutzer

Das Add-on erkennt den in Home Assistant angemeldeten Benutzer automatisch. Beim ersten Öffnen
führt es durch eine kurze Einrichtung:

- **Wochenstunden** und **Arbeitstage** (daraus ergibt sich das Tagessoll, z. B. 40 h an 5 Tagen
  = 8 h)
- **Bundesland** für die automatischen Feiertage
- **Standard-Ort** (Office oder Home Office) für neue Tage
- **Zeiterfassung ab** – ab diesem Tag zählt das Überstundenkonto
- **Übertrag Überstunden** aus einem früheren System
- **Automatischer Pausenabzug** an/aus

Projekte, Arbeitspakete, Stempel und Buchungen gehören immer genau einem Benutzer; andere
Benutzer sehen sie nicht.

## Nutzung

### Heute

- **KOMMEN / GEHEN** stempelt mit der angezeigten Uhrzeit. Sie ist mit der aktuellen Zeit
  vorbelegt und kann vorher geändert werden (z. B. wenn du vergessen hast zu stempeln).
- Mehrere Stempel pro Tag sind möglich; die Lücken dazwischen zählen als Pause.
- Stempel lassen sich direkt in der Liste korrigieren, löschen oder über **Stempel nachtragen**
  ergänzen. Überschneidungen werden abgelehnt.
- **Home Office / Office** und eine **Notiz** gelten jeweils für den ganzen Tag.
- Mit ◀ ▶ oder dem Datumsfeld wechselst du zu anderen Tagen, um nachzutragen.

### Tagesart und Feiertage

Gesetzliche Feiertage werden nach deinem Bundesland automatisch erkannt (Tagesart
„Automatisch (Feiertagsname)“). Über **Tagesart** kannst du jeden Tag manuell überschreiben:

| Tagesart   | Soll      | Wirkung auf das Überstundenkonto                     |
| ---------- | --------- | ---------------------------------------------------- |
| Arbeitstag | Regelsoll | Ist − Soll                                           |
| Urlaub     | 0         | neutral                                              |
| Krank      | 0         | neutral                                              |
| Feiertag   | 0         | neutral; gearbeitete Zeit zählt voll als Überstunden |
| Gleittag   | Regelsoll | baut Überstunden ab                                  |

„Automatisch“ stellt die Erkennung wieder her. Manuell gesetzte Tage sind im Kalender mit ✎
markiert.

### Pausen (Arbeitszeitgesetz)

| Arbeitszeit | Mindestpause |
| ----------- | ------------ |
| bis 6 h     | –            |
| über 6 h    | 30 min       |
| über 9 h    | 45 min       |

Ist die genommene Pause kürzer, wird der Rest automatisch abgezogen – höchstens so viel, dass die
jeweilige Schwelle nicht unterschritten wird (6:10 h ohne Pause ergeben 6:00 h). Ist der
automatische Abzug ausgeschaltet, erscheint stattdessen ein Hinweis. Über 10 h Nettoarbeitszeit
warnt das Add-on ebenfalls.

### Buchungen auf Arbeitspakete

Die Nettoarbeitszeit wird auf Viertelstunden gerundet und kann auf Arbeitspakete verteilt werden.
Die Anzeige rechts oben zeigt, ob noch Zeit offen ist (orange), alles verteilt ist (grün) oder
zu viel gebucht wurde (rot).

- Dauer per **−/+** in 0,25-h-Schritten oder Schnellwahl **0,25 · 0,50 · 1,00 · 2,00**
- **Rest** übernimmt die noch offene Zeit
- Mehrfaches Buchen auf dasselbe Paket am selben Tag wird zusammengefasst

### Projekte

Unter **Projekte** legst du deine Projekte mit Arbeitspaketen an – jeweils mit optionalem Code
und für Arbeitspakete optional mit Stundenbudget (Fortschrittsbalken). Elemente mit Buchungen
können nicht gelöscht, aber archiviert werden; archivierte Pakete sind nicht mehr buchbar.

### Kalender

Die Monatsübersicht zeigt pro Tag Nettozeit, Soll, Differenz, Ort und Tagesart, dazu
Wochensummen, die Home-Office-Quote und den Saldo. Tage mit offener Verteilung, Warnungen oder
vergessenem Ausstempeln sind markiert. Ein Klick auf einen Tag öffnet ihn.

### Überstundenkonto

Der Saldo umfasst den Übertrag sowie alle Tage ab „Zeiterfassung ab“ bis gestern; in der
Tagesansicht ist der heutige Tag bereits eingerechnet. Zukünftige Tage zählen nicht.
Wochenstunden lassen sich unter **Einstellungen → Arbeitszeitmodelle** mit einem
„Gültig ab“-Datum ändern – frühere Tage bleiben unverändert.

### Darstellung

Über den Theme-Umschalter in der Navigation wählst du zwischen Hell, Dunkel und System. Im Modus
„System“ übernimmt das Panel Farben, Schrift und Hell/Dunkel des aktiven Home-Assistant-Themes.

## Datenspeicherung

Die Daten liegen in der SQLite-Datenbank `/data/time_tracker.db` im persistenten
Add-on-Verzeichnis. Es wird vom Supervisor verwaltet, bleibt bei Updates erhalten und ist in
Home-Assistant-Backups des Add-ons enthalten.

## Support

Hast du Fragen oder ein Problem gefunden?

- [GitHub Issues](https://github.com/dunuld/hassio-addons/issues) – Fehler melden oder
  Verbesserungen vorschlagen
- [GitHub Discussions](https://github.com/dunuld/hassio-addons/discussions) – Fragen stellen und
  Ideen teilen

## Lizenz

MIT – siehe [LICENSE](https://github.com/dunuld/hassio-addons/blob/main/LICENSE).
