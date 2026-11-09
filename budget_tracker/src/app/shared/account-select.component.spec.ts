import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { Account } from '../../../shared/api-types';
import { AccountService } from '../core/account.service';
import AccountSelectComponent from './account-select.component';

const account = (id: number, overrides: Partial<Account> = {}): Account => ({
  id,
  iban: `DE0${id}`,
  bank: 'ING',
  name: `Konto ${id}`,
  color: '#ff9800',
  sort: id,
  includeInReports: true,
  statementCount: 0,
  balanceCents: null,
  balanceMonth: null,
  ...overrides,
});

describe('AccountSelectComponent', () => {
  let accounts: AccountService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [AccountSelectComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    accounts = TestBed.inject(AccountService);
  });

  afterEach(() => localStorage.clear());

  const render = () => {
    const fixture = TestBed.createComponent(AccountSelectComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  it('ist bei höchstens einem Konto unsichtbar', () => {
    accounts.accounts.set([account(1)]);
    expect(render().querySelector('select')).toBeNull();
  });

  it('listet die Konten und markiert ausgeblendete', () => {
    accounts.accounts.set([account(1), account(2, { includeInReports: false })]);
    const options = [...render().querySelectorAll('option')].map((o) => o.textContent?.trim());
    expect(options).toEqual(['Alle Konten', 'Konto 1', 'Konto 2 (ausgeblendet)']);
  });

  it('übernimmt die Auswahl und setzt sie auf „Alle Konten“ zurück', () => {
    accounts.accounts.set([account(1), account(2)]);
    const select = render().querySelector('select') as HTMLSelectElement;

    select.value = '2';
    select.dispatchEvent(new Event('change'));
    expect(accounts.selectedId()).toBe(2);

    select.value = '';
    select.dispatchEvent(new Event('change'));
    expect(accounts.selectedId()).toBeNull();
  });
});
