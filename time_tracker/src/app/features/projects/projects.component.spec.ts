import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { PROJECTS, clickButton, enter } from '../../../testing/fixtures';
import ProjectsComponent from './projects.component';

describe('ProjectsComponent', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<ProjectsComponent>;

  const text = () => {
    fixture.detectChanges();
    return ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ');
  };

  function create() {
    TestBed.configureTestingModule({
      imports: [ProjectsComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ProjectsComponent);
    fixture.detectChanges();
    http.expectOne('api/projects').flush(PROJECTS);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  /** Erwartet eine Anfrage, beantwortet sie und das anschließende Neuladen. */
  function expectChange(method: string, url: string, body?: unknown) {
    const req = http.expectOne(url);
    expect(req.request.method).toBe(method);
    if (body !== undefined) expect(req.request.body).toEqual(body);
    req.flush(null);
    http.expectOne('api/projects').flush(PROJECTS);
  }

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });

  it('zeigt aktive Projekte mit Budget und optional archivierte', () => {
    const c = create();
    let t = text();
    expect(t).toContain('Projekt Alpha');
    expect(t).toContain('7,50 h / 5,00 h');
    expect(t).not.toContain('Archiv ');
    expect(c.usage(PROJECTS[0]!.packages[0]!)).toBe(150);
    expect(c.usage(PROJECTS[0]!.packages[1]!)).toBe(0);

    c.showArchived.set(true);
    t = text();
    expect(t).toContain('Archiv');
    expect(t).toContain('Alt');
    expect(t).toContain('Reaktivieren');
  });

  it('legt Projekte und Arbeitspakete an', () => {
    const c = create();
    c.newProject = { code: '', name: 'Beta', budget: '' };
    c.addProject();
    expectChange('POST', 'api/projects', { code: null, name: 'Beta' });
    expect(c.newProject.name).toBe('');

    const draft = c.packageDraft(10);
    Object.assign(draft, { code: 'AP-1', name: 'Test', budget: '12,5' });
    c.addPackage(PROJECTS[0]!);
    expectChange('POST', 'api/projects/10/packages', {
      code: 'AP-1',
      name: 'Test',
      budgetQuarters: 50,
    });
    expect(c.packageDraft(10).name).toBe('');

    Object.assign(c.packageDraft(10), { name: 'Ohne Budget', budget: '0' });
    c.addPackage(PROJECTS[0]!);
    expectChange('POST', 'api/projects/10/packages', {
      code: null,
      name: 'Ohne Budget',
      budgetQuarters: null,
    });
  });

  it('bearbeitet Projekte und Arbeitspakete', () => {
    const c = create();
    const project = PROJECTS[0]!;
    const pkg = project.packages[0]!;

    c.startEdit(`project-${project.id}`, project);
    expect(text()).toContain('Abbrechen');
    c.edit.name = 'Alpha neu';
    c.saveProject(project);
    expectChange('PATCH', 'api/projects/10', { code: 'P1', name: 'Alpha neu' });
    expect(c.editing()).toBeNull();

    c.startEdit(`package-${pkg.id}`, pkg);
    expect(c.edit).toEqual({ code: 'AP-12', name: 'Konzept', budget: '5' });
    text();
    c.edit.budget = '';
    c.savePackage(pkg);
    expectChange('PATCH', 'api/packages/11', {
      code: 'AP-12',
      name: 'Konzept',
      budgetQuarters: null,
    });

    c.startEdit('package-12', project.packages[1]!);
    c.cancelEdit();
    expect(c.editing()).toBeNull();
  });

  it('archiviert und löscht nach Rückfrage', () => {
    const c = create();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    c.toggleProject(PROJECTS[0]!);
    expectChange('PATCH', 'api/projects/10', { active: false });
    c.togglePackage(PROJECTS[0]!.packages[1]!);
    expectChange('PATCH', 'api/packages/12', { active: true });
    c.deleteProject(PROJECTS[1]!);
    expectChange('DELETE', 'api/projects/20');
    c.deletePackage(PROJECTS[0]!.packages[1]!);
    expectChange('DELETE', 'api/packages/12');

    confirm.mockReturnValue(false);
    c.deleteProject(PROJECTS[1]!);
    c.deletePackage(PROJECTS[0]!.packages[1]!);
  });

  it('zeigt Fehler beim Laden und Speichern', () => {
    const c = create();
    c.addProject();
    http
      .expectOne('api/projects')
      .flush({ error: 'Name ist erforderlich' }, { status: 400, statusText: 'x' });
    expect(text()).toContain('Name ist erforderlich');
    c.load();
    http.expectOne('api/projects').flush({}, { status: 500, statusText: 'x' });
    expect(c.error()).toBe('Projekte konnten nicht geladen werden');
  });

  it('zeigt einen Hinweis ohne Projekte', () => {
    const c = create();
    c.projects.set([]);
    expect(text()).toContain('Noch keine Projekte');
  });

  it('lässt sich vollständig über die Oberfläche bedienen', async () => {
    create();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);

    const [code, name] = el.querySelectorAll<HTMLInputElement>('section input');
    enter(code, 'P9');
    enter(name, 'Gamma');
    fixture.detectChanges();
    clickButton(el, 'Anlegen');
    expectChange('POST', 'api/projects', { code: 'P9', name: 'Gamma' });

    enter(el.querySelector('[aria-label="Code des Arbeitspakets"]'), 'AP-9');
    enter(el.querySelector('[aria-label="Name des Arbeitspakets"]'), 'Neu');
    enter(el.querySelector('[aria-label="Budget in Stunden"]'), '1');
    fixture.detectChanges();
    clickButton(el, '+ Arbeitspaket');
    expectChange('POST', 'api/projects/10/packages', {
      code: 'AP-9',
      name: 'Neu',
      budgetQuarters: 4,
    });

    el.querySelector<HTMLInputElement>('.toggle input')!.click();
    fixture.detectChanges();
    const section = () => el.querySelectorAll<HTMLElement>('section')[1]!;

    // Projekt bearbeiten: Abbrechen, dann Speichern
    clickButton(section(), 'Bearbeiten');
    fixture.detectChanges();
    clickButton(section(), 'Abbrechen');
    fixture.detectChanges();
    clickButton(section(), 'Bearbeiten');
    fixture.detectChanges();
    await fixture.whenStable();
    enter(section().querySelector('[aria-label="Code"]'), 'P1');
    enter(section().querySelector('[aria-label="Name"]'), 'Alpha 2');
    clickButton(section(), 'Speichern');
    expectChange('PATCH', 'api/projects/10', { code: 'P1', name: 'Alpha 2' });
    fixture.detectChanges();

    // Arbeitspaket bearbeiten
    const pkgRow = () => section().querySelector<HTMLElement>('.packages li')!;
    clickButton(pkgRow(), 'Bearbeiten');
    fixture.detectChanges();
    await fixture.whenStable();
    enter(pkgRow().querySelector('[aria-label="Code"]'), 'AP-13');
    enter(pkgRow().querySelector('[aria-label="Name"]'), 'Konzept 2');
    enter(pkgRow().querySelector('[aria-label="Budget in Stunden"]'), '2');
    clickButton(pkgRow(), 'Abbrechen');
    fixture.detectChanges();
    clickButton(pkgRow(), 'Bearbeiten');
    fixture.detectChanges();
    clickButton(pkgRow(), 'Speichern');
    expectChange('PATCH', 'api/packages/11');
    fixture.detectChanges();

    // Archivieren / Reaktivieren / Löschen
    clickButton(section(), 'Archivieren');
    expectChange('PATCH', 'api/projects/10', { active: false });
    fixture.detectChanges();
    clickButton(pkgRow(), 'Archivieren');
    expectChange('PATCH', 'api/packages/11', { active: false });
    fixture.detectChanges();
    const archived = section().querySelectorAll<HTMLElement>('.packages li')[1]!;
    clickButton(archived, 'Löschen');
    clickButton(el.querySelectorAll<HTMLElement>('section')[2]!, 'Löschen');
    expect(confirm).toHaveBeenCalledTimes(2);
  });
});
