import { Router } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import type {
  Transaction,
  TransactionPatch,
  TransactionPatchResult,
} from '../../../shared/api-types.js';
import { Categorizer } from '../categorization/categorizer.js';
import { accountScope } from '../accounts.js';
import { accountIdParam, badRequest, intParam, notFound, parseId } from '../http-error.js';
import { monthStart, nextMonthStart } from '../month.js';
import { toRule } from './rules.js';

const TX_SELECT = `SELECT t.*, s.account_id FROM transactions t
                     JOIN statements s ON s.id = t.statement_id`;

function toTransaction(row: Record<string, unknown>): Transaction {
  return {
    id: Number(row['id']),
    statementId: Number(row['statement_id']),
    accountId: Number(row['account_id']),
    bookingDate: String(row['booking_date']),
    valueDate: String(row['value_date']),
    type: String(row['type']),
    counterparty: String(row['counterparty']),
    purpose: String(row['purpose']),
    amountCents: Number(row['amount_cents']),
    categoryId: row['category_id'] !== null ? Number(row['category_id']) : null,
    categorySource: String(row['category_source']) as Transaction['categorySource'],
    ruleId: row['rule_id'] !== null ? Number(row['rule_id']) : null,
  };
}

export function transactionsRouter(db: DatabaseSync): Router {
  const router = Router();
  const categorizer = new Categorizer(db);

  router.get('/', (req, res) => {
    // Query-Werte kommen als Strings – vor dem Rechnen in Zahlen wandeln
    // (sonst wird aus "3" + 1 der String "31").
    const year = intParam(req.query['year'], 'year', 1990, 2200);
    const month = intParam(req.query['month'], 'month', 1, 12);
    const categoryId = intParam(req.query['categoryId'], 'categoryId', 1, Number.MAX_SAFE_INTEGER);
    const accountId = accountIdParam(req.query['accountId']);
    const q = typeof req.query['q'] === 'string' ? req.query['q'].trim() : '';

    const scope = accountScope(accountId);
    const conditions: string[] = [scope.sql];
    const params: (string | number)[] = [...scope.params];

    if (year !== undefined && month !== undefined) {
      conditions.push('t.booking_date >= ? AND t.booking_date < ?');
      params.push(monthStart(year, month), nextMonthStart(year, month));
    }
    if (categoryId !== undefined) {
      conditions.push('t.category_id = ?');
      params.push(categoryId);
    }
    if (q) {
      // % und _ wörtlich suchen
      conditions.push("(t.counterparty LIKE ? ESCAPE '\\' OR t.purpose LIKE ? ESCAPE '\\')");
      const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      params.push(like, like);
    }

    const rows = db
      .prepare(`${TX_SELECT} WHERE ${conditions.join(' AND ')} ORDER BY t.booking_date, t.id`)
      .all(...params);
    res.json(rows.map(toTransaction));
  });

  router.patch('/:id', (req, res) => {
    const id = parseId(req.params['id']);
    const input = (req.body ?? {}) as Partial<TransactionPatch>;
    const categoryId = Number(input.categoryId);
    if (!Number.isSafeInteger(categoryId) || categoryId <= 0)
      throw badRequest('categoryId ist erforderlich');

    const txRow = db.prepare(`${TX_SELECT} WHERE t.id = ?`).get(id);
    if (!txRow) throw notFound('Transaktion nicht gefunden');
    if (!db.prepare('SELECT id FROM categories WHERE id = ?').get(categoryId)) {
      throw notFound('Kategorie nicht gefunden');
    }
    const tx = toTransaction(txRow);
    if (input.createRule && !tx.counterparty.trim()) {
      throw badRequest('Für Buchungen ohne Empfänger kann keine Regel angelegt werden');
    }

    db.prepare(
      "UPDATE transactions SET category_id = ?, category_source = 'manual', rule_id = NULL WHERE id = ?",
    ).run(categoryId, id);

    const result: TransactionPatchResult = {
      transaction: toTransaction(db.prepare(`${TX_SELECT} WHERE t.id = ?`).get(id)!),
    };
    if (input.createRule) {
      const ruleId = categorizer.createRuleFromTransaction(tx, categoryId);
      result.rule = toRule(db.prepare('SELECT * FROM rules WHERE id = ?').get(ruleId)!);
    }
    res.json(result);
  });

  return router;
}
