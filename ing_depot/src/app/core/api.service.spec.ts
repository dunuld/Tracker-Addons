import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ApiService } from './api.service';

describe('ApiService', () => {
  let api: ApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(ApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('ruft den Health-Check relativ zum Ingress-Pfad ab', () => {
    let version: string | undefined;
    api.health().subscribe((res) => (version = res.version));

    const req = http.expectOne('api/health');
    expect(req.request.method).toBe('GET');
    req.flush({ status: 'ok', version: '0.1.0' });
    expect(version).toBe('0.1.0');
  });

  it('lädt die Übersicht mit und ohne Jahr', () => {
    api.overview().subscribe();
    api.overview(2025).subscribe();
    http.expectOne('api/overview').flush({});
    http.expectOne('api/overview?year=2025').flush({});
  });

  it('lädt PDFs als multipart/form-data hoch', () => {
    api.uploadDocuments([new File(['a'], 'a.pdf'), new File(['b'], 'b.pdf')]).subscribe();
    const req = http.expectOne('api/documents');
    expect(req.request.method).toBe('POST');
    const names = (req.request.body as FormData).getAll('files').map((f) => (f as File).name);
    expect(names).toEqual(['a.pdf', 'b.pdf']);
    req.flush([]);
  });

  it('spricht die übrigen Endpunkte mit der passenden Methode an', () => {
    const opening = { isin: 'X', name: 'Y', date: '2020-01-01', quantity: 1, costCents: 100 };
    api.transactions().subscribe();
    api.addOpening(opening).subscribe();
    api.deleteTransaction(3).subscribe();
    api.documents().subscribe();
    api.deleteDocument(4).subscribe();
    api.scanInbox().subscribe();
    api.importFailures().subscribe();
    api.deleteImportFailure(5).subscribe();
    api.addPrice('IE00', { price: 12 }).subscribe();
    api.updateSecurity('IE00', { priceEntity: 'sensor.x' }).subscribe();

    const expectCall = (method: string, url: string) =>
      http.expectOne((r) => r.method === method && r.url === url).flush(null);
    expectCall('GET', 'api/transactions');
    expectCall('POST', 'api/transactions');
    expectCall('DELETE', 'api/transactions/3');
    expectCall('GET', 'api/documents');
    expectCall('DELETE', 'api/documents/4');
    expectCall('POST', 'api/inbox/scan');
    expectCall('GET', 'api/import-failures');
    expectCall('DELETE', 'api/import-failures/5');
    expectCall('POST', 'api/securities/IE00/prices');
    expectCall('PUT', 'api/securities/IE00');
    expect(api.documentUrl(9)).toBe('api/documents/9/file');
  });
});
