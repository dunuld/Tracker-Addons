import { TestBed } from '@angular/core/testing';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { RouterTestingModule } from '@angular/router/testing';
import OverviewComponent from './overview.component';
import { AccountService } from '../../core/account.service';
import type { MonthlyReport } from '../../../../shared/api-types';

describe('OverviewComponent', () => {
  let httpMock: HttpTestingController;

  const createMockReport = (): MonthlyReport => ({
    year: 2024,
    month: 1,
    incomeCents: 300000,
    expenseCents: -120000,
    balanceCents: 180000,
    categories: [
      {
        categoryId: 1,
        name: 'Lebensmittel',
        color: '#4caf50',
        kind: 'expense',
        totalCents: -50000,
        count: 12,
      },
      {
        categoryId: 2,
        name: 'Miete',
        color: '#f44336',
        kind: 'expense',
        totalCents: -70000,
        count: 1,
      },
      {
        categoryId: 3,
        name: 'Gehalt',
        color: '#03a9f4',
        kind: 'income',
        totalCents: 300000,
        count: 1,
      },
    ],
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RouterTestingModule, OverviewComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should create the component', () => {
    const fixture = TestBed.createComponent(OverviewComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
    const req = httpMock.expectOne((req) => req.url.includes('api/reports/monthly'));
    req.flush({} as MonthlyReport);
  });

  it('should show loading state initially', () => {
    const fixture = TestBed.createComponent(OverviewComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.loading')?.textContent).toContain('Lade Daten');
    const req = httpMock.expectOne((req) => req.url.includes('api/reports/monthly'));
    req.flush({} as MonthlyReport);
  });

  it('should display monthly report data', async () => {
    const fixture = TestBed.createComponent(OverviewComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    const mockReport = createMockReport();
    const req = httpMock.expectOne((req) => req.url.includes('api/reports/monthly'));
    req.flush(mockReport);
    await fixture.whenStable();
    fixture.detectChanges();

    const report = component.report();
    expect(report).toBeTruthy();
    expect(report!.incomeCents).toBe(300000);
    expect(report!.expenseCents).toBe(-120000);
    expect(report!.balanceCents).toBe(180000);
  });

  it('should display expense categories in table', async () => {
    const fixture = TestBed.createComponent(OverviewComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    const mockReport = createMockReport();
    const req = httpMock.expectOne((req) => req.url.includes('api/reports/monthly'));
    req.flush(mockReport);
    await fixture.whenStable();
    fixture.detectChanges();

    const categories = component.expenseCategories();
    expect(categories.length).toBe(2);
  });

  it('should show empty message when API error', async () => {
    const fixture = TestBed.createComponent(OverviewComponent);
    fixture.detectChanges();

    const req = httpMock.expectOne((req) => req.url.includes('api/reports/monthly'));
    req.error(new ProgressEvent('error'));
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.empty')?.textContent).toContain('Keine Daten verfügbar');
  });

  it('should navigate months with prevMonth/nextMonth', () => {
    const fixture = TestBed.createComponent(OverviewComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    const req = httpMock.expectOne((req) => req.url.includes('api/reports/monthly'));
    req.flush({} as MonthlyReport);

    component.prevMonth();
    expect(component.currentMonth()).toBeLessThanOrEqual(12);

    const req2 = httpMock.expectOne((req) => req.url.includes('api/reports/monthly'));
    req2.flush({} as MonthlyReport);

    component.nextMonth();
    expect(component.currentMonth()).toBeGreaterThanOrEqual(1);

    const req3 = httpMock.expectOne((req) => req.url.includes('api/reports/monthly'));
    req3.flush({} as MonthlyReport);
  });

  it('should handle prevMonth from January to December', () => {
    const fixture = TestBed.createComponent(OverviewComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    const req = httpMock.expectOne((req) => req.url.includes('api/reports/monthly'));
    req.flush({} as MonthlyReport);

    component.currentMonth.set(1);
    component.currentYear.set(2024);
    component.prevMonth();
    expect(component.currentMonth()).toBe(12);
    expect(component.currentYear()).toBe(2023);

    const req2 = httpMock.expectOne((req) => req.url.includes('api/reports/monthly'));
    req2.flush({} as MonthlyReport);
  });

  it('should handle nextMonth from December to January', () => {
    const fixture = TestBed.createComponent(OverviewComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    const req = httpMock.expectOne((req) => req.url.includes('api/reports/monthly'));
    req.flush({} as MonthlyReport);

    component.currentMonth.set(12);
    component.currentYear.set(2024);
    component.nextMonth();
    expect(component.currentMonth()).toBe(1);
    expect(component.currentYear()).toBe(2025);

    const req2 = httpMock.expectOne((req) => req.url.includes('api/reports/monthly'));
    req2.flush({} as MonthlyReport);
  });

  it('should show empty message when no expenses', async () => {
    const fixture = TestBed.createComponent(OverviewComponent);
    fixture.detectChanges();

    const mockReport: MonthlyReport = {
      year: 2024,
      month: 1,
      incomeCents: 300000,
      expenseCents: 0,
      balanceCents: 300000,
      categories: [
        {
          categoryId: 3,
          name: 'Gehalt',
          color: '#03a9f4',
          kind: 'income',
          totalCents: 300000,
          count: 1,
        },
      ],
    };
    const req = httpMock.expectOne((req) => req.url.includes('api/reports/monthly'));
    req.flush(mockReport);
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.empty')?.textContent).toContain('Keine Ausgaben');
  });

  it('should format euro amounts correctly', () => {
    const fixture = TestBed.createComponent(OverviewComponent);
    const component = fixture.componentInstance;
    expect(component.formatEuro(123456)).toContain('1.234,56');
    expect(component.formatEuro(-5000)).toContain('-50,00');

    const req = httpMock.expectOne((req) => req.url.includes('api/reports/monthly'));
    req.flush({} as MonthlyReport);
  });

  it('should format month year correctly', () => {
    const fixture = TestBed.createComponent(OverviewComponent);
    const component = fixture.componentInstance;
    expect(component.formatMonthYear(2024, 1)).toBe('Januar 2024');
    expect(component.formatMonthYear(2024, 12)).toBe('Dezember 2024');

    const req = httpMock.expectOne((req) => req.url.includes('api/reports/monthly'));
    req.flush({} as MonthlyReport);
  });

  it('lädt die Übersicht neu, wenn ein anderes Konto gewählt wird', async () => {
    const accounts = TestBed.inject(AccountService);
    const fixture = TestBed.createComponent(OverviewComponent);
    fixture.detectChanges();
    httpMock
      .expectOne((req) => req.url.includes('api/reports/monthly') && !req.params.has('accountId'))
      .flush(createMockReport());

    accounts.select(7);
    fixture.detectChanges();
    httpMock
      .expectOne(
        (req) => req.url.includes('api/reports/monthly') && req.params.get('accountId') === '7',
      )
      .flush(createMockReport());
    await fixture.whenStable();
    accounts.select(null);
    fixture.detectChanges();
    httpMock.expectOne((req) => req.url.includes('api/reports/monthly')).flush(createMockReport());
  });
});
