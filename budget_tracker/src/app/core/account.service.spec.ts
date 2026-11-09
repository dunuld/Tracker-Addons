import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { Account } from '../../../shared/api-types';
import { AccountService } from './account.service';

const mockAccount = (id: number, overrides: Partial<Account> = {}): Account => ({
  id,
  iban: `DE0000000000000000000${id}`,
  bank: 'ING',
  name: `Konto ${id}`,
  color: '#2196f3',
  sort: id,
  includeInReports: true,
  statementCount: 1,
  balanceCents: 1000,
  balanceMonth: '2026-10',
  ...overrides,
});

describe('AccountService', () => {
  let httpMock: HttpTestingController;
  let service: AccountService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
    service = TestBed.inject(AccountService);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('lädt die Konten und bietet die Auswahl erst ab zwei Konten an', async () => {
    const one = service.refresh();
    httpMock.expectOne('api/accounts').flush([mockAccount(1)]);
    await one;
    expect(service.hasMultiple()).toBe(false);

    const two = service.refresh();
    httpMock.expectOne('api/accounts').flush([mockAccount(1), mockAccount(2)]);
    await two;
    expect(service.hasMultiple()).toBe(true);
    expect(service.byId(2)?.name).toBe('Konto 2');
  });

  it('speichert die Auswahl im Browser', () => {
    service.select(2);
    expect(service.selectedId()).toBe(2);
    expect(localStorage.getItem('bt-account')).toBe('2');
    service.select(null);
    expect(localStorage.getItem('bt-account')).toBeNull();
  });

  it('setzt eine Auswahl zurück, deren Konto nicht mehr existiert', async () => {
    service.select(3);
    const done = service.refresh();
    httpMock.expectOne('api/accounts').flush([mockAccount(1), mockAccount(2)]);
    await done;
    expect(service.selectedId()).toBeNull();
  });

  it('funktioniert ohne verfügbaren Browser-Speicher', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blockiert');
    });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blockiert');
    });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const fresh = TestBed.inject(AccountService);
    expect(fresh.selectedId()).toBeNull();
    fresh.select(4);
    expect(fresh.selectedId()).toBe(4);
    get.mockRestore();
    set.mockRestore();
  });
});
