import { TestBed } from '@angular/core/testing';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import UploadComponent from './upload.component';
import type { ImportResult } from '../../../../shared/api-types';

describe('UploadComponent', () => {
  let httpMock: HttpTestingController;

  const createMockImportResult = (): ImportResult => ({
    statement: {
      id: 1,
      accountId: 1,
      accountName: 'Girokonto',
      bank: 'TestBank',
      iban: 'DE12345678901234567890',
      year: 2024,
      month: 1,
      openingCents: 500000,
      closingCents: 380000,
      fileName: 'auszug.pdf',
      importedAt: '2024-01-15T10:00:00Z',
      transactionCount: 25,
    },
    periodFrom: '2024-01-01',
    periodTo: '2024-01-31',
    transactionCount: 25,
    accountCreated: false,
    uncategorizedCount: 3,
    sumCents: -120000,
    balanceOk: true,
    warnings: [],
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UploadComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should create the component', () => {
    const fixture = TestBed.createComponent(UploadComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should display the upload heading', () => {
    const fixture = TestBed.createComponent(UploadComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h2')?.textContent).toContain('PDF hochladen');
  });

  it('should display the drop zone label', () => {
    const fixture = TestBed.createComponent(UploadComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.drop-zone')?.textContent).toContain('PDF-Kontoauszug');
  });

  it('should handle successful file upload', async () => {
    const fixture = TestBed.createComponent(UploadComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    const mockResult = createMockImportResult();
    const file = new File(['dummy'], 'auszug.pdf', { type: 'application/pdf' });

    const uploadPromise = component.upload(file);
    const req = httpMock.expectOne((req) => req.url.includes('api/statements'));
    req.flush(mockResult);
    await uploadPromise;
    fixture.detectChanges();

    expect(component.result()).toBeTruthy();
    expect(component.result()!.transactionCount).toBe(25);
    expect(component.uploading()).toBe(false);
  });

  it('should show loading state during upload', () => {
    const fixture = TestBed.createComponent(UploadComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    const file = new File(['dummy'], 'auszug.pdf', { type: 'application/pdf' });
    expect(component.uploading()).toBe(false);

    component.upload(file);
    fixture.detectChanges();
    expect(component.uploading()).toBe(true);

    httpMock.expectOne((req) => req.url.includes('api/statements')).flush(createMockImportResult());
  });

  it('should handle upload error', async () => {
    const fixture = TestBed.createComponent(UploadComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    const file = new File(['dummy'], 'auszug.pdf', { type: 'application/pdf' });

    const uploadPromise = component.upload(file);
    const req = httpMock.expectOne((req) => req.url.includes('api/statements'));
    req.error(new ProgressEvent('error'));
    await uploadPromise;
    fixture.detectChanges();

    expect(component.error()).toBeTruthy();
    expect(component.uploading()).toBe(false);
  });

  it('should display import result details', async () => {
    const fixture = TestBed.createComponent(UploadComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    const mockResult = createMockImportResult();
    const file = new File(['dummy'], 'auszug.pdf', { type: 'application/pdf' });

    const uploadPromise = component.upload(file);
    const req = httpMock.expectOne((req) => req.url.includes('api/statements'));
    req.flush(mockResult);
    await uploadPromise;
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.result')?.textContent).toContain('Import erfolgreich');
    expect(compiled.querySelector('.result')?.textContent).toContain('25');
  });

  it('should show balance warning when balanceOk is false', async () => {
    const fixture = TestBed.createComponent(UploadComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    const mockResult = createMockImportResult();
    mockResult.balanceOk = false;
    const file = new File(['dummy'], 'auszug.pdf', { type: 'application/pdf' });

    const uploadPromise = component.upload(file);
    const req = httpMock.expectOne((req) => req.url.includes('api/statements'));
    req.flush(mockResult);
    await uploadPromise;
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.warning')?.textContent).toContain('Saldo-Differenz');
  });

  it('should display warnings', async () => {
    const fixture = TestBed.createComponent(UploadComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    const mockResult = createMockImportResult();
    mockResult.warnings = ['Warnung 1', 'Warnung 2'];
    const file = new File(['dummy'], 'auszug.pdf', { type: 'application/pdf' });

    const uploadPromise = component.upload(file);
    const req = httpMock.expectOne((req) => req.url.includes('api/statements'));
    req.flush(mockResult);
    await uploadPromise;
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const warnings = compiled.querySelectorAll('.warnings .warning');
    expect(warnings.length).toBe(2);
  });

  it('should set file name', () => {
    const fixture = TestBed.createComponent(UploadComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    component.fileName.set('test-auszug.pdf');
    expect(component.fileName()).toBe('test-auszug.pdf');
  });

  it('should format euro amounts', () => {
    const fixture = TestBed.createComponent(UploadComponent);
    const component = fixture.componentInstance;
    // formatEuro uses Intl.NumberFormat which produces non-breaking space before €
    expect(component.formatEuro(100000)).toContain('1.000,00');
    expect(component.formatEuro(-4599)).toContain('-45,99');
  });

  describe('Duplikate und Dateiauswahl', () => {
    const file = () => new File(['dummy'], 'auszug.pdf', { type: 'application/pdf' });
    const duplicate = {
      error: 'Dieser Auszug wurde bereits importiert',
      code: 'DUPLICATE_STATEMENT',
    };

    afterEach(() => vi.restoreAllMocks());

    function start() {
      const fixture = TestBed.createComponent(UploadComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;
      const done = component.upload(file());
      const first = httpMock.expectOne('api/statements');
      return { fixture, component, done, first };
    }

    it('ersetzt nach Bestätigung einen bereits importierten Auszug', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      const { component, done, first } = start();
      first.flush(duplicate, { status: 409, statusText: 'Conflict' });

      const replace = await vi.waitFor(() => httpMock.expectOne('api/statements?replace=true'));
      expect(replace.request.method).toBe('POST');
      expect(replace.request.body).toBeInstanceOf(FormData);
      replace.flush(createMockImportResult());
      await done;

      expect(confirmSpy.mock.calls[0]![0]).toContain('bereits importiert');
      expect(component.result()?.statement.id).toBe(1);
      expect(component.error()).toBeNull();
      expect(component.uploading()).toBe(false);
    });

    it('zeigt die Duplikat-Meldung, wenn Ersetzen abgelehnt wird', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      const { component, done, first } = start();
      first.flush(duplicate, { status: 409, statusText: 'Conflict' });
      await done;

      httpMock.expectNone('api/statements?replace=true');
      expect(component.error()).toBe(duplicate.error);
      expect(component.result()).toBeNull();
    });

    it('zeigt die Server-Meldung, wenn das Ersetzen fehlschlägt', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      const { fixture, component, done, first } = start();
      first.flush(duplicate, { status: 409, statusText: 'Conflict' });
      const replace = await vi.waitFor(() => httpMock.expectOne('api/statements?replace=true'));
      replace.flush(
        { error: 'Die Datei ist kein PDF-Dokument.' },
        { status: 400, statusText: 'Bad Request' },
      );
      await done;
      fixture.detectChanges();

      expect(component.error()).toBe('Die Datei ist kein PDF-Dokument.');
      expect(component.uploading()).toBe(false);
    });

    it('zeigt Validierungsfehler des Servers direkt an', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm');
      const { component, done, first } = start();
      first.flush(
        { error: 'Die Datei ist zu groß (maximal 10 MB).' },
        { status: 413, statusText: 'Too Large' },
      );
      await done;

      expect(confirmSpy).not.toHaveBeenCalled();
      expect(component.error()).toBe('Die Datei ist zu groß (maximal 10 MB).');
    });

    it('lädt die gewählte Datei hoch und setzt vorherige Ergebnisse zurück', async () => {
      const fixture = TestBed.createComponent(UploadComponent);
      const component = fixture.componentInstance;
      component.error.set('alter Fehler');
      component.result.set(createMockImportResult());

      const input = document.createElement('input');
      Object.defineProperty(input, 'files', { value: [file()] });
      const done = component.onFileSelected({ target: input } as unknown as Event);

      expect(component.fileName()).toBe('auszug.pdf');
      expect(component.result()).toBeNull();
      expect(component.error()).toBeNull();
      httpMock.expectOne('api/statements').flush(createMockImportResult());
      await done;
      expect(component.result()).not.toBeNull();
    });

    it('ignoriert eine leere Dateiauswahl', async () => {
      const fixture = TestBed.createComponent(UploadComponent);
      const input = document.createElement('input');
      Object.defineProperty(input, 'files', { value: [] });
      await fixture.componentInstance.onFileSelected({ target: input } as unknown as Event);
      httpMock.expectNone('api/statements');
      expect(fixture.componentInstance.fileName()).toBe('');
    });
  });

  it('weist auf ein neu angelegtes Konto hin und lädt die Kontenliste neu', async () => {
    const fixture = TestBed.createComponent(UploadComponent);
    fixture.detectChanges();
    const file = new File(['dummy'], 'auszug.pdf', { type: 'application/pdf' });

    const uploadPromise = fixture.componentInstance.upload(file);
    httpMock
      .expectOne((req) => req.url.includes('api/statements'))
      .flush({ ...createMockImportResult(), accountCreated: true });
    await uploadPromise;
    httpMock.expectOne('api/accounts').flush([]);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent;
    expect(text).toContain('Girokonto (DE12345678901234567890)');
    expect(text).toContain('Neu angelegt');
  });

  it('ignoriert Fehler beim Nachladen der Kontenliste', async () => {
    const fixture = TestBed.createComponent(UploadComponent);
    const component = fixture.componentInstance;
    const uploadPromise = component.upload(new File(['x'], 'a.pdf'));
    httpMock
      .expectOne((req) => req.url.includes('api/statements'))
      .flush({ ...createMockImportResult(), accountCreated: true });
    await uploadPromise;
    httpMock.expectOne('api/accounts').error(new ProgressEvent('error'));
    await Promise.resolve();
    expect(component.error()).toBeNull();
  });
});
