import type { DatabaseSync } from 'node:sqlite';
import type { CategorySource, RuleField, RuleMatchType } from '../../../shared/api-types.js';
import { transaction } from '../db/database.js';
import type { ParsedTransaction } from '../parsing/bank-parser.js';

export interface CategoryAssignment {
  categoryId: number | null;
  source: CategorySource;
  ruleId: number | null;
}

type MatchInput = Pick<ParsedTransaction, 'counterparty' | 'purpose'>;

interface CompiledRule {
  id: number;
  categoryId: number;
  field: RuleField;
  test: (text: string) => boolean;
}

/** Flags für Regex-Regeln – Validierung (Routen) und Auswertung müssen identisch sein. */
const REGEX_FLAGS = 'iu';

/** Kompiliert ein Regex-Regelmuster; `null`, wenn es ungültig ist. */
export function compileRuleRegex(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern, REGEX_FLAGS);
  } catch {
    return null;
  }
}

function compileRule(row: {
  id: number;
  category_id: number;
  field: RuleField;
  match_type: RuleMatchType;
  pattern: string;
}): CompiledRule {
  let test: (text: string) => boolean;
  if (row.match_type === 'contains') {
    const needle = row.pattern.toUpperCase();
    test = (text) => text.toUpperCase().includes(needle);
  } else {
    // Muster NICHT in Großbuchstaben wandeln: aus \b würde \B, aus \d würde \D.
    const re = compileRuleRegex(row.pattern);
    test = re ? (text) => re.test(text) : () => false; // ungültige Regex → nie Treffer
  }
  return { id: Number(row.id), categoryId: Number(row.category_id), field: row.field, test };
}

function fieldText(field: RuleField, tx: MatchInput): string {
  switch (field) {
    case 'counterparty':
      return tx.counterparty;
    case 'purpose':
      return tx.purpose;
    case 'any':
      return `${tx.counterparty} ${tx.purpose}`;
  }
}

/**
 * Wendet die konfigurierten Regeln auf eine Buchung an.
 * Regeln werden nach Priorität (aufsteigend) geprüft; erste passende Regel gewinnt.
 * Ohne Treffer wird die Fallback-Kategorie verwendet.
 */
export class Categorizer {
  constructor(private readonly db: DatabaseSync) {}

  apply(tx: MatchInput): CategoryAssignment {
    return this.matcher()(tx);
  }

  /**
   * Lädt und kompiliert die Regeln einmal und liefert eine Zuordnungsfunktion.
   * Für Massenverarbeitung (reapply), damit Regeln nicht je Buchung neu gelesen werden.
   */
  matcher(): (tx: MatchInput) => CategoryAssignment {
    const rules = (
      this.db
        .prepare(
          'SELECT id, category_id, field, match_type, pattern FROM rules ORDER BY priority, id',
        )
        .all() as {
        id: number;
        category_id: number;
        field: RuleField;
        match_type: RuleMatchType;
        pattern: string;
      }[]
    ).map(compileRule);
    const defaultRow = this.db.prepare('SELECT id FROM categories WHERE is_default = 1').get();
    const fallback: CategoryAssignment = {
      categoryId: defaultRow ? Number(defaultRow['id']) : null,
      source: 'default',
      ruleId: null,
    };

    return (tx) => {
      for (const rule of rules) {
        const text = fieldText(rule.field, tx);
        if (text && rule.test(text))
          return { categoryId: rule.categoryId, source: 'rule', ruleId: rule.id };
      }
      return { ...fallback };
    };
  }

  /**
   * Wendet Regeln auf alle nicht manuell zugeordneten und nicht als Umbuchung erkannten
   * Buchungen an (Umbuchungen prüft `TransferDetector`).
   * Gibt die Anzahl der tatsächlich geänderten Buchungen zurück.
   */
  reapply(): number {
    return transaction(this.db, () => {
      const match = this.matcher();
      const rows = this.db
        .prepare(
          `SELECT id, counterparty, purpose, category_id, category_source, rule_id
           FROM transactions WHERE category_source NOT IN ('manual', 'transfer')`,
        )
        .all() as {
        id: number;
        counterparty: string;
        purpose: string;
        category_id: number | null;
        category_source: CategorySource;
        rule_id: number | null;
      }[];

      const update = this.db.prepare(
        'UPDATE transactions SET category_id = ?, category_source = ?, rule_id = ? WHERE id = ?',
      );

      let count = 0;
      for (const row of rows) {
        const a = match(row);
        if (
          a.categoryId === row.category_id &&
          a.source === row.category_source &&
          a.ruleId === row.rule_id
        )
          continue;
        update.run(a.categoryId, a.source, a.ruleId, row.id);
        count++;
      }
      return count;
    });
  }

  /**
   * Erstellt eine neue Regel aus einer Buchung und einer Zielkategorie.
   * Die Regel passt auf den Empfänger (counterparty) mit contains-Match.
   */
  createRuleFromTransaction(tx: MatchInput, categoryId: number): number {
    const { lastInsertRowid } = this.db
      .prepare(
        `INSERT INTO rules (category_id, field, match_type, pattern, priority) VALUES (?, 'counterparty', 'contains', ?, 100)`,
      )
      .run(categoryId, tx.counterparty.trim().toUpperCase());
    return Number(lastInsertRowid);
  }
}
