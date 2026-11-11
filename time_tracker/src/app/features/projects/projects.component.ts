import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Observable } from 'rxjs';
import type { Project, WorkPackage } from '../../../../shared/api-types';
import { apiErrorMessage } from '../../core/api-error';
import { ApiService } from '../../core/api.service';
import { formatQuarters, parseHours } from '../../core/format';

interface Draft {
  code: string;
  name: string;
  budget: string;
}

const emptyDraft = (): Draft => ({ code: '', name: '', budget: '' });

/** Eigene Projekte und Arbeitspakete verwalten. */
@Component({
  selector: 'app-projects',
  imports: [FormsModule],
  templateUrl: './projects.component.html',
  styleUrl: './projects.component.css',
})
export default class ProjectsComponent {
  private readonly api = inject(ApiService);

  readonly fmtQuarters = formatQuarters;
  readonly projects = signal<Project[]>([]);
  readonly showArchived = signal(false);
  readonly error = signal<string | null>(null);
  /** Aktuell bearbeitetes Element, z. B. `project-3` oder `package-7` */
  readonly editing = signal<string | null>(null);

  newProject = emptyDraft();
  edit = emptyDraft();
  /** Formulare „Arbeitspaket anlegen“ je Projekt */
  readonly newPackage: Record<number, Draft> = {};

  readonly visible = computed(() =>
    this.showArchived() ? this.projects() : this.projects().filter((p) => p.active),
  );

  constructor() {
    this.load();
  }

  load(): void {
    this.api.projects().subscribe({
      next: (p) => this.projects.set(p),
      error: (err: unknown) =>
        this.error.set(apiErrorMessage(err, 'Projekte konnten nicht geladen werden')),
    });
  }

  packages(project: Project): WorkPackage[] {
    return this.showArchived() ? project.packages : project.packages.filter((p) => p.active);
  }

  packageDraft(projectId: number): Draft {
    return (this.newPackage[projectId] ??= emptyDraft());
  }

  /** Budget in Stunden → Viertelstunden (`''` → kein Budget) */
  private budget(value: string): number | null {
    const minutes = parseHours(value);
    return minutes === null || minutes <= 0 ? null : Math.max(1, Math.round(minutes / 15));
  }

  private run(request: Observable<unknown>, done?: () => void): void {
    this.error.set(null);
    request.subscribe({
      next: () => {
        done?.();
        this.load();
      },
      error: (err: unknown) => this.error.set(apiErrorMessage(err, 'Speichern fehlgeschlagen')),
    });
  }

  addProject(): void {
    const d = this.newProject;
    this.run(this.api.createProject({ code: d.code || null, name: d.name }), () => {
      this.newProject = emptyDraft();
    });
  }

  addPackage(project: Project): void {
    const d = this.packageDraft(project.id);
    this.run(
      this.api.createPackage(project.id, {
        code: d.code || null,
        name: d.name,
        budgetQuarters: this.budget(d.budget),
      }),
      () => (this.newPackage[project.id] = emptyDraft()),
    );
  }

  startEdit(
    key: string,
    item: { code: string | null; name: string; budgetQuarters?: number | null },
  ) {
    this.edit = {
      code: item.code ?? '',
      name: item.name,
      budget: item.budgetQuarters ? String(item.budgetQuarters / 4).replace('.', ',') : '',
    };
    this.editing.set(key);
  }

  cancelEdit(): void {
    this.editing.set(null);
  }

  saveProject(project: Project): void {
    this.run(
      this.api.updateProject(project.id, { code: this.edit.code || null, name: this.edit.name }),
      () => this.editing.set(null),
    );
  }

  savePackage(pkg: WorkPackage): void {
    this.run(
      this.api.updatePackage(pkg.id, {
        code: this.edit.code || null,
        name: this.edit.name,
        budgetQuarters: this.budget(this.edit.budget),
      }),
      () => this.editing.set(null),
    );
  }

  toggleProject(project: Project): void {
    this.run(this.api.updateProject(project.id, { active: !project.active }));
  }

  togglePackage(pkg: WorkPackage): void {
    this.run(this.api.updatePackage(pkg.id, { active: !pkg.active }));
  }

  deleteProject(project: Project): void {
    if (!confirm(`Projekt „${project.name}“ löschen?`)) return;
    this.run(this.api.deleteProject(project.id));
  }

  deletePackage(pkg: WorkPackage): void {
    if (!confirm(`Arbeitspaket „${pkg.name}“ löschen?`)) return;
    this.run(this.api.deletePackage(pkg.id));
  }

  /** Budgetverbrauch in Prozent (max. 100 für die Balkenbreite) */
  usage(pkg: WorkPackage): number {
    return pkg.budgetQuarters ? Math.round((pkg.bookedQuarters / pkg.budgetQuarters) * 100) : 0;
  }
}
