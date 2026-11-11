import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { DepotDocument, ImportFailure, ImportResult } from '../../../../shared/api-types';
import ImportComponent from './import.component';

const document: DepotDocument = {
  id: 7,
  type: 'buy',
  fileName: 'kauf.pdf',
  date: '2026-03-15',
  reference: '123.001',
  source: 'upload',
  importedAt: '2026-03-16T10:00:00Z',
  summary: 'Kauf 3 × MSCI World',
};
const failure: ImportFailure = {
  id: 2,
  fileName: 'unbekannt.pdf',
  reason: 'Unbekannte Dokumentart.',
  createdAt: '2026-03-16T10:00:00Z',
};
const results: ImportResult[] = [
  { fileName: 'kauf.pdf', status: 'imported', message: 'Kauf 3 × MSCI World', document },
  { fileName: 'kopie.pdf', status: 'duplicate', message: 'Bereits importiert.' },
  { fileName: 'x.pdf', status: 'failed', message: 'Unbekannte Dokumentart.' },
];
const serverError = { status: 500, statusText: 'Server Error' };

/** Vergleich ohne Leerraum – Zellen und Elemente grenzen im DOM ohne Abstand aneinander. */
const sq = (text: string): string => text.replace(/\s+/g, '');

describe('ImportComponent', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ImportComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function flushLists(documents: DepotDocument[] = [document], failures: ImportFailure[] = []) {
    http.expectOne('api/documents').flush(documents);
    http.expectOne('api/import-failures').flush(failures);
  }

  function render(documents: DepotDocument[] = [document], failures: ImportFailure[] = []) {
    const fixture = TestBed.createComponent(ImportComponent);
    fixture.detectChanges();
    flushLists(documents, failures);
    const el = fixture.nativeElement as HTMLElement;
    const text = () => {
      fixture.detectChanges();
      return (el.textContent ?? '').replace(/\s+/g, '');
    };
    return { fixture, el, text, component: fixture.componentInstance };
  }

  it('listet Dokumente und nicht erkannte Dateien', () => {
    const { el, text } = render([document], [failure]);
    expect(text()).toContain(sq('15.03.2026 Kauf Kauf 3 × MSCI World kauf.pdf'));
    expect(text()).toContain(sq('unbekannt.pdf Unbekannte Dokumentart.'));
    expect(el.querySelector('tbody a')?.getAttribute('href')).toBe('api/documents/7/file');
  });

  it('zeigt einen Hinweis ohne Dokumente', () => {
    const { text } = render([]);
    expect(text()).toContain(sq('Noch keine Dokumente importiert'));
    expect(text()).not.toContain(sq('Nicht erkannt'));
  });

  it('lädt PDFs hoch und zeigt das Ergebnis je Datei', () => {
    const { el, text, component } = render();
    component.upload([new File(['a'], 'kauf.pdf'), new File(['b'], 'notiz.txt')]);
    expect(component.busy()).toBe(true);
    expect(text()).toContain(sq('Importiere …'));

    const req = http.expectOne('api/documents');
    expect((req.request.body as FormData).getAll('files')).toHaveLength(1);
    req.flush(results);
    flushLists();

    expect(component.busy()).toBe(false);
    expect(text()).toContain(sq('kauf.pdf – Importiert: Kauf 3 × MSCI World'));
    expect(text()).toContain(sq('kopie.pdf – Bereits vorhanden'));
    expect(text()).toContain(sq('x.pdf – Fehler'));
    expect(el.querySelectorAll('.results .alert.success')).toHaveLength(1);
    expect(el.querySelectorAll('.results .alert.warning')).toHaveLength(1);
    expect(el.querySelectorAll('.results .alert.error')).toHaveLength(1);
  });

  it('lehnt eine Auswahl ohne PDF ab', () => {
    const { component, text } = render();
    component.upload([new File(['b'], 'notiz.txt')]);
    expect(text()).toContain(sq('Bitte PDF-Dateien auswählen'));
    component.upload(null);
    expect(component.busy()).toBe(false);
  });

  it('nimmt Dateien per Auswahl und per Drag & Drop an', () => {
    const { component, el, fixture } = render();
    const file = new File(['a'], 'kauf.PDF');

    const input = { files: [file] as unknown as FileList, value: 'C:\\kauf.PDF' };
    component.onFileInput(input as HTMLInputElement);
    expect(input.value).toBe('');
    http.expectOne('api/documents').flush([]);
    flushLists();

    const dragOver = { preventDefault: vi.fn() } as unknown as DragEvent;
    component.onDragOver(dragOver);
    fixture.detectChanges();
    expect(dragOver.preventDefault).toHaveBeenCalled();
    expect(el.querySelector('.dropzone.dragging')).toBeTruthy();

    const drop = { preventDefault: vi.fn(), dataTransfer: { files: [file] } };
    component.onDrop(drop as unknown as DragEvent);
    expect(component.dragging()).toBe(false);
    http.expectOne('api/documents').flush([]);
    flushLists();

    el.querySelector('.dropzone')!.dispatchEvent(new Event('dragleave'));
    expect(component.dragging()).toBe(false);
  });

  it('prüft den Eingangsordner', () => {
    const { el, text } = render();
    el.querySelectorAll<HTMLButtonElement>('.dropzone button')[1]!.click();
    http.expectOne('api/inbox/scan').flush(results.slice(0, 1));
    flushLists();
    expect(text()).toContain(sq('kauf.pdf – Importiert'));
  });

  it('löscht Dokumente und blendet Fehler aus', () => {
    const { el, fixture } = render([document], [failure]);
    fixture.detectChanges();
    const buttons = el.querySelectorAll<HTMLButtonElement>('tbody button');
    buttons[0]!.click();
    http.expectOne('api/import-failures/2').flush(null);
    flushLists();
    buttons[1]!.click();
    http.expectOne('api/documents/7').flush(null);
    flushLists([]);
  });

  it('zeigt Fehler des Servers an', () => {
    const { component, text } = render();
    component.upload([new File(['a'], 'kauf.pdf')]);
    http.expectOne('api/documents').flush({ error: 'Zu groß' }, { status: 413, statusText: 'x' });
    expect(component.busy()).toBe(false);
    expect(text()).toContain(sq('Zu groß'));

    component.scanInbox();
    http.expectOne('api/inbox/scan').flush(null, serverError);
    expect(text()).toContain(sq('Der Eingangsordner konnte nicht geprüft werden'));

    component.removeDocument(document);
    http.expectOne('api/documents/7').flush(null, serverError);
    component.removeFailure(failure);
    http.expectOne('api/import-failures/2').flush(null, serverError);
    expect(text()).toContain(sq('Löschen fehlgeschlagen'));

    component.load();
    http.expectOne('api/documents').flush(null, serverError);
    http.expectOne('api/import-failures').flush(null, serverError);
    expect(text()).toContain(sq('Die Fehlerliste konnte nicht geladen werden'));
  });
});
