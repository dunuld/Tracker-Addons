import { TestBed } from '@angular/core/testing';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import SettingsComponent from './settings.component';
import type { Account, Category, Rule, Statement } from '../../../../shared/api-types';

describe('SettingsComponent', () => {
  let httpMock: HttpTestingController;

  const createMockCategories = (): Category[] => [
    { id: 1, name: 'Lebensmittel', color: '#4caf50', kind: 'expense', sort: 1, isDefault: false },
    { id: 2, name: 'Miete', color: '#f44336', kind: 'expense', sort: 2, isDefault: false },
    { id: 4, name: 'Sonstiges', color: '#9e9e9e', kind: 'expense', sort: 99, isDefault: true },
  ];

  const createMockRules = (): Rule[] => [
    {
      id: 1,
      categoryId: 1,
      field: 'counterparty',
      matchType: 'contains',
      pattern: 'REWE',
      priority: 1,
    },
    {
      id: 2,
      categoryId: 2,
      field: 'purpose',
      matchType: 'contains',
      pattern: 'Miete',
      priority: 2,
    },
  ];

  const createMockStatements = (): Statement[] => [
    {
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
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SettingsComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // Die Kontenliste (AccountService) wird zusätzlich geladen; in diesen Tests nicht relevant.
    httpMock.match((req) => req.url.includes('api/accounts')).forEach((req) => req.flush([]));
    httpMock.verify();
  });

  it('should create the component', () => {
    const fixture = TestBed.createComponent(SettingsComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
    httpMock.expectOne((req) => req.url.includes('api/categories')).flush([]);
    httpMock.expectOne((req) => req.url.includes('api/rules')).flush([]);
    httpMock.expectOne((req) => req.url.includes('api/statements')).flush([]);
  });

  it('should display the settings heading', () => {
    const fixture = TestBed.createComponent(SettingsComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h2')?.textContent).toContain('Einstellungen');
    httpMock.expectOne((req) => req.url.includes('api/categories')).flush([]);
    httpMock.expectOne((req) => req.url.includes('api/rules')).flush([]);
    httpMock.expectOne((req) => req.url.includes('api/statements')).flush([]);
  });

  it('should display all four tabs', () => {
    const fixture = TestBed.createComponent(SettingsComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    const tabs = compiled.querySelectorAll('.tab');
    expect(tabs.length).toBe(4);
    expect(tabs[0]?.textContent).toContain('Kategorien');
    expect(tabs[1]?.textContent).toContain('Regeln');
    expect(tabs[2]?.textContent).toContain('Konten');
    expect(tabs[3]?.textContent).toContain('Auszüge');
    httpMock.expectOne((req) => req.url.includes('api/categories')).flush([]);
    httpMock.expectOne((req) => req.url.includes('api/rules')).flush([]);
    httpMock.expectOne((req) => req.url.includes('api/statements')).flush([]);
  });

  it('should show categories tab by default', () => {
    const fixture = TestBed.createComponent(SettingsComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    expect(component.activeTab()).toBe('categories');
    httpMock.expectOne((req) => req.url.includes('api/categories')).flush([]);
    httpMock.expectOne((req) => req.url.includes('api/rules')).flush([]);
    httpMock.expectOne((req) => req.url.includes('api/statements')).flush([]);
  });

  it('should switch to rules tab', () => {
    const fixture = TestBed.createComponent(SettingsComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    httpMock.expectOne((req) => req.url.includes('api/categories')).flush([]);
    httpMock.expectOne((req) => req.url.includes('api/rules')).flush([]);
    httpMock.expectOne((req) => req.url.includes('api/statements')).flush([]);

    component.activeTab.set('rules');
    fixture.detectChanges();
    expect(component.activeTab()).toBe('rules');
  });

  it('should switch to statements tab', () => {
    const fixture = TestBed.createComponent(SettingsComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    httpMock.expectOne((req) => req.url.includes('api/categories')).flush([]);
    httpMock.expectOne((req) => req.url.includes('api/rules')).flush([]);
    httpMock.expectOne((req) => req.url.includes('api/statements')).flush([]);

    component.activeTab.set('statements');
    fixture.detectChanges();
    expect(component.activeTab()).toBe('statements');
  });

  it('should display categories in table', async () => {
    const fixture = TestBed.createComponent(SettingsComponent);
    fixture.detectChanges();

    const cats = createMockCategories();
    httpMock.expectOne((req) => req.url.includes('api/categories')).flush(cats);
    httpMock.expectOne((req) => req.url.includes('api/rules')).flush([]);
    httpMock.expectOne((req) => req.url.includes('api/statements')).flush([]);
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const rows = compiled.querySelectorAll('tbody tr');
    expect(rows.length).toBe(3);
  });

  it('should display rules in table', async () => {
    const fixture = TestBed.createComponent(SettingsComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    const cats = createMockCategories();
    const rules = createMockRules();
    httpMock.expectOne((req) => req.url.includes('api/categories')).flush(cats);
    httpMock.expectOne((req) => req.url.includes('api/rules')).flush(rules);
    httpMock.expectOne((req) => req.url.includes('api/statements')).flush([]);
    await fixture.whenStable();
    fixture.detectChanges();

    component.activeTab.set('rules');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const rows = compiled.querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
  });

  it('should display statements in table', async () => {
    const fixture = TestBed.createComponent(SettingsComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    const statements = createMockStatements();
    httpMock.expectOne((req) => req.url.includes('api/categories')).flush([]);
    httpMock.expectOne((req) => req.url.includes('api/rules')).flush([]);
    httpMock.expectOne((req) => req.url.includes('api/statements')).flush(statements);
    await fixture.whenStable();
    fixture.detectChanges();

    component.activeTab.set('statements');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const rows = compiled.querySelectorAll('tbody tr');
    expect(rows.length).toBe(1);
  });

  it('should show empty message for statements tab', async () => {
    const fixture = TestBed.createComponent(SettingsComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    httpMock.expectOne((req) => req.url.includes('api/categories')).flush([]);
    httpMock.expectOne((req) => req.url.includes('api/rules')).flush([]);
    httpMock.expectOne((req) => req.url.includes('api/statements')).flush([]);
    await fixture.whenStable();
    fixture.detectChanges();

    component.activeTab.set('statements');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.empty')?.textContent).toContain('Noch keine Auszüge');
  });

  it('should return category name for given id', () => {
    const fixture = TestBed.createComponent(SettingsComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    const cats = createMockCategories();
    component.categories.set(cats);

    httpMock.expectOne((req) => req.url.includes('api/categories')).flush(cats);
    httpMock.expectOne((req) => req.url.includes('api/rules')).flush([]);
    httpMock.expectOne((req) => req.url.includes('api/statements')).flush([]);

    expect(component.categoryName(1)).toBe('Lebensmittel');
    expect(component.categoryName(999)).toBe('ID: 999');
  });

  it('should return kind label for expense', () => {
    const fixture = TestBed.createComponent(SettingsComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    expect(component.kindLabel('expense')).toBe('Ausgabe');
    httpMock.expectOne((req) => req.url.includes('api/categories')).flush([]);
    httpMock.expectOne((req) => req.url.includes('api/rules')).flush([]);
    httpMock.expectOne((req) => req.url.includes('api/statements')).flush([]);
  });

  it('should return kind label for income', () => {
    const fixture = TestBed.createComponent(SettingsComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    expect(component.kindLabel('income')).toBe('Einnahme');
    httpMock.expectOne((req) => req.url.includes('api/categories')).flush([]);
    httpMock.expectOne((req) => req.url.includes('api/rules')).flush([]);
    httpMock.expectOne((req) => req.url.includes('api/statements')).flush([]);
  });

  it('should return kind label for transfer', () => {
    const fixture = TestBed.createComponent(SettingsComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    expect(component.kindLabel('transfer')).toBe('Umbuchung');
    httpMock.expectOne((req) => req.url.includes('api/categories')).flush([]);
    httpMock.expectOne((req) => req.url.includes('api/rules')).flush([]);
    httpMock.expectOne((req) => req.url.includes('api/statements')).flush([]);
  });

  it('should return field label for counterparty', () => {
    const fixture = TestBed.createComponent(SettingsComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    expect(component.fieldLabel('counterparty')).toBe('Empfänger');
    httpMock.expectOne((req) => req.url.includes('api/categories')).flush([]);
    httpMock.expectOne((req) => req.url.includes('api/rules')).flush([]);
    httpMock.expectOne((req) => req.url.includes('api/statements')).flush([]);
  });

  it('should return field label for purpose', () => {
    const fixture = TestBed.createComponent(SettingsComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    expect(component.fieldLabel('purpose')).toBe('Verwendungszweck');
    httpMock.expectOne((req) => req.url.includes('api/categories')).flush([]);
    httpMock.expectOne((req) => req.url.includes('api/rules')).flush([]);
    httpMock.expectOne((req) => req.url.includes('api/statements')).flush([]);
  });

  it('should return field label for any', () => {
    const fixture = TestBed.createComponent(SettingsComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    expect(component.fieldLabel('any')).toBe('Beides');
    httpMock.expectOne((req) => req.url.includes('api/categories')).flush([]);
    httpMock.expectOne((req) => req.url.includes('api/rules')).flush([]);
    httpMock.expectOne((req) => req.url.includes('api/statements')).flush([]);
  });

  it('should format month year label', () => {
    const fixture = TestBed.createComponent(SettingsComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    expect(component.monthYearLabel(2024, 1)).toBe('Jan 2024');
    expect(component.monthYearLabel(2024, 12)).toBe('Dez 2024');
    httpMock.expectOne((req) => req.url.includes('api/categories')).flush([]);
    httpMock.expectOne((req) => req.url.includes('api/rules')).flush([]);
    httpMock.expectOne((req) => req.url.includes('api/statements')).flush([]);
  });

  it('should handle API error', async () => {
    const fixture = TestBed.createComponent(SettingsComponent);
    fixture.detectChanges();

    httpMock
      .expectOne((req) => req.url.includes('api/categories'))
      .error(new ProgressEvent('error'));
    httpMock.expectOne((req) => req.url.includes('api/rules')).flush([]);
    httpMock.expectOne((req) => req.url.includes('api/statements')).flush([]);
    await fixture.whenStable();
    fixture.detectChanges();

    const component = fixture.componentInstance;
    expect(component.errorMsg()).toBeTruthy();
  });

  it('should show default badge for default category', async () => {
    const fixture = TestBed.createComponent(SettingsComponent);
    fixture.detectChanges();

    const cats = createMockCategories();
    httpMock.expectOne((req) => req.url.includes('api/categories')).flush(cats);
    httpMock.expectOne((req) => req.url.includes('api/rules')).flush([]);
    httpMock.expectOne((req) => req.url.includes('api/statements')).flush([]);
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.badge')?.textContent).toContain('Standard');
  });

  describe('Aktionen', () => {
    type Fixture = ReturnType<typeof TestBed.createComponent<SettingsComponent>>;

    /** Komponente erzeugen und die drei Initial-Requests beantworten. */
    async function setup(): Promise<{ fixture: Fixture; component: SettingsComponent }> {
      const fixture = TestBed.createComponent(SettingsComponent);
      fixture.detectChanges();
      httpMock.expectOne('api/categories').flush(createMockCategories());
      httpMock.expectOne('api/rules').flush(createMockRules());
      httpMock.expectOne('api/statements').flush(createMockStatements());
      await fixture.whenStable();
      fixture.detectChanges();
      return { fixture, component: fixture.componentInstance };
    }

    const input = (value: string) => Object.assign(document.createElement('input'), { value });
    /** Select mit genau einer Option, damit `value` gesetzt werden kann. */
    const select = (value: string) => {
      const el = document.createElement('select');
      el.append(new Option(value, value));
      el.value = value;
      return el;
    };
    const serverError = (status: number) => ({ status, statusText: 'Error' });

    afterEach(() => vi.restoreAllMocks());

    describe('Kategorien', () => {
      it('legt eine Kategorie an und leert das Namensfeld', async () => {
        const { component } = await setup();
        const name = input('  Hobby ');

        component.addCategory(name, input('#123abc'), select('income'));
        const req = httpMock.expectOne('api/categories');
        expect(req.request.method).toBe('POST');
        expect(req.request.body).toEqual({ name: 'Hobby', color: '#123abc', kind: 'income' });
        req.flush({
          id: 9,
          name: 'Hobby',
          color: '#123abc',
          kind: 'income',
          sort: 0,
          isDefault: false,
        });

        expect(component.categories().map((c) => c.name)).toContain('Hobby');
        expect(name.value).toBe('');
      });

      it('sendet keinen Request bei leerem Namen', async () => {
        const { component } = await setup();
        component.addCategory(input('   '), input('#000000'), select('expense'));
        httpMock.expectNone('api/categories');
      });

      it('zeigt die Server-Meldung bei Fehlern an (z. B. doppelter Name)', async () => {
        const { fixture, component } = await setup();
        component.addCategory(input('Miete'), input('#000000'), select('expense'));
        httpMock
          .expectOne('api/categories')
          .flush(
            { error: 'Eine Kategorie mit diesem Namen existiert bereits', code: 'NAME_EXISTS' },
            serverError(409),
          );

        expect(component.errorMsg()).toBe('Eine Kategorie mit diesem Namen existiert bereits');
        fixture.detectChanges();
        expect(
          (fixture.nativeElement as HTMLElement).querySelector('.error-msg')?.textContent,
        ).toContain('existiert bereits');
        expect(component.categories()).toHaveLength(3);
      });

      it('nutzt eine Standardmeldung, wenn der Server keine liefert', async () => {
        const { component } = await setup();
        component.addCategory(input('X'), input('#000000'), select('expense'));
        httpMock.expectOne('api/categories').error(new ProgressEvent('error'));
        expect(component.errorMsg()).toBe('Fehler beim Erstellen');
      });

      it('löscht nach Bestätigung über den Button und lädt die Regeln neu', async () => {
        const { fixture, component } = await setup();
        const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

        // Erster Löschen-Button gehört zu "Lebensmittel" (id 1); Standardkategorie hat keinen
        const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
          '.btn-danger',
        );
        expect(buttons).toHaveLength(2);
        buttons[0]!.click();

        expect(confirmSpy).toHaveBeenCalled();
        const req = httpMock.expectOne('api/categories/1');
        expect(req.request.method).toBe('DELETE');
        req.flush(null);
        httpMock.expectOne('api/rules').flush([createMockRules()[1]]);

        expect(component.categories().map((c) => c.id)).toEqual([2, 4]);
        expect(component.rules()).toHaveLength(1);
      });

      it('löscht nicht ohne Bestätigung', async () => {
        const { component } = await setup();
        vi.spyOn(window, 'confirm').mockReturnValue(false);
        component.deleteCategory(1);
        httpMock.expectNone('api/categories/1');
        expect(component.categories()).toHaveLength(3);
      });

      it('zeigt Fehler beim Löschen an', async () => {
        const { component } = await setup();
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        component.deleteCategory(4);
        httpMock
          .expectOne('api/categories/4')
          .flush({ error: 'Die Standardkategorie kann nicht gelöscht werden' }, serverError(409));
        expect(component.errorMsg()).toContain('Standardkategorie');
        expect(component.categories()).toHaveLength(3);
      });
    });

    describe('Regeln', () => {
      it('legt eine Regel an', async () => {
        const { component } = await setup();
        const pattern = input(' NETFLIX ');

        component.addRule(select('2'), select('purpose'), select('regex'), pattern);
        const req = httpMock.expectOne('api/rules');
        expect(req.request.method).toBe('POST');
        expect(req.request.body).toEqual({
          categoryId: 2,
          field: 'purpose',
          matchType: 'regex',
          pattern: 'NETFLIX',
        });
        req.flush({
          id: 3,
          categoryId: 2,
          field: 'purpose',
          matchType: 'regex',
          pattern: 'NETFLIX',
          priority: 100,
        });

        expect(component.rules()).toHaveLength(3);
        expect(pattern.value).toBe('');
      });

      it.each([
        ['ohne Kategorie', '', 'X'],
        ['ohne Muster', '1', '  '],
      ])('sendet keinen Request %s', async (_label, cat, pat) => {
        const { component } = await setup();
        component.addRule(select(cat), select('any'), select('contains'), input(pat));
        httpMock.expectNone('api/rules');
      });

      it('zeigt Validierungsfehler des Servers an', async () => {
        const { component } = await setup();
        component.addRule(select('1'), select('any'), select('regex'), input('('));
        httpMock
          .expectOne('api/rules')
          .flush({ error: 'Ungültiges Regex-Muster' }, serverError(400));
        expect(component.errorMsg()).toBe('Ungültiges Regex-Muster');
      });

      it('löscht eine Regel über den Button im Regel-Tab', async () => {
        const { fixture, component } = await setup();
        component.activeTab.set('rules');
        fixture.detectChanges();

        (fixture.nativeElement as HTMLElement)
          .querySelector<HTMLButtonElement>('.btn-danger')!
          .click();
        const req = httpMock.expectOne('api/rules/1');
        expect(req.request.method).toBe('DELETE');
        req.flush(null);
        expect(component.rules().map((r) => r.id)).toEqual([2]);
      });

      it('zeigt Fehler beim Löschen einer Regel an', async () => {
        const { component } = await setup();
        component.deleteRule(1);
        httpMock.expectOne('api/rules/1').error(new ProgressEvent('error'));
        expect(component.errorMsg()).toBe('Fehler beim Löschen');
        expect(component.rules()).toHaveLength(2);
      });

      it('wendet Regeln neu an und zeigt Fortschritt und Ergebnis', async () => {
        const { fixture, component } = await setup();
        component.activeTab.set('rules');
        fixture.detectChanges();
        const el = fixture.nativeElement as HTMLElement;
        const button = el.querySelector<HTMLButtonElement>('.btn-secondary')!;

        button.click();
        fixture.detectChanges();
        expect(component.reapplying()).toBe(true);
        expect(button.disabled).toBe(true);
        expect(button.textContent).toContain('Wende an');

        const req = httpMock.expectOne('api/rules/reapply');
        expect(req.request.method).toBe('POST');
        req.flush({ updated: 7 });
        fixture.detectChanges();

        expect(component.reapplying()).toBe(false);
        expect(el.querySelector('.success-msg')?.textContent).toContain('7 Buchungen aktualisiert');
      });

      it('setzt den Fortschritt auch bei Fehlern zurück', async () => {
        const { component } = await setup();
        component.reapplyRules();
        httpMock.expectOne('api/rules/reapply').error(new ProgressEvent('error'));
        expect(component.reapplying()).toBe(false);
        expect(component.reapplyMsg()).toBe('');
        expect(component.errorMsg()).toBe('Regeln konnten nicht angewendet werden');
      });
    });

    describe('Auszüge', () => {
      it('löscht einen Auszug nach Bestätigung', async () => {
        const { fixture, component } = await setup();
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        component.activeTab.set('statements');
        fixture.detectChanges();

        (fixture.nativeElement as HTMLElement)
          .querySelector<HTMLButtonElement>('.btn-danger')!
          .click();
        const req = httpMock.expectOne('api/statements/1');
        expect(req.request.method).toBe('DELETE');
        req.flush(null);
        fixture.detectChanges();

        expect(component.statements()).toEqual([]);
        expect((fixture.nativeElement as HTMLElement).querySelector('.empty')).toBeTruthy();
      });

      it('löscht nicht ohne Bestätigung', async () => {
        const { component } = await setup();
        vi.spyOn(window, 'confirm').mockReturnValue(false);
        component.deleteStatement(1);
        httpMock.expectNone('api/statements/1');
      });

      it('zeigt Fehler beim Löschen an', async () => {
        const { component } = await setup();
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        component.deleteStatement(1);
        httpMock.expectOne('api/statements/1').flush({ error: 'Nicht gefunden' }, serverError(404));
        expect(component.errorMsg()).toBe('Nicht gefunden');
        expect(component.statements()).toHaveLength(1);
      });
    });

    it.each([
      ['api/rules', 'Regeln konnten nicht geladen werden'],
      ['api/statements', 'Auszüge konnten nicht geladen werden'],
    ])('meldet Ladefehler von %s', async (url, message) => {
      const fixture = TestBed.createComponent(SettingsComponent);
      fixture.detectChanges();
      for (const u of ['api/categories', 'api/rules', 'api/statements']) {
        const req = httpMock.expectOne(u);
        if (u === url) req.error(new ProgressEvent('error'));
        else req.flush([]);
      }
      expect(fixture.componentInstance.errorMsg()).toBe(message);
    });
  });

  describe('Konten', () => {
    const accounts = (): Account[] => [
      {
        id: 1,
        iban: 'DE12345678901234567890',
        bank: 'ING',
        name: 'ING ••7890',
        color: '#2196f3',
        sort: 0,
        includeInReports: true,
        statementCount: 2,
        balanceCents: 123456,
        balanceMonth: '2026-10',
      },
    ];

    async function openAccountsTab() {
      const fixture = TestBed.createComponent(SettingsComponent);
      fixture.detectChanges();
      httpMock.expectOne((req) => req.url.includes('api/categories')).flush([]);
      httpMock.expectOne((req) => req.url.includes('api/rules')).flush([]);
      httpMock.expectOne((req) => req.url.includes('api/statements')).flush([]);
      httpMock.expectOne('api/accounts').flush(accounts());
      await fixture.whenStable();
      fixture.componentInstance.activeTab.set('accounts');
      fixture.detectChanges();
      return fixture;
    }

    it('zeigt Konten mit Saldo und Anzahl Auszüge', async () => {
      const fixture = await openAccountsTab();
      const row = (fixture.nativeElement as HTMLElement).querySelector('tbody tr')!;
      expect((row.querySelector('.account-name') as HTMLInputElement).value).toBe('ING ••7890');
      expect(row.textContent).toContain('DE12345678901234567890');
      expect(row.textContent).toContain('1.234,56');
      expect(row.textContent).toContain('Stand');
    });

    it('benennt ein Konto um und ignoriert leere Namen', async () => {
      const fixture = await openAccountsTab();
      const input = (fixture.nativeElement as HTMLElement).querySelector(
        '.account-name',
      ) as HTMLInputElement;

      input.value = '  ';
      input.dispatchEvent(new Event('change'));
      expect(input.value).toBe('ING ••7890');

      input.value = 'Girokonto';
      input.dispatchEvent(new Event('change'));
      const req = httpMock.expectOne('api/accounts/1');
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ name: 'Girokonto' });
      req.flush({ ...accounts()[0], name: 'Girokonto' });
      httpMock.expectOne((r) => r.url.includes('api/statements')).flush([]);
      expect(fixture.componentInstance.accountList()[0]!.name).toBe('Girokonto');
    });

    it('schaltet „In Alle Konten“ um', async () => {
      const fixture = await openAccountsTab();
      const checkbox = (fixture.nativeElement as HTMLElement).querySelector(
        'input[type=checkbox]',
      ) as HTMLInputElement;
      checkbox.checked = false;
      checkbox.dispatchEvent(new Event('change'));
      const req = httpMock.expectOne('api/accounts/1');
      expect(req.request.body).toEqual({ includeInReports: false });
      req.flush({ ...accounts()[0], includeInReports: false });
      expect(fixture.componentInstance.accountList()[0]!.includeInReports).toBe(false);
    });

    it('löscht ein Konto nach Bestätigung und lädt Konten und Auszüge neu', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      const fixture = await openAccountsTab();
      (
        (fixture.nativeElement as HTMLElement).querySelector('tbody .btn-danger') as HTMLElement
      ).click();
      expect(confirmSpy.mock.calls[0]![0]).toContain('2 Auszüge');
      const req = httpMock.expectOne('api/accounts/1');
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
      httpMock.expectOne('api/accounts').flush([]);
      httpMock.expectOne((r) => r.url.includes('api/statements')).flush([]);
      confirmSpy.mockRestore();
    });

    it('ändert die Farbe und lässt einen unveränderten Namen unangetastet', async () => {
      const fixture = await openAccountsTab();
      const el = fixture.nativeElement as HTMLElement;
      const name = el.querySelector('.account-name') as HTMLInputElement;
      name.dispatchEvent(new Event('change'));

      const color = el.querySelector('input[type=color]') as HTMLInputElement;
      color.value = '#00ff00';
      color.dispatchEvent(new Event('change'));
      const req = httpMock.expectOne('api/accounts/1');
      expect(req.request.body).toEqual({ color: '#00ff00' });
      req.flush({ ...accounts()[0], color: '#00ff00' });
      expect(fixture.componentInstance.accountList()[0]!.color).toBe('#00ff00');
    });

    it('zeigt Fehler beim Ändern und Löschen an', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      const fixture = await openAccountsTab();
      const component = fixture.componentInstance;

      component.updateAccount(accounts()[0]!, { name: 'X' });
      httpMock
        .expectOne('api/accounts/1')
        .flush({ error: 'Name ist erforderlich' }, { status: 400, statusText: 'Bad Request' });
      expect(component.errorMsg()).toBe('Name ist erforderlich');

      component.updateAccount(accounts()[0]!, { color: '#000000' });
      httpMock.expectOne('api/accounts/1').error(new ProgressEvent('error'));
      expect(component.errorMsg()).toBe('Konto konnte nicht geändert werden');

      component.deleteAccount(accounts()[0]!);
      httpMock.expectOne('api/accounts/1').error(new ProgressEvent('error'));
      expect(component.errorMsg()).toBe('Fehler beim Löschen');
      vi.restoreAllMocks();
    });

    it('löscht nichts, wenn das Löschen abgebrochen wird', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      const fixture = await openAccountsTab();
      fixture.componentInstance.deleteAccount(accounts()[0]!);
      httpMock.expectNone('api/accounts/1');
      vi.restoreAllMocks();
    });

    it('meldet Ladefehler und zeigt ohne Konten einen Hinweis', async () => {
      const fixture = TestBed.createComponent(SettingsComponent);
      fixture.detectChanges();
      httpMock.expectOne((req) => req.url.includes('api/categories')).flush([]);
      httpMock.expectOne((req) => req.url.includes('api/rules')).flush([]);
      httpMock.expectOne((req) => req.url.includes('api/statements')).flush([]);
      httpMock.expectOne('api/accounts').error(new ProgressEvent('error'));
      await fixture.whenStable();
      fixture.componentInstance.activeTab.set('accounts');
      fixture.detectChanges();
      expect(fixture.componentInstance.errorMsg()).toBe('Konten konnten nicht geladen werden');
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('Noch keine Konten');
    });

    it('zeigt „—“ für Konten ohne Auszug und schaltet über die Tab-Leiste um', async () => {
      const fixture = TestBed.createComponent(SettingsComponent);
      fixture.detectChanges();
      httpMock.expectOne((req) => req.url.includes('api/categories')).flush([]);
      httpMock.expectOne((req) => req.url.includes('api/rules')).flush([]);
      httpMock.expectOne((req) => req.url.includes('api/statements')).flush([]);
      httpMock
        .expectOne('api/accounts')
        .flush([{ ...accounts()[0], statementCount: 0, balanceCents: null, balanceMonth: null }]);
      await fixture.whenStable();
      const el = fixture.nativeElement as HTMLElement;
      (
        [...el.querySelectorAll('.tab')].find((t) =>
          t.textContent?.includes('Konten'),
        ) as HTMLElement
      ).click();
      fixture.detectChanges();
      expect(fixture.componentInstance.activeTab()).toBe('accounts');
      expect(el.querySelector('tbody tr')?.textContent).toContain('—');
      expect(
        fixture.componentInstance.balanceLabel(fixture.componentInstance.accountList()[0]!),
      ).toBe('');
    });
  });
});
