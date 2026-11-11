import { Component, inject, signal } from '@angular/core';
import type {
  DepotDocument,
  DocumentType,
  ImportFailure,
  ImportResult,
} from '../../../../shared/api-types';
import { apiErrorMessage } from '../../core/api-error';
import { ApiService } from '../../core/api.service';
import { formatDate } from '../../core/format';

const TYPE_LABEL: Record<DocumentType, string> = {
  buy: 'Kauf',
  sell: 'Verkauf',
  dividend: 'Ertrag',
  statement: 'Depotauszug',
};
const STATUS_LABEL = { imported: 'Importiert', duplicate: 'Bereits vorhanden', failed: 'Fehler' };
const STATUS_CLASS = { imported: 'success', duplicate: 'warning', failed: 'error' };

/** PDF-Upload, importierte Dokumente und nicht erkannte Dateien. */
@Component({
  selector: 'app-import',
  templateUrl: './import.component.html',
  styleUrl: './import.component.css',
})
export default class ImportComponent {
  private readonly api = inject(ApiService);

  readonly documents = signal<DepotDocument[]>([]);
  readonly failures = signal<ImportFailure[]>([]);
  readonly results = signal<ImportResult[]>([]);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);
  readonly dragging = signal(false);

  readonly date = formatDate;
  readonly typeLabel = (type: DocumentType): string => TYPE_LABEL[type];
  readonly statusLabel = (result: ImportResult): string => STATUS_LABEL[result.status];
  readonly statusClass = (result: ImportResult): string => STATUS_CLASS[result.status];
  readonly documentUrl = (id: number): string => this.api.documentUrl(id);

  constructor() {
    this.load();
  }

  private readonly fail = (fallback: string) => (err: unknown) => {
    this.busy.set(false);
    this.error.set(apiErrorMessage(err, fallback));
  };

  load(): void {
    this.api.documents().subscribe({
      next: (documents) => this.documents.set(documents),
      error: this.fail('Die Dokumente konnten nicht geladen werden'),
    });
    this.api.importFailures().subscribe({
      next: (failures) => this.failures.set(failures),
      error: this.fail('Die Fehlerliste konnte nicht geladen werden'),
    });
  }

  private readonly finished = (results: ImportResult[]): void => {
    this.busy.set(false);
    this.results.set(results);
    this.load();
  };

  upload(list: FileList | File[] | null | undefined): void {
    const files = [...(list ?? [])].filter((file) => /\.pdf$/i.test(file.name));
    if (files.length === 0) {
      this.error.set('Bitte PDF-Dateien auswählen.');
      return;
    }
    this.error.set(null);
    this.busy.set(true);
    this.api
      .uploadDocuments(files)
      .subscribe({ next: this.finished, error: this.fail('Der Upload ist fehlgeschlagen') });
  }

  onFileInput(input: HTMLInputElement): void {
    this.upload(input.files);
    input.value = '';
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    this.upload(event.dataTransfer?.files);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(true);
  }

  scanInbox(): void {
    this.error.set(null);
    this.busy.set(true);
    this.api.scanInbox().subscribe({
      next: this.finished,
      error: this.fail('Der Eingangsordner konnte nicht geprüft werden'),
    });
  }

  removeDocument(document: DepotDocument): void {
    this.api.deleteDocument(document.id).subscribe({
      next: () => this.load(),
      error: this.fail('Löschen fehlgeschlagen'),
    });
  }

  removeFailure(failure: ImportFailure): void {
    this.api.deleteImportFailure(failure.id).subscribe({
      next: () => this.load(),
      error: this.fail('Löschen fehlgeschlagen'),
    });
  }
}
