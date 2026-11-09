import { Component, inject } from '@angular/core';
import { AccountService } from '../core/account.service';

/** Kontoauswahl („Alle Konten“ oder ein Konto); nur sichtbar bei mehr als einem Konto. */
@Component({
  selector: 'app-account-select',
  template: `
    @if (accounts.hasMultiple()) {
      <select
        class="account-select"
        aria-label="Konto"
        [style.border-left-color]="accounts.byId(accounts.selectedId())?.color ?? null"
        (change)="onChange($event)"
      >
        <option value="" [selected]="accounts.selectedId() === null">Alle Konten</option>
        @for (a of accounts.accounts(); track a.id) {
          <option [value]="a.id" [selected]="a.id === accounts.selectedId()">
            {{ a.name }}{{ a.includeInReports ? '' : ' (ausgeblendet)' }}
          </option>
        }
      </select>
    }
  `,
  styles: `
    :host {
      display: contents;
    }
    .account-select {
      height: 36px;
      padding: 0 0.6rem;
      border: 1px solid var(--bt-border-input);
      border-left: 4px solid var(--bt-border-input);
      border-radius: 8px;
      font-size: 0.9rem;
      color: var(--bt-text);
      background: var(--bt-surface);
      max-width: 100%;
    }
    @media (max-width: 700px) {
      .account-select {
        flex: 1 1 140px;
        min-width: 0;
      }
    }
  `,
})
export default class AccountSelectComponent {
  readonly accounts = inject(AccountService);

  onChange(event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    this.accounts.select(value ? Number(value) : null);
  }
}
