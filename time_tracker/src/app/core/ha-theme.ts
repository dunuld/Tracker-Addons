/**
 * Brücke zum Home-Assistant-Theme.
 *
 * Unter HA-Ingress läuft die App in einem iframe auf demselben Origin wie das
 * HA-Frontend. Dadurch können wir die CSS-Variablen des aktiven HA-Themes aus
 * dem Eltern-Dokument lesen und auf unsere eigenen `--app-*`-Variablen abbilden,
 * sodass das Panel farblich nahtlos in Home Assistant eingebettet wirkt.
 *
 * Läuft die App eigenständig (oder ist der Zugriff aufs Eltern-Dokument
 * blockiert), passiert nichts und die Standard-Farben aus styles.css greifen.
 */

/** HA-Variable(n) → unsere Variable. Die erste nicht-leere HA-Variable gewinnt. */
const VARIABLE_MAP: readonly (readonly [string, readonly string[]])[] = [
  ['--app-bg', ['--primary-background-color']],
  ['--app-surface', ['--card-background-color', '--ha-card-background']],
  ['--app-bg-secondary', ['--secondary-background-color']],
  ['--app-text', ['--primary-text-color']],
  ['--app-text-secondary', ['--secondary-text-color']],
  ['--app-text-muted', ['--disabled-text-color']],
  ['--app-border', ['--divider-color']],
  ['--app-primary', ['--primary-color']],
  ['--app-text-on-primary', ['--text-primary-color']],
  ['--app-error-text', ['--error-color']],
  ['--app-success-text', ['--success-color']],
  ['--app-warning-text', ['--warning-color']],
  ['--app-font-family', ['--ha-font-family-body', '--mdc-typography-font-family']],
  ['--app-radius', ['--ha-card-border-radius']],
];

export interface HaThemeInfo {
  /** true, wenn das HA-Theme dunkel ist. */
  dark: boolean;
}

/** Liefert das Dokument des HA-Frontends oder `null`, wenn nicht eingebettet. */
export function getHaDocument(): Document | null {
  try {
    if (window.parent === window) return null;
    const doc = window.parent.document;
    // Zugriff auf documentElement wirft bei Cross-Origin
    return doc?.documentElement ? doc : null;
  } catch {
    return null;
  }
}

/**
 * Überträgt die HA-Theme-Variablen auf `target` (unser <html>).
 * Gibt `null` zurück, wenn kein HA-Theme gefunden wurde.
 */
export function applyHaTheme(
  target: HTMLElement = document.documentElement,
  haDoc: Document | null = getHaDocument(),
): HaThemeInfo | null {
  if (!haDoc) return null;
  const view = haDoc.defaultView;
  if (!view) return null;

  let styles: CSSStyleDeclaration;
  try {
    styles = view.getComputedStyle(haDoc.documentElement);
  } catch {
    return null;
  }

  const primaryBg = styles.getPropertyValue('--primary-background-color').trim();
  if (!primaryBg) return null; // kein HA-Frontend (oder Theme noch nicht geladen)

  for (const [ours, candidates] of VARIABLE_MAP) {
    const value = candidates
      .map((name) => styles.getPropertyValue(name).trim())
      .find((v) => v.length > 0);
    if (value) {
      target.style.setProperty(ours, value);
    } else {
      target.style.removeProperty(ours);
    }
  }
  return { dark: isDarkColor(primaryBg) };
}

/** Entfernt alle von applyHaTheme gesetzten Variablen wieder. */
export function clearHaTheme(target: HTMLElement = document.documentElement): void {
  for (const [ours] of VARIABLE_MAP) target.style.removeProperty(ours);
}

/**
 * Beobachtet Theme-Wechsel im HA-Frontend (HA setzt die Variablen als
 * Inline-Style bzw. Klassen auf sein <html>) und ruft `onChange` auf.
 * Gibt eine Funktion zum Beenden der Beobachtung zurück.
 */
export function watchHaTheme(onChange: () => void, haDoc: Document | null = getHaDocument()) {
  if (!haDoc || typeof MutationObserver === 'undefined') return () => undefined;
  const observer = new MutationObserver(() => onChange());
  try {
    observer.observe(haDoc.documentElement, {
      attributes: true,
      attributeFilter: ['style', 'class'],
    });
  } catch {
    return () => undefined;
  }
  return () => observer.disconnect();
}

/** Grobe Helligkeitsprüfung für `#rgb`, `#rrggbb` und `rgb()/rgba()`. */
export function isDarkColor(color: string): boolean {
  const rgb = parseColor(color);
  if (!rgb) return false;
  const [r, g, b] = rgb;
  // relative Luminanz nach ITU-R BT.709 (ohne Gamma, genügt hier)
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance < 0.5;
}

function parseColor(color: string): [number, number, number] | null {
  const c = color.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})([0-9a-f]{2})?$/.exec(c);
  if (hex) {
    let h = hex[1]!;
    if (h.length === 3) h = [...h].map((x) => x + x).join('');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(c);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  return null;
}
