import { getDocument, VerbosityLevel } from 'pdfjs-dist/legacy/build/pdf.mjs';

/** Ein zusammenhängendes Textstück einer Zeile mit seiner horizontalen Lage (PDF-Punkte). */
export interface TextSegment {
  x: number;
  right: number;
  text: string;
}

/** Eine rekonstruierte Textzeile; Segmente sind von links nach rechts sortiert. */
export interface TextLine {
  /** 1-basiert */
  page: number;
  /** Grundlinie in PDF-Koordinaten (größer = weiter oben) */
  y: number;
  segments: TextSegment[];
  /** Segmente mit einem Leerzeichen verbunden */
  text: string;
}

/** Maximale Abweichung der Grundlinie, damit Textstücke als eine Zeile gelten. */
const LINE_TOLERANCE = 2.5;

interface RawItem {
  str: string;
  width: number;
  transform: number[];
}

/** Baut aus Textstücken einer Seite Zeilen (oben → unten, links → rechts). */
export function groupIntoLines(page: number, items: RawItem[]): TextLine[] {
  const pieces = items
    .filter((item) => item.str.trim().length > 0)
    .map((item) => ({
      x: item.transform[4]!,
      y: item.transform[5]!,
      right: item.transform[4]! + item.width,
      text: item.str.trim().replace(/\s+/g, ' '),
    }))
    .sort((a, b) => b.y - a.y || a.x - b.x);

  const lines: { y: number; segments: TextSegment[] }[] = [];
  for (const piece of pieces) {
    const current = lines.at(-1);
    if (current && Math.abs(current.y - piece.y) <= LINE_TOLERANCE) {
      current.segments.push({ x: piece.x, right: piece.right, text: piece.text });
    } else {
      lines.push({ y: piece.y, segments: [{ x: piece.x, right: piece.right, text: piece.text }] });
    }
  }

  return lines.map(({ y, segments }) => {
    segments.sort((a, b) => a.x - b.x);
    return { page, y, segments, text: segments.map((s) => s.text).join(' ') };
  });
}

/** Extrahiert alle Textzeilen eines PDFs, seitenübergreifend in Lesereihenfolge. */
export async function extractLines(pdf: Uint8Array): Promise<TextLine[]> {
  // pdf.js übernimmt den Puffer (detached) – daher eine Kopie übergeben.
  const loadingTask = getDocument({
    data: new Uint8Array(pdf),
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: VerbosityLevel.ERRORS,
  });
  const doc = await loadingTask.promise;
  try {
    const lines: TextLine[] = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      const items = content.items.filter((item): item is RawItem & typeof item => 'str' in item);
      lines.push(...groupIntoLines(pageNumber, items));
      page.cleanup();
    }
    return lines;
  } finally {
    await loadingTask.destroy();
  }
}
