import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { Overview, Position } from '../../../../shared/api-types';
import OverviewComponent from './overview.component';

const position: Position = {
  isin: 'IE00B4L5Y983',
  name: 'MSCI World',
  quantity: 5,
  costCents: 30250,
  price: 80,
  priceDate: '2026-06-30',
  priceSource: 'manual',
  priceEntity: null,
  valueCents: 40000,
  gainCents: 9750,
  gainPct: 32.23,
  ytdGainCents: -2850,
  ytdGainPct: -2.5,
  realizedCents: 23250,
  dividendsNetCents: 750,
};

function overview(patch: Partial<Overview> = {}): Overview {
  return {
    year: 2026,
    years: [2026, 2025],
    asOf: '2026-07-01',
    investedGrossCents: 60500,
    investedNetCents: -43500,
    feesCents: 1500,
    realizedCents: 23250,
    dividendsGrossCents: 1000,
    dividendsNetCents: 750,
    taxesCents: 3250,
    valueCents: 40000,
    costCents: 30250,
    gainCents: 9750,
    gainPct: 32.23,
    ytdGainCents: -2850,
    ytdGainPct: -2.5,
    exemptionCents: 100000,
    exemptionUsedCents: 24250,
    positions: [position],
    monthly: Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      investedCents: i === 1 ? 60500 : 0,
      dividendsNetCents: i === 5 ? 750 : 0,
      realizedCents: 0,
    })),
    warnings: ['Es fehlt ein Startbestand.'],
    ...patch,
  };
}

/** Vergleich ohne Leerraum – Zellen und Elemente grenzen im DOM ohne Abstand aneinander. */
const sq = (text: string): string => text.replace(/\s+/g, '');

describe('OverviewComponent', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [OverviewComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function render(data: Overview | null = overview()) {
    const fixture = TestBed.createComponent(OverviewComponent);
    fixture.detectChanges();
    if (data) {
      http.expectOne('api/overview').flush(data);
      fixture.detectChanges();
    }
    const el = fixture.nativeElement as HTMLElement;
    const text = () => {
      fixture.detectChanges();
      return (el.textContent ?? '').replace(/\s+/g, '');
    };
    return { fixture, el, text, component: fixture.componentInstance };
  }

  it('zeigt Kennzahlen, Hinweise, Monatsverlauf und Positionen', () => {
    const { el, text } = render();
    expect(text()).toContain(sq('Investiert 2026 605,00 €'));
    expect(text()).toContain(sq('netto -435,00 € nach Verkäufen'));
    expect(text()).toContain(sq('Realisierte Gewinne +232,50 €'));
    expect(text()).toContain(sq('Dividenden ausgezahlt 7,50 €'));
    expect(text()).toContain(sq('Kursgewinn seit 01.01. -28,50 € -2,50 %'));
    expect(text()).toContain(sq('Kursgewinn seit Kauf +97,50 € +32,23 %'));
    expect(text()).toContain(sq('Freistellungsauftrag: 242,50 € von 1.000,00 €'));
    expect(el.querySelector('.alert.warning')?.textContent).toContain('Startbestand');
    expect(el.querySelectorAll('.bar-group')).toHaveLength(12);
    expect(el.querySelectorAll<HTMLElement>('.bar.invested')[1]!.style.height).toBe('100%');
    expect(el.querySelectorAll<HTMLElement>('.bar.dividends')[5]!.style.height).toBe('1%');
    expect(text()).toContain(sq('MSCI World IE00B4L5Y983'));
    expect(text()).toContain(sq('30.06.2026 · manuell'));
    expect(el.querySelector('.tile-value.neg')).toBeTruthy();
  });

  it('zeigt einen Hinweis für ein leeres Depot', () => {
    const { el, text } = render(
      overview({ positions: [], years: [2026], investedGrossCents: 0, exemptionCents: 0 }),
    );
    expect(text()).toContain(sq('Noch keine Daten vorhanden'));
    expect(el.querySelector('.tiles')).toBeNull();
  });

  it('blendet Monatsverlauf und Freistellungsauftrag aus, wenn nichts vorliegt', () => {
    const { el, text, component } = render(
      overview({
        positions: [],
        exemptionCents: 0,
        monthly: overview().monthly.map((m) => ({ ...m, investedCents: 0, dividendsNetCents: 0 })),
      }),
    );
    expect(el.querySelector('.bars')).toBeNull();
    expect(text()).not.toContain(sq('Freistellungsauftrag'));
    expect(text()).toContain(sq('Keine Positionen in diesem Jahr'));
    expect(component.sourceLabel({ ...position, priceSource: null })).toBe('');
  });

  it('wechselt das Jahr', () => {
    const { el, text } = render();
    const select = el.querySelector('select')!;
    select.value = '2025';
    select.dispatchEvent(new Event('change'));
    http.expectOne('api/overview?year=2025').flush(overview({ year: 2025, asOf: '2025-12-31' }));
    expect(text()).toContain(sq('Investiert 2025'));
    expect(text()).toContain(sq('Stand 31.12.2025'));
  });

  it('zeigt Ladefehler an', () => {
    const { text } = render(null);
    expect(text()).toContain(sq('Lade …'));
    http
      .expectOne('api/overview')
      .flush({ error: 'Kaputt' }, { status: 500, statusText: 'Server Error' });
    expect(text()).toContain(sq('Kaputt'));
  });

  it('speichert einen manuellen Kurs und die Kurs-Entität', () => {
    const { el, component, fixture } = render();
    el.querySelector<HTMLButtonElement>('td.actions button')!.click();
    fixture.detectChanges();
    expect(el.querySelector('.edit-row')).toBeTruthy();

    component.priceInput = 'abc';
    component.save(position);
    fixture.detectChanges();
    expect(el.querySelector('.form-error')?.textContent).toContain('gültigen Kurs');

    component.priceInput = '82,50';
    component.entityInput = ' sensor.msci_world ';
    component.save(position);
    const put = http.expectOne('api/securities/IE00B4L5Y983');
    expect(put.request.body).toEqual({ priceEntity: 'sensor.msci_world' });
    put.flush(null);
    const post = http.expectOne('api/securities/IE00B4L5Y983/prices');
    expect(post.request.body).toEqual({ price: 82.5 });
    post.flush(null);
    http.expectOne('api/overview?year=2026').flush(overview());
    fixture.detectChanges();
    expect(el.querySelector('.edit-row')).toBeNull();
  });

  it('speichert nur den Kurs bzw. nur die Entität und zeigt Serverfehler', () => {
    const { component } = render();

    component.edit(position);
    component.priceInput = '90';
    component.save(position);
    http.expectOne('api/securities/IE00B4L5Y983/prices').flush(null);
    http.expectOne('api/overview?year=2026').flush(overview());

    const withEntity = { ...position, priceEntity: 'sensor.alt' };
    component.edit(withEntity);
    expect(component.entityInput).toBe('sensor.alt');
    component.entityInput = '';
    component.save(withEntity);
    const put = http.expectOne('api/securities/IE00B4L5Y983');
    expect(put.request.body).toEqual({ priceEntity: null });
    put.flush(null);
    http.expectOne('api/overview?year=2026').flush(overview());

    component.edit(position);
    component.priceInput = '90';
    component.save(position);
    http
      .expectOne('api/securities/IE00B4L5Y983/prices')
      .flush({ error: 'Ungültig' }, { status: 400, statusText: 'Bad Request' });
    expect(component.editError()).toBe('Ungültig');
    component.cancelEdit();
    expect(component.editing()).toBeNull();
  });
});
