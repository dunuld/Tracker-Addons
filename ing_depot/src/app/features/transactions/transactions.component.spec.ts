import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { Transaction } from '../../../../shared/api-types';
import TransactionsComponent from './transactions.component';

const base: Transaction = {
  id: 1,
  documentId: 7,
  type: 'buy',
  date: '2026-03-15',
  isin: 'IE00B4L5Y983',
  name: 'MSCI World',
  quantity: 3,
  price: 56.768,
  grossCents: 17030,
  feeCents: 298,
  taxCents: 0,
  totalCents: 17328,
};
const transactions: Transaction[] = [
  base,
  { ...base, id: 2, documentId: 8, type: 'dividend', date: '2025-06-12', price: 0 },
  { ...base, id: 3, documentId: null, type: 'opening', date: '2020-01-15' },
];

/** Vergleich ohne Leerraum – Zellen und Elemente grenzen im DOM ohne Abstand aneinander. */
const sq = (text: string): string => text.replace(/\s+/g, '');

describe('TransactionsComponent', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TransactionsComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function render(data: Transaction[] = transactions) {
    const fixture = TestBed.createComponent(TransactionsComponent);
    fixture.detectChanges();
    http.expectOne('api/transactions').flush(data);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const rows = () => {
      fixture.detectChanges();
      return [...el.querySelectorAll('tbody tr')].map((row) =>
        (row.textContent ?? '').replace(/\s+/g, ''),
      );
    };
    return { fixture, el, rows, component: fixture.componentInstance };
  }

  it('listet Buchungen mit PDF-Link bzw. Löschen-Schaltfläche', () => {
    const { el, rows } = render();
    expect(rows()).toHaveLength(3);
    expect(rows()[0]).toContain(sq('15.03.2026 Kauf MSCI World IE00B4L5Y983 3 56,768 €'));
    expect(rows()[1]).toContain(sq('Ertrag'));
    expect(rows()[1]).toContain(sq(' – '));
    expect(rows()[2]).toContain(sq('Startbestand'));
    expect(el.querySelector('tbody a')?.getAttribute('href')).toBe('api/documents/7/file');
    expect(el.querySelectorAll('tbody button')).toHaveLength(1);
  });

  it('filtert nach Jahr', () => {
    const { el, rows } = render();
    const select = el.querySelector('select')!;
    expect([...select.options].map((o) => o.textContent)).toEqual(['Alle', '2026', '2025', '2020']);
    select.value = '2025';
    select.dispatchEvent(new Event('change'));
    expect(rows()).toHaveLength(1);
    select.value = '';
    select.dispatchEvent(new Event('change'));
    expect(rows()).toHaveLength(3);
  });

  it('zeigt einen Hinweis ohne Buchungen und Ladefehler', () => {
    const { rows, component, el, fixture } = render([]);
    expect(rows()[0]).toContain(sq('Keine Buchungen vorhanden'));
    component.load();
    http
      .expectOne('api/transactions')
      .flush({ error: 'Kaputt' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(el.querySelector('.alert.error')?.textContent).toContain('Kaputt');
  });

  it('erfasst einen Startbestand nach Prüfung der Eingaben', () => {
    const { component } = render([]);

    component.addOpening();
    expect(component.formError()).toContain('ISIN und Kaufdatum');

    component.form = {
      isin: ' us5949181045 ',
      name: ' Microsoft ',
      date: '2020-01-15',
      quantity: 'x',
      cost: '4.000,00',
    };
    component.addOpening();
    expect(component.formError()).toContain('Stückzahl und Einstandswert');

    component.form.quantity = '20';
    component.addOpening();
    const req = http.expectOne('api/transactions');
    expect(req.request.body).toEqual({
      isin: 'US5949181045',
      name: 'Microsoft',
      date: '2020-01-15',
      quantity: 20,
      costCents: 400000,
    });
    req.flush(transactions[2]!);
    http.expectOne('api/transactions').flush([transactions[2]!]);
    expect(component.formError()).toBeNull();
    expect(component.form.isin).toBe('');
  });

  it('zeigt Serverfehler beim Speichern und Löschen', () => {
    const { component } = render();
    component.form = {
      isin: 'US5949181045',
      name: '',
      date: '2020-01-15',
      quantity: '1',
      cost: '1',
    };
    component.addOpening();
    http
      .expectOne('api/transactions')
      .flush({ error: 'Ungültige ISIN.' }, { status: 400, statusText: 'Bad Request' });
    expect(component.formError()).toBe('Ungültige ISIN.');

    component.remove(transactions[2]!);
    http
      .expectOne('api/transactions/3')
      .flush({ error: 'Nein' }, { status: 400, statusText: 'Bad Request' });
    expect(component.error()).toBe('Nein');
  });

  it('löscht einen Startbestand', () => {
    const { el } = render();
    el.querySelector<HTMLButtonElement>('tbody button')!.click();
    const req = http.expectOne('api/transactions/3');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
    http.expectOne('api/transactions').flush(transactions.slice(0, 2));
  });
});
