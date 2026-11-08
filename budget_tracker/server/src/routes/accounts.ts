import { Router } from 'express';
import type { Account, AccountInput } from '../../../shared/api-types.js';
import type { Database } from '../db/database.js';
import { badRequest, notFound, parseId } from '../http-error.js';
import type { ImportService } from '../services/import.service.js';

const COLOR = /^#[0-9A-Fa-f]{6}$/;

const ACCOUNT_SELECT = `
  SELECT a.*,
         (SELECT COUNT(*) FROM statements s WHERE s.account_id = a.id) AS statement_count,
         latest.closing_cents AS balance_cents,
         latest.year AS balance_year,
         latest.month AS balance_month
    FROM accounts a
    LEFT JOIN statements latest ON latest.id = (
      SELECT s.id FROM statements s WHERE s.account_id = a.id
       ORDER BY s.year DESC, s.month DESC LIMIT 1)`;

function toAccount(row: Record<string, unknown>): Account {
  const hasBalance = row['balance_cents'] !== null;
  return {
    id: Number(row['id']),
    iban: String(row['iban']),
    bank: String(row['bank']),
    name: String(row['name']),
    color: String(row['color']),
    sort: Number(row['sort']),
    includeInReports: Number(row['include_in_reports']) === 1,
    statementCount: Number(row['statement_count']),
    balanceCents: hasBalance ? Number(row['balance_cents']) : null,
    balanceMonth: hasBalance
      ? `${String(row['balance_year'])}-${String(row['balance_month']).padStart(2, '0')}`
      : null,
  };
}

function validate(input: AccountInput): void {
  if (input.name !== undefined && (typeof input.name !== 'string' || !input.name.trim()))
    throw badRequest('Name ist erforderlich');
  if (input.name !== undefined && input.name.trim().length > 100)
    throw badRequest('Name darf höchstens 100 Zeichen lang sein');
  if (input.color !== undefined && (typeof input.color !== 'string' || !COLOR.test(input.color)))
    throw badRequest('Ungültige Farbe (z. B. #2196f3)');
  if (input.sort !== undefined && !Number.isSafeInteger(input.sort))
    throw badRequest('sort muss eine Ganzzahl sein');
  if (input.includeInReports !== undefined && typeof input.includeInReports !== 'boolean')
    throw badRequest('includeInReports muss true oder false sein');
}

export function accountsRouter(db: Database, imports: ImportService): Router {
  const router = Router();
  const byId = (id: number) => db.prepare(`${ACCOUNT_SELECT} WHERE a.id = ?`).get(id);

  router.get('/', (_req, res) => {
    res.json(db.prepare(`${ACCOUNT_SELECT} ORDER BY a.sort, a.id`).all().map(toAccount));
  });

  router.get('/:id', (req, res) => {
    const row = byId(parseId(req.params['id']));
    if (!row) throw notFound('Konto nicht gefunden');
    res.json(toAccount(row));
  });

  router.patch('/:id', (req, res) => {
    const id = parseId(req.params['id']);
    const input = (req.body ?? {}) as AccountInput;
    validate(input);
    const existing = byId(id);
    if (!existing) throw notFound('Konto nicht gefunden');

    db.prepare(
      'UPDATE accounts SET name = ?, color = ?, sort = ?, include_in_reports = ? WHERE id = ?',
    ).run(
      input.name?.trim() ?? String(existing['name']),
      input.color ?? String(existing['color']),
      input.sort ?? Number(existing['sort']),
      input.includeInReports === undefined
        ? Number(existing['include_in_reports'])
        : input.includeInReports
          ? 1
          : 0,
      id,
    );
    res.json(toAccount(byId(id)!));
  });

  router.delete('/:id', (req, res) => {
    imports.deleteAccount(parseId(req.params['id']));
    res.status(204).end();
  });

  return router;
}
