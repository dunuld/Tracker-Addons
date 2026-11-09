/** Hilfsfunktionen rund um Konten (ohne Express-/Router-Abhängigkeiten). */

const ACCOUNT_COLORS = ['#2196f3', '#ff9800', '#9c27b0', '#009688', '#e91e63', '#795548'];

/** Standardname eines neu erkannten Kontos, z. B. `ING ••8801`. */
export function defaultAccountName(bank: string, iban: string): string {
  return `${bank} ••${iban.slice(-4)}`;
}

/** Farbe für das n-te Konto (0-basiert), zyklisch aus einer festen Palette. */
export function defaultAccountColor(index: number): string {
  return ACCOUNT_COLORS[index % ACCOUNT_COLORS.length]!;
}

/**
 * SQL-Bedingung, die Buchungen (`<alias>.statement_id`) auf ein Konto einschränkt –
 * oder ohne `accountId` auf alle Konten, die in „Alle Konten“ einfließen.
 */
export function accountScope(
  accountId: number | undefined,
  alias = 't',
): { sql: string; params: number[] } {
  if (accountId !== undefined) {
    return {
      sql: `${alias}.statement_id IN (SELECT id FROM statements WHERE account_id = ?)`,
      params: [accountId],
    };
  }
  return {
    sql: `${alias}.statement_id IN (SELECT s.id FROM statements s JOIN accounts a ON a.id = s.account_id
                                     WHERE a.include_in_reports = 1)`,
    params: [],
  };
}
