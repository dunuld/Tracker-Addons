import { applyHaTheme, clearHaTheme, getHaDocument, isDarkColor } from './ha-theme';

/** Baut ein Fake-HA-Dokument, dessen <html> die angegebenen CSS-Variablen trägt. */
function createHaDocument(vars: Record<string, string>): Document {
  const doc = document.implementation.createHTMLDocument('ha');
  for (const [name, value] of Object.entries(vars)) {
    doc.documentElement.style.setProperty(name, value);
  }
  // jsdom liefert für createHTMLDocument kein defaultView → das eigene Fenster nutzen
  Object.defineProperty(doc, 'defaultView', { value: window });
  return doc;
}

describe('ha-theme', () => {
  let target: HTMLElement;

  beforeEach(() => {
    target = document.createElement('div');
  });

  it('is not embedded when running top-level', () => {
    expect(getHaDocument()).toBeNull();
  });

  it('does nothing without an HA document', () => {
    expect(applyHaTheme(target, null)).toBeNull();
    expect(target.getAttribute('style')).toBeNull();
  });

  it('does nothing when the parent has no HA theme variables', () => {
    expect(applyHaTheme(target, createHaDocument({}))).toBeNull();
  });

  it('maps HA variables onto --app-* variables', () => {
    const haDoc = createHaDocument({
      '--primary-background-color': '#111111',
      '--card-background-color': '#1c1c1c',
      '--primary-text-color': '#e1e1e1',
      '--primary-color': '#ff9800',
      '--divider-color': 'rgba(225, 225, 225, 0.12)',
    });

    const info = applyHaTheme(target, haDoc);

    expect(info).toEqual({ dark: true });
    expect(target.style.getPropertyValue('--app-bg')).toBe('#111111');
    expect(target.style.getPropertyValue('--app-surface')).toBe('#1c1c1c');
    expect(target.style.getPropertyValue('--app-text')).toBe('#e1e1e1');
    expect(target.style.getPropertyValue('--app-primary')).toBe('#ff9800');
    expect(target.style.getPropertyValue('--app-border')).toBe('rgba(225, 225, 225, 0.12)');
    // nicht vorhandene HA-Variablen werden nicht gesetzt
    expect(target.style.getPropertyValue('--app-text-muted')).toBe('');
  });

  it('detects a light HA theme', () => {
    const haDoc = createHaDocument({ '--primary-background-color': '#fafafa' });
    expect(applyHaTheme(target, haDoc)).toEqual({ dark: false });
  });

  it('clears applied variables', () => {
    const haDoc = createHaDocument({
      '--primary-background-color': '#fafafa',
      '--primary-color': '#03a9f4',
    });
    applyHaTheme(target, haDoc);
    clearHaTheme(target);
    expect(target.style.getPropertyValue('--app-bg')).toBe('');
    expect(target.style.getPropertyValue('--app-primary')).toBe('');
  });

  it('classifies colors by brightness', () => {
    expect(isDarkColor('#111')).toBe(true);
    expect(isDarkColor('#111111')).toBe(true);
    expect(isDarkColor('rgb(28, 28, 28)')).toBe(true);
    expect(isDarkColor('#fafafa')).toBe(false);
    expect(isDarkColor('rgba(255, 255, 255, 1)')).toBe(false);
    expect(isDarkColor('not-a-color')).toBe(false);
  });
});
