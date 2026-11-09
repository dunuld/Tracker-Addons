import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  Account,
  AccountInput,
  Category,
  CategoryInput,
  ImportResult,
  MonthlyReport,
  ReapplyResult,
  Rule,
  RuleInput,
  Statement,
  Transaction,
  TransactionPatch,
  TransactionPatchResult,
  TransactionQuery,
  TrendReport,
} from '../../../shared/api-types';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  // Accounts
  listAccounts() {
    return this.http.get<Account[]>('api/accounts');
  }
  updateAccount(id: number, input: AccountInput) {
    return this.http.patch<Account>(`api/accounts/${id}`, input);
  }
  deleteAccount(id: number) {
    return this.http.delete<void>(`api/accounts/${id}`);
  }

  // Statements
  listStatements() {
    return this.http.get<Statement[]>('api/statements');
  }
  importStatement(file: File, replace = false) {
    const body = new FormData();
    body.append('file', file);
    return this.http.post<ImportResult>(`api/statements${replace ? '?replace=true' : ''}`, body);
  }
  deleteStatement(id: number) {
    return this.http.delete<void>(`api/statements/${id}`);
  }

  // Categories
  listCategories() {
    return this.http.get<Category[]>('api/categories');
  }
  createCategory(input: CategoryInput) {
    return this.http.post<Category>('api/categories', input);
  }
  updateCategory(id: number, input: Partial<CategoryInput>) {
    return this.http.patch<Category>(`api/categories/${id}`, input);
  }
  deleteCategory(id: number) {
    return this.http.delete<void>(`api/categories/${id}`);
  }

  // Rules
  listRules() {
    return this.http.get<Rule[]>('api/rules');
  }
  createRule(input: RuleInput) {
    return this.http.post<Rule>('api/rules', input);
  }
  updateRule(id: number, input: Partial<RuleInput & { pattern?: string; priority?: number }>) {
    return this.http.patch<Rule>(`api/rules/${id}`, input);
  }
  deleteRule(id: number) {
    return this.http.delete<void>(`api/rules/${id}`);
  }
  reapplyRules() {
    return this.http.post<ReapplyResult>('api/rules/reapply', {});
  }

  // Transactions
  listTransactions(query: TransactionQuery) {
    const params: Record<string, string> = {};
    if (query.accountId) params['accountId'] = String(query.accountId);
    if (query.year) params['year'] = String(query.year);
    if (query.month) params['month'] = String(query.month);
    if (query.categoryId) params['categoryId'] = String(query.categoryId);
    if (query.q) params['q'] = query.q;
    return this.http.get<Transaction[]>('api/transactions', { params });
  }
  patchTransaction(id: number, patch: TransactionPatch) {
    return this.http.patch<TransactionPatchResult>(`api/transactions/${id}`, patch);
  }

  // Reports
  monthlyReport(year: number, month: number, accountId?: number | null) {
    return this.http.get<MonthlyReport>('api/reports/monthly', {
      params: { year: String(year), month: String(month), ...accountParam(accountId) },
    });
  }
  trendReport(from: string, to: string, accountId?: number | null) {
    return this.http.get<TrendReport>('api/reports/trend', {
      params: { from, to, ...accountParam(accountId) },
    });
  }
}

/** Ohne Konto (`null`/`undefined`) = „Alle Konten“ → kein Parameter. */
function accountParam(accountId: number | null | undefined): Record<string, string> {
  return accountId ? { accountId: String(accountId) } : {};
}
