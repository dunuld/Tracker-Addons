import { Router } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import type {
  ReapplyResult,
  Rule,
  RuleField,
  RuleInput,
  RuleMatchType,
} from '../../../shared/api-types.js';
import { Categorizer, compileRuleRegex } from '../categorization/categorizer.js';
import { TransferDetector } from '../categorization/transfers.js';
import { badRequest, notFound, parseId } from '../http-error.js';

const FIELDS: readonly RuleField[] = ['counterparty', 'purpose', 'any'];
const MATCH_TYPES: readonly RuleMatchType[] = ['contains', 'regex'];

export function toRule(row: Record<string, unknown>): Rule {
  return {
    id: Number(row['id']),
    categoryId: Number(row['category_id']),
    field: String(row['field']) as Rule['field'],
    matchType: String(row['match_type']) as Rule['matchType'],
    pattern: String(row['pattern']),
    priority: Number(row['priority']),
  };
}

/** Vollständige, validierte Regel (Pflichtfelder bereits mit Standardwerten ergänzt). */
function validate(db: DatabaseSync, rule: Omit<Rule, 'id'>): void {
  if (!rule.pattern) throw badRequest('Muster ist erforderlich');
  if (!FIELDS.includes(rule.field))
    throw badRequest('Ungültiges Feld (counterparty, purpose, any)');
  if (!MATCH_TYPES.includes(rule.matchType))
    throw badRequest('Ungültiger Vergleich (contains, regex)');
  if (!Number.isSafeInteger(rule.priority)) throw badRequest('Priorität muss eine Ganzzahl sein');
  if (rule.matchType === 'regex' && !compileRuleRegex(rule.pattern))
    throw badRequest('Ungültiges Regex-Muster');
  if (!Number.isSafeInteger(rule.categoryId) || rule.categoryId <= 0)
    throw badRequest('Kategorie ist erforderlich');
  if (!db.prepare('SELECT id FROM categories WHERE id = ?').get(rule.categoryId)) {
    throw notFound('Kategorie nicht gefunden');
  }
}

const trimmed = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

export function rulesRouter(db: DatabaseSync): Router {
  const router = Router();
  const categorizer = new Categorizer(db);
  const transfers = new TransferDetector(db);
  const byId = (id: number) => db.prepare('SELECT * FROM rules WHERE id = ?').get(id);

  router.get('/', (_req, res) => {
    res.json(db.prepare('SELECT * FROM rules ORDER BY priority, id').all().map(toRule));
  });

  router.post('/', (req, res) => {
    const input = (req.body ?? {}) as Partial<RuleInput>;
    const rule: Omit<Rule, 'id'> = {
      categoryId: Number(input.categoryId),
      field: input.field ?? 'any',
      matchType: input.matchType ?? 'contains',
      pattern: trimmed(input.pattern),
      priority: input.priority ?? 100,
    };
    validate(db, rule);

    const { lastInsertRowid } = db
      .prepare(
        'INSERT INTO rules (category_id, field, match_type, pattern, priority) VALUES (?, ?, ?, ?, ?)',
      )
      .run(rule.categoryId, rule.field, rule.matchType, rule.pattern, rule.priority);
    res.status(201).json(toRule(byId(Number(lastInsertRowid))!));
  });

  router.post('/reapply', (_req, res) => {
    const result: ReapplyResult = { updated: categorizer.reapply() + transfers.detect() };
    res.json(result);
  });

  router.get('/:id', (req, res) => {
    const row = byId(parseId(req.params['id']));
    if (!row) throw notFound('Regel nicht gefunden');
    res.json(toRule(row));
  });

  router.patch('/:id', (req, res) => {
    const id = parseId(req.params['id']);
    const input = (req.body ?? {}) as Partial<RuleInput>;
    const row = byId(id);
    if (!row) throw notFound('Regel nicht gefunden');

    const existing = toRule(row);
    const rule: Omit<Rule, 'id'> = {
      categoryId: input.categoryId !== undefined ? Number(input.categoryId) : existing.categoryId,
      field: input.field ?? existing.field,
      matchType: input.matchType ?? existing.matchType,
      pattern: input.pattern !== undefined ? trimmed(input.pattern) : existing.pattern,
      priority: input.priority ?? existing.priority,
    };
    validate(db, rule);

    db.prepare(
      'UPDATE rules SET category_id = ?, field = ?, match_type = ?, pattern = ?, priority = ? WHERE id = ?',
    ).run(rule.categoryId, rule.field, rule.matchType, rule.pattern, rule.priority, id);
    res.json(toRule(byId(id)!));
  });

  router.delete('/:id', (req, res) => {
    const id = parseId(req.params['id']);
    if (!byId(id)) throw notFound('Regel nicht gefunden');
    db.prepare('DELETE FROM rules WHERE id = ?').run(id);
    res.status(204).end();
  });

  return router;
}
