import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  DepotDocument,
  HealthResponse,
  ImportFailure,
  ImportResult,
  OpeningInput,
  Overview,
  PriceInput,
  SecurityUpdate,
  Transaction,
} from '../../../shared/api-types';

/** Zugriff auf die REST-API; Pfade relativ, damit sie unter dem HA-Ingress-Pfad funktionieren. */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  health() {
    return this.http.get<HealthResponse>('api/health');
  }

  overview(year?: number) {
    return this.http.get<Overview>('api/overview', { params: year ? { year } : {} });
  }

  transactions() {
    return this.http.get<Transaction[]>('api/transactions');
  }

  addOpening(input: OpeningInput) {
    return this.http.post<Transaction>('api/transactions', input);
  }

  deleteTransaction(id: number) {
    return this.http.delete<void>(`api/transactions/${id}`);
  }

  documents() {
    return this.http.get<DepotDocument[]>('api/documents');
  }

  uploadDocuments(files: File[]) {
    const form = new FormData();
    files.forEach((file) => form.append('files', file, file.name));
    return this.http.post<ImportResult[]>('api/documents', form);
  }

  deleteDocument(id: number) {
    return this.http.delete<void>(`api/documents/${id}`);
  }

  /** Relativer Link zur gespeicherten Original-PDF. */
  documentUrl(id: number): string {
    return `api/documents/${id}/file`;
  }

  scanInbox() {
    return this.http.post<ImportResult[]>('api/inbox/scan', {});
  }

  importFailures() {
    return this.http.get<ImportFailure[]>('api/import-failures');
  }

  deleteImportFailure(id: number) {
    return this.http.delete<void>(`api/import-failures/${id}`);
  }

  addPrice(isin: string, input: PriceInput) {
    return this.http.post<void>(`api/securities/${isin}/prices`, input);
  }

  updateSecurity(isin: string, update: SecurityUpdate) {
    return this.http.put<void>(`api/securities/${isin}`, update);
  }
}
