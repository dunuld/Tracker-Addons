# Changelog

## 0.1.0 (unveröffentlicht)

### Hinzugefügt

- Import von ING-PDFs: Wertpapierabrechnungen (Kauf, Sparplan, Verkauf), Ertragsabrechnungen und
  Depotauszüge – per Upload oder aus einem Eingangsordner, mit Duplikaterkennung
- Jahresübersicht ab 01.01.: investierter Betrag (brutto/netto), realisierte Gewinne (FIFO),
  ausgezahlte Dividenden, Kursgewinn seit Kauf und seit Jahresbeginn in Euro und Prozent
- Positionsliste, Monatsverlauf, Buchungsliste und manueller Startbestand
- Kurse aus Dokumenten, manuell oder aus einer Home-Assistant-Entität
- Kennzahlen als Home-Assistant-Sensoren (`sensor.ing_depot_*`)
- Hinweise bei Datenlücken (fehlende Käufe, fehlende Kurse, Abweichung zum Depotauszug)

### Technik

- Angular 22, Node.js 24/Express (TypeScript), SQLite (`node:sqlite`), pdf.js
- Zugriff ausschließlich über Home Assistant Ingress (IP-Filter auf den Ingress-Proxy)
