-- Schema-Version 3 (PRAGMA user_version), ohne Migrationen: wird nur bei neuer Datenbank angelegt. Beträge in Integer-Cent, Daten als ISO-Text.

CREATE TABLE categories (
  id         INTEGER PRIMARY KEY,
  name       TEXT    NOT NULL UNIQUE COLLATE NOCASE CHECK (length(trim(name)) > 0),
  color      TEXT    NOT NULL DEFAULT '#9e9e9e'
                     CHECK (color GLOB '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'),
  kind       TEXT    NOT NULL CHECK (kind IN ('expense', 'income', 'transfer')),
  sort       INTEGER NOT NULL DEFAULT 0,
  -- Fallback-Kategorie "Sonstiges": genau eine, nicht löschbar
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1))
);
CREATE UNIQUE INDEX categories_single_default ON categories (is_default) WHERE is_default = 1;

CREATE TABLE rules (
  id          INTEGER PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES categories (id) ON DELETE CASCADE,
  field       TEXT    NOT NULL DEFAULT 'any' CHECK (field IN ('counterparty', 'purpose', 'any')),
  match_type  TEXT    NOT NULL DEFAULT 'contains' CHECK (match_type IN ('contains', 'regex')),
  pattern     TEXT    NOT NULL CHECK (length(pattern) > 0),
  -- kleinere Zahl = höhere Priorität
  priority    INTEGER NOT NULL DEFAULT 100
);
CREATE INDEX rules_by_priority ON rules (priority, id);
CREATE INDEX rules_by_category ON rules (category_id);

-- Ein Konto je IBAN; wird beim ersten Import eines Auszugs automatisch angelegt.
CREATE TABLE accounts (
  id                 INTEGER PRIMARY KEY,
  iban               TEXT    NOT NULL UNIQUE,
  bank               TEXT    NOT NULL,
  name               TEXT    NOT NULL CHECK (length(trim(name)) > 0),
  color              TEXT    NOT NULL DEFAULT '#2196f3'
                             CHECK (color GLOB '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'),
  sort               INTEGER NOT NULL DEFAULT 0,
  -- 0 = nur sichtbar, wenn das Konto ausdrücklich ausgewählt ist (nicht unter "Alle Konten")
  include_in_reports INTEGER NOT NULL DEFAULT 1 CHECK (include_in_reports IN (0, 1))
);

CREATE TABLE statements (
  id            INTEGER PRIMARY KEY,
  account_id    INTEGER NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  year          INTEGER NOT NULL CHECK (year BETWEEN 1990 AND 2200),
  month         INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  opening_cents INTEGER NOT NULL,
  closing_cents INTEGER NOT NULL,
  file_hash     TEXT    NOT NULL UNIQUE,
  file_name     TEXT    NOT NULL,
  imported_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (account_id, year, month)
);

CREATE TABLE transactions (
  id              INTEGER PRIMARY KEY,
  statement_id    INTEGER NOT NULL REFERENCES statements (id) ON DELETE CASCADE,
  booking_date    TEXT    NOT NULL CHECK (booking_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  value_date      TEXT    NOT NULL CHECK (value_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  type            TEXT    NOT NULL DEFAULT '',
  counterparty    TEXT    NOT NULL DEFAULT '',
  purpose         TEXT    NOT NULL DEFAULT '',
  amount_cents    INTEGER NOT NULL,
  category_id     INTEGER REFERENCES categories (id) ON DELETE SET NULL,
  -- transfer = automatisch als Umbuchung zwischen eigenen Konten erkannt
  category_source TEXT    NOT NULL DEFAULT 'default'
                          CHECK (category_source IN ('rule', 'manual', 'default', 'transfer')),
  rule_id         INTEGER REFERENCES rules (id) ON DELETE SET NULL
);
CREATE INDEX transactions_by_statement ON transactions (statement_id);
CREATE INDEX transactions_by_date ON transactions (booking_date);
CREATE INDEX transactions_by_category ON transactions (category_id);

-- Die Fallback-Kategorie darf nicht gelöscht werden.
CREATE TRIGGER categories_protect_default
BEFORE DELETE ON categories
WHEN OLD.is_default = 1
BEGIN
  SELECT RAISE(ABORT, 'Die Standardkategorie kann nicht gelöscht werden');
END;

-- Buchungen einer gelöschten Kategorie fallen auf die Standardkategorie zurück.
CREATE TRIGGER categories_reassign_on_delete
BEFORE DELETE ON categories
WHEN OLD.is_default = 0
BEGIN
  UPDATE transactions
     SET category_id     = (SELECT id FROM categories WHERE is_default = 1),
         category_source = 'default',
         rule_id         = NULL
   WHERE category_id = OLD.id;
END;
