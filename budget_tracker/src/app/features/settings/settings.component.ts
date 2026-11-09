import { HttpErrorResponse } from '@angular/common/http';
import { Component, signal, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AccountService } from '../../core/account.service.js';
import { ApiService } from '../../core/api.service.js';
import {
  formatDate as fmtDate,
  formatEuro as fmtEuro,
  formatMonthYear as fmtMonthYear,
} from '../../core/format.js';
import type {
  Account,
  AccountInput,
  Category,
  CategoryInput,
  Rule,
  RuleInput,
  Statement,
} from '../../../../shared/api-types';
import type { CategoryKind, RuleField, RuleMatchType } from '../../../../shared/api-types';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [FormsModule],
  template: `
    <h2>Einstellungen</h2>

    <div class="tabs">
      <button
        class="tab"
        [class.active]="activeTab() === 'categories'"
        (click)="activeTab.set('categories')"
      >
        Kategorien
      </button>
      <button class="tab" [class.active]="activeTab() === 'rules'" (click)="activeTab.set('rules')">
        Regeln
      </button>
      <button
        class="tab"
        [class.active]="activeTab() === 'accounts'"
        (click)="activeTab.set('accounts')"
      >
        Konten
      </button>
      <button
        class="tab"
        [class.active]="activeTab() === 'statements'"
        (click)="activeTab.set('statements')"
      >
        Auszüge
      </button>
    </div>

    @if (activeTab() === 'categories') {
      <div class="tab-content">
        <div class="form-row">
          <input #name placeholder="Name" [(ngModel)]="newCatName" class="input" />
          <input #color type="color" [(ngModel)]="newCatColor" class="color-input" />
          <select #kind [(ngModel)]="newCatKind" class="input">
            <option value="expense">Ausgabe</option>
            <option value="income">Einnahme</option>
            <option value="transfer">Umbuchung</option>
          </select>
          <button class="btn-primary" (click)="addCategory(name, color, kind)">Hinzufügen</button>
        </div>

        @if (categories().length > 0) {
          <div class="bt-card table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Farbe</th>
                  <th>Typ</th>
                  <th>Aktionen</th>
                </tr>
              </thead>
              <tbody>
                @for (cat of categories(); track cat.id) {
                  <tr>
                    <td>
                      <span class="color-dot" [style.background]="cat.color"></span>
                      {{ cat.name }}
                      @if (cat.isDefault) {
                        <span class="badge">Standard</span>
                      }
                    </td>
                    <td>
                      <code>{{ cat.color }}</code>
                    </td>
                    <td>{{ kindLabel(cat.kind) }}</td>
                    <td>
                      @if (!cat.isDefault) {
                        <button class="btn-danger" (click)="deleteCategory(cat.id)">Löschen</button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>
    }

    @if (activeTab() === 'rules') {
      <div class="tab-content">
        <button class="btn-secondary" (click)="reapplyRules()" [disabled]="reapplying()">
          {{ reapplying() ? 'Wende an …' : 'Regeln neu anwenden' }}
        </button>
        @if (reapplyMsg()) {
          <span class="success-msg">{{ reapplyMsg() }}</span>
        }

        <div class="form-row">
          <select #ruleCat [(ngModel)]="newRuleCat" class="input">
            <option disabled value="">Kategorie wählen</option>
            @for (cat of categories(); track cat.id) {
              <option [value]="cat.id">{{ cat.name }}</option>
            }
          </select>
          <select #ruleField [(ngModel)]="newRuleField" class="input">
            <option value="counterparty">Empfänger</option>
            <option value="purpose">Verwendungszweck</option>
            <option value="any">Beides</option>
          </select>
          <select #ruleMatch [(ngModel)]="newRuleMatch" class="input">
            <option value="contains">Enthält</option>
            <option value="regex">Regex</option>
          </select>
          <input #rulePattern placeholder="Muster" [(ngModel)]="newRulePattern" class="input" />
          <button class="btn-primary" (click)="addRule(ruleCat, ruleField, ruleMatch, rulePattern)">
            Hinzufügen
          </button>
        </div>

        @if (rules().length > 0) {
          <div class="bt-card table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Kategorie</th>
                  <th>Feld</th>
                  <th>Typ</th>
                  <th>Muster</th>
                  <th>Priorität</th>
                  <th>Aktionen</th>
                </tr>
              </thead>
              <tbody>
                @for (rule of rules(); track rule.id) {
                  <tr>
                    <td>{{ categoryName(rule.categoryId) }}</td>
                    <td>{{ fieldLabel(rule.field) }}</td>
                    <td>{{ rule.matchType }}</td>
                    <td>
                      <code>{{ rule.pattern }}</code>
                    </td>
                    <td>{{ rule.priority }}</td>
                    <td>
                      <button class="btn-danger" (click)="deleteRule(rule.id)">Löschen</button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>
    }

    @if (activeTab() === 'accounts') {
      <div class="tab-content">
        @if (accountList().length > 0) {
          <p class="hint">
            Konten werden beim Import eines Auszugs automatisch anhand der IBAN angelegt. Ist „In
            Alle Konten“ deaktiviert, erscheint das Konto nur, wenn es ausdrücklich ausgewählt ist.
          </p>
          <div class="bt-card table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Farbe</th>
                  <th>Name</th>
                  <th>IBAN</th>
                  <th class="text-right">Saldo</th>
                  <th class="text-right">Auszüge</th>
                  <th>In „Alle Konten“</th>
                  <th>Aktionen</th>
                </tr>
              </thead>
              <tbody>
                @for (a of accountList(); track a.id) {
                  <tr>
                    <td>
                      <input
                        type="color"
                        class="color-input"
                        [value]="a.color"
                        (change)="updateAccount(a, { color: $any($event.target).value })"
                        [attr.aria-label]="'Farbe von ' + a.name"
                      />
                    </td>
                    <td>
                      <input
                        class="input account-name"
                        [value]="a.name"
                        maxlength="100"
                        (change)="renameAccount(a, $any($event.target))"
                        [attr.aria-label]="'Name von ' + a.name"
                      />
                    </td>
                    <td>
                      <code>{{ a.iban }}</code>
                    </td>
                    <td class="text-right">
                      @if (a.balanceCents !== null) {
                        {{ formatEuro(a.balanceCents) }}
                        <span class="muted">{{ balanceLabel(a) }}</span>
                      } @else {
                        —
                      }
                    </td>
                    <td class="text-right">{{ a.statementCount }}</td>
                    <td>
                      <input
                        type="checkbox"
                        [checked]="a.includeInReports"
                        (change)="
                          updateAccount(a, { includeInReports: $any($event.target).checked })
                        "
                        [attr.aria-label]="a.name + ' in Alle Konten einbeziehen'"
                      />
                    </td>
                    <td>
                      <button class="btn-danger" (click)="deleteAccount(a)">Löschen</button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <p class="empty">Noch keine Konten – lade einen Kontoauszug hoch.</p>
        }
      </div>
    }

    @if (activeTab() === 'statements') {
      <div class="tab-content">
        @if (statements().length > 0) {
          <div class="bt-card table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Monat</th>
                  <th>Konto</th>
                  <th>Buchungen</th>
                  <th>Importiert</th>
                  <th>Aktionen</th>
                </tr>
              </thead>
              <tbody>
                @for (s of statements(); track s.id) {
                  <tr>
                    <td>{{ monthYearLabel(s.year, s.month) }}</td>
                    <td>
                      {{ s.accountName }}
                      <code class="iban">{{ s.iban }}</code>
                    </td>
                    <td>{{ s.transactionCount }}</td>
                    <td>{{ formatDate(s.importedAt) }}</td>
                    <td>
                      <button class="btn-danger" (click)="deleteStatement(s.id)">Löschen</button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <p class="empty">Noch keine Auszüge importiert.</p>
        }
      </div>
    }

    @if (errorMsg()) {
      <div class="error-msg">{{ errorMsg() }}</div>
    }
  `,
  styles: `
    .tabs {
      display: flex;
      gap: 0.25rem;
      margin-bottom: 1.5rem;
      border-bottom: 1px solid var(--bt-border);
      overflow-x: auto;
      scrollbar-width: none;
    }
    .tab {
      flex: none;
      background: none;
      border: none;
      padding: 0 1rem;
      height: 40px;
      cursor: pointer;
      font-size: 0.95rem;
      font-weight: 500;
      color: var(--bt-text-secondary);
      border-bottom: 2px solid transparent;
      margin-bottom: -1px;
      white-space: nowrap;
    }
    .tab:hover {
      color: var(--bt-text);
      background: var(--bt-hover);
    }
    .tab.active {
      color: var(--bt-primary);
      border-bottom-color: var(--bt-primary);
    }

    .tab-content {
      padding-top: 0.5rem;
    }

    .form-row {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1rem;
      flex-wrap: wrap;
      align-items: center;
    }
    .input {
      height: 36px;
      padding: 0 0.6rem;
      border: 1px solid var(--bt-border-input);
      border-radius: 8px;
      font-size: 0.9rem;
      color: var(--bt-text);
      background: var(--bt-surface);
    }
    .color-input {
      width: 44px;
      height: 36px;
      padding: 2px;
      border: 1px solid var(--bt-border-input);
      border-radius: 8px;
      background: var(--bt-surface);
      cursor: pointer;
    }
    .btn-primary {
      background: var(--bt-primary);
      color: var(--bt-text-on-primary);
      border: none;
      border-radius: 8px;
      height: 36px;
      padding: 0 1rem;
      cursor: pointer;
      font-size: 0.9rem;
      font-weight: 500;
    }
    .btn-secondary {
      background: var(--bt-bg-tertiary);
      color: var(--bt-text);
      border: none;
      border-radius: 8px;
      height: 36px;
      padding: 0 1rem;
      cursor: pointer;
      font-size: 0.9rem;
      margin-bottom: 1rem;
    }
    .btn-secondary:disabled {
      opacity: 0.5;
      cursor: default;
    }
    .btn-danger {
      background: #f44336;
      color: white;
      border: none;
      border-radius: 6px;
      padding: 0.3rem 0.6rem;
      cursor: pointer;
      font-size: 0.85rem;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }
    td {
      overflow-wrap: anywhere;
    }
    th,
    td {
      padding: 0.6rem 0.8rem;
      text-align: left;
      border-bottom: 1px solid var(--bt-border);
    }
    th {
      font-size: 0.85rem;
      color: var(--bt-text-secondary);
      font-weight: 600;
    }
    code {
      background: var(--bt-code-bg);
      padding: 0.1rem 0.3rem;
      border-radius: 3px;
      font-size: 0.85rem;
      color: var(--bt-text);
    }

    .color-dot {
      display: inline-block;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      margin-right: 0.5rem;
      vertical-align: middle;
    }
    .badge {
      display: inline-block;
      background: var(--bt-badge-bg);
      color: var(--bt-text-secondary);
      font-size: 0.75rem;
      padding: 0.1rem 0.4rem;
      border-radius: 3px;
      margin-left: 0.5rem;
    }

    .text-right {
      text-align: right;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .muted {
      display: block;
      font-size: 0.75rem;
      color: var(--bt-text-muted);
    }
    .hint {
      font-size: 0.85rem;
      color: var(--bt-text-secondary);
      margin: 0 0 1rem;
    }
    .account-name {
      min-width: 140px;
      width: 100%;
    }
    code.iban {
      display: block;
      width: fit-content;
      margin-top: 0.2rem;
      font-size: 0.75rem;
    }

    .success-msg {
      color: var(--bt-success-text);
      font-size: 0.9rem;
      margin-left: 0.5rem;
    }
    .error-msg {
      color: var(--bt-error-text);
      font-size: 0.9rem;
      margin-top: 0.5rem;
    }
    .empty {
      color: var(--bt-text-muted);
      text-align: center;
      padding: 2rem;
    }

    @media (max-width: 600px) {
      .tabs {
        margin-bottom: 1rem;
      }
      .tab {
        padding: 0 0.75rem;
      }
      .form-row .input {
        flex: 1 1 140px;
        min-width: 0;
      }
      .form-row .btn-primary {
        flex: 1 1 100%;
      }
      th,
      td {
        padding: 0.5rem 0.6rem;
      }
    }
  `,
})
export default class SettingsComponent {
  private readonly api = inject(ApiService);

  private readonly accountService = inject(AccountService);

  readonly activeTab = signal<'categories' | 'rules' | 'accounts' | 'statements'>('categories');

  // Accounts
  readonly accountList = this.accountService.accounts;

  // Categories
  readonly categories = signal<Category[]>([]);
  newCatName = '';
  newCatColor = '#4caf50';
  newCatKind: CategoryKind = 'expense';

  // Rules
  readonly rules = signal<Rule[]>([]);
  newRuleCat = '';
  newRuleField: RuleField = 'any';
  newRuleMatch: RuleMatchType = 'contains';
  newRulePattern = '';

  // Statements
  readonly statements = signal<Statement[]>([]);

  // Feedback
  readonly errorMsg = signal('');
  readonly reapplying = signal(false);
  readonly reapplyMsg = signal('');

  constructor() {
    this.loadCategories();
    this.loadRules();
    this.loadStatements();
    this.loadAccounts();
  }

  loadAccounts() {
    this.accountService
      .refresh()
      .catch(() => this.errorMsg.set('Konten konnten nicht geladen werden'));
  }

  renameAccount(account: Account, input: HTMLInputElement) {
    const name = input.value.trim();
    if (!name) {
      input.value = account.name;
      return;
    }
    if (name !== account.name) this.updateAccount(account, { name });
  }

  updateAccount(account: Account, input: AccountInput) {
    this.api.updateAccount(account.id, input).subscribe({
      next: (updated) => {
        this.accountList.update((list) => list.map((a) => (a.id === updated.id ? updated : a)));
        // Kontonamen in der Auszugsliste aktualisieren
        if (input.name) this.loadStatements();
      },
      error: (err: HttpErrorResponse) =>
        this.errorMsg.set(err.error?.error ?? 'Konto konnte nicht geändert werden'),
    });
  }

  deleteAccount(account: Account) {
    const msg =
      `Konto „${account.name}“ löschen?\n\n` +
      `Alle ${account.statementCount} Auszüge und deren Buchungen werden ebenfalls gelöscht.`;
    if (!confirm(msg)) return;
    this.api.deleteAccount(account.id).subscribe({
      next: () => {
        this.loadAccounts();
        this.loadStatements();
      },
      error: (err: HttpErrorResponse) =>
        this.errorMsg.set(err.error?.error ?? 'Fehler beim Löschen'),
    });
  }

  loadCategories() {
    this.api.listCategories().subscribe({
      next: (data) => this.categories.set(data),
      error: () => this.errorMsg.set('Kategorien konnten nicht geladen werden'),
    });
  }

  loadRules() {
    this.api.listRules().subscribe({
      next: (data) => this.rules.set(data),
      error: () => this.errorMsg.set('Regeln konnten nicht geladen werden'),
    });
  }

  loadStatements() {
    this.api.listStatements().subscribe({
      next: (data) => this.statements.set(data),
      error: () => this.errorMsg.set('Auszüge konnten nicht geladen werden'),
    });
  }

  addCategory(
    nameInput: HTMLInputElement,
    colorInput: HTMLInputElement,
    kindInput: HTMLSelectElement,
  ) {
    const name = nameInput.value.trim();
    if (!name) return;
    const input: CategoryInput = {
      name,
      color: colorInput.value,
      kind: kindInput.value as CategoryKind,
    };
    this.api.createCategory(input).subscribe({
      next: (cat) => {
        this.categories.update((cats) => [...cats, cat]);
        nameInput.value = '';
      },
      error: (err: HttpErrorResponse) =>
        this.errorMsg.set(err.error?.error ?? 'Fehler beim Erstellen'),
    });
  }

  deleteCategory(id: number) {
    if (!confirm('Kategorie löschen? Buchungen werden auf „Sonstiges" zurückgesetzt.')) return;
    this.api.deleteCategory(id).subscribe({
      next: () => {
        this.categories.update((cats) => cats.filter((c) => c.id !== id));
        this.loadRules();
      },
      error: (err: HttpErrorResponse) =>
        this.errorMsg.set(err.error?.error ?? 'Fehler beim Löschen'),
    });
  }

  addRule(
    catSelect: HTMLSelectElement,
    fieldSelect: HTMLSelectElement,
    matchSelect: HTMLSelectElement,
    patternInput: HTMLInputElement,
  ) {
    const categoryId = Number(catSelect.value);
    const pattern = patternInput.value.trim();
    if (!categoryId || !pattern) return;
    const input: RuleInput = {
      categoryId,
      field: fieldSelect.value as RuleField,
      matchType: matchSelect.value as RuleMatchType,
      pattern,
    };
    this.api.createRule(input).subscribe({
      next: (rule) => {
        this.rules.update((rules) => [...rules, rule]);
        patternInput.value = '';
      },
      error: (err: HttpErrorResponse) =>
        this.errorMsg.set(err.error?.error ?? 'Fehler beim Erstellen'),
    });
  }

  deleteRule(id: number) {
    this.api.deleteRule(id).subscribe({
      next: () => {
        this.rules.update((rules) => rules.filter((r) => r.id !== id));
      },
      error: (err: HttpErrorResponse) =>
        this.errorMsg.set(err.error?.error ?? 'Fehler beim Löschen'),
    });
  }

  reapplyRules() {
    this.reapplying.set(true);
    this.reapplyMsg.set('');
    this.api.reapplyRules().subscribe({
      next: (result) => {
        this.reapplyMsg.set(`${result.updated} Buchungen aktualisiert`);
        this.reapplying.set(false);
      },
      error: () => {
        this.errorMsg.set('Regeln konnten nicht angewendet werden');
        this.reapplying.set(false);
      },
    });
  }

  deleteStatement(id: number) {
    if (!confirm('Auszug und alle zugehörigen Buchungen löschen?')) return;
    this.api.deleteStatement(id).subscribe({
      next: () => {
        this.statements.update((stmts) => stmts.filter((s) => s.id !== id));
        this.loadAccounts();
      },
      error: (err: HttpErrorResponse) =>
        this.errorMsg.set(err.error?.error ?? 'Fehler beim Löschen'),
    });
  }

  categoryName(categoryId: number): string {
    return this.categories().find((c) => c.id === categoryId)?.name ?? `ID: ${categoryId}`;
  }

  kindLabel(kind: CategoryKind): string {
    switch (kind) {
      case 'expense':
        return 'Ausgabe';
      case 'income':
        return 'Einnahme';
      case 'transfer':
        return 'Umbuchung';
    }
  }

  fieldLabel(field: RuleField): string {
    switch (field) {
      case 'counterparty':
        return 'Empfänger';
      case 'purpose':
        return 'Verwendungszweck';
      case 'any':
        return 'Beides';
    }
  }

  monthYearLabel(year: number, month: number): string {
    const months = [
      'Jan',
      'Feb',
      'Mär',
      'Apr',
      'Mai',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Okt',
      'Nov',
      'Dez',
    ];
    return `${months[month - 1]} ${year}`;
  }

  formatEuro(cents: number): string {
    return fmtEuro(cents);
  }

  balanceLabel(account: Account): string {
    if (!account.balanceMonth) return '';
    const [year, month] = account.balanceMonth.split('-').map(Number);
    return `Stand ${fmtMonthYear(year!, month!)}`;
  }

  formatDate(iso: string): string {
    return fmtDate(iso);
  }
}
