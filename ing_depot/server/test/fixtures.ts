import { PDFDocument, StandardFonts } from 'pdf-lib';

/** Textzeilen synthetischer ING-Dokumente (Aufbau wie die echten PDFs, erfundene Daten). */

export interface TradeFixture {
  kind?: 'Kauf' | 'Kauf aus Sparplan' | 'Verkauf';
  order?: string;
  isin?: string;
  wkn?: string;
  name?: string;
  quantity?: string;
  price?: string;
  date?: string;
  gross?: string;
  fee?: string;
  taxes?: [string, string][];
  total?: string;
}

export function tradeLines(f: TradeFixture = {}): string[] {
  const kind = f.kind ?? 'Kauf';
  const sell = kind === 'Verkauf';
  return [
    'ING-DiBa AG · 60628 Frankfurt am Main',
    'Wertpapierabrechnung',
    kind,
    'Depotnummer 1234567890',
    'Depotinhaber Max Mustermann',
    `Ordernummer ${f.order ?? '12345678.001'}`,
    `ISIN (WKN) ${f.isin ?? 'IE00B4L5Y983'} (${f.wkn ?? 'A0RPWH'})`,
    `Wertpapierbezeichnung ${f.name ?? 'iShs Core MSCI World U.ETF'}`,
    'Registered Shs USD (Acc) o.N.',
    `Nominale Stück ${f.quantity ?? '3,00000'}`,
    `Kurs EUR ${f.price ?? '56,768'}`,
    'Handelsplatz Direktgeschäft',
    `Ausführungstag / -zeit ${f.date ?? '15.03.2026'} um 09:04:00 Uhr`,
    `Kurswert EUR ${f.gross ?? '170,30'}`,
    `Provision EUR ${f.fee ?? '2,98'}`,
    ...(f.taxes ?? []).map(([label, amount]) => `${label} EUR ${amount}`),
    `Endbetrag zu Ihren ${sell ? 'Gunsten' : 'Lasten'} EUR ${f.total ?? '173,28'}`,
    'Die Wertpapiere schreiben wir Ihrem Depot gut.',
  ];
}

export const BUY_LINES = tradeLines();

/** Verkauf von 2 Stück zu 80 € mit Steuern: 160,00 − 4,90 − 10,00 − 0,55 = 144,55 */
export const SELL_LINES = tradeLines({
  kind: 'Verkauf',
  order: '22222222.001',
  quantity: '2,00',
  price: '80,00',
  date: '20.06.2026',
  gross: '160,00',
  fee: '4,90',
  taxes: [
    ['Kapitalertragsteuer 25,00 %', '10,00'],
    ['Solidaritätszuschlag 5,50 %', '0,55'],
  ],
  total: '144,55',
});

export const DIVIDEND_LINES = [
  'Dividendengutschrift',
  'Depotnummer 1234567890',
  'ISIN (WKN) US5949181045 (870747)',
  'Wertpapierbezeichnung Microsoft Corp.',
  'Registered Shares DL-,00000625',
  'Nominale 20,00 Stück',
  'Ex-Tag 20.05.2026',
  'Zahltag 12.06.2026',
  'Zins-/Dividendensatz 0,51 USD',
  'Brutto USD 10,20',
  'Umg. z. Dev.-Kurs (1,1144) EUR 9,15',
  'QuSt 15,00 % (EUR 1,37) USD 1,53',
  'Gesamtbetrag zu Ihren Gunsten EUR 7,78',
];

export const EUR_DIVIDEND_LINES = [
  'Ertragsgutschrift',
  'ISIN (WKN) DE0008404005 (840400)',
  'Wertpapierbezeichnung Allianz SE',
  'Nominale 5,00 Stück',
  'Zahltag 12.05.2026',
  'Brutto EUR 77,00',
  'Kapitalertragsteuer 25,00 % EUR 19,25',
  'Solidaritätszuschlag 5,50 % EUR 1,05',
  'Gesamtbetrag zu Ihren Gunsten EUR 56,70',
];

export const STATEMENT_LINES = [
  'Jahresdepotauszug per 31.12.2025',
  'Depotnummer 1234567890',
  'Stück/Nominale Wertpapierbezeichnung ISIN Kurs Kurswert in EUR',
  '10 Stück iShs Core MSCI World U.ETF IE00B4L5Y983 50,00 EUR 500,00',
  'Verwahrart Girosammelverwahrung',
  '20 Stück Microsoft Corp. US5949181045 400,00 EUR 8.000,00',
  'Gesamtwert 8.500,00',
];

/** Fasst Zeilen zu einem „PDF“ für den Test-Reader zusammen (siehe `textReader`). */
export const fakePdf = (lines: string[]): Buffer => Buffer.from(lines.join('\n'), 'utf8');

/** PDF-Reader für Tests: der Dateiinhalt ist der Text, eine Zeile je Zeile. */
export const textReader = (file: Uint8Array): Promise<string[]> =>
  Promise.resolve(Buffer.from(file).toString('utf8').split('\n').filter(Boolean));

/** Echte PDF mit einer Textzeile je Eintrag (für den Weg über pdf.js). */
export async function realPdf(lines: string[]): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([595, 842]);
  lines.forEach((line, i) => page.drawText(line, { x: 60, y: 780 - i * 16, size: 10, font }));
  return Buffer.from(await pdf.save());
}
