CREATE TABLE documents (
  id          INTEGER PRIMARY KEY,
  type        TEXT NOT NULL CHECK (type IN ('buy', 'sell', 'dividend', 'statement')),
  file_name   TEXT NOT NULL,
  sha256      TEXT NOT NULL UNIQUE,
  doc_date    TEXT NOT NULL,
  reference   TEXT,
  -- Inhaltlicher Schlüssel: erkennt dasselbe Dokument auch bei abweichender Datei
  content_key TEXT NOT NULL UNIQUE,
  source      TEXT NOT NULL CHECK (source IN ('upload', 'inbox')),
  summary     TEXT NOT NULL,
  imported_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE securities (
  isin         TEXT PRIMARY KEY,
  wkn          TEXT,
  name         TEXT NOT NULL,
  price_entity TEXT
);

CREATE TABLE transactions (
  id          INTEGER PRIMARY KEY,
  document_id INTEGER REFERENCES documents (id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('buy', 'sell', 'dividend', 'opening')),
  date        TEXT NOT NULL,
  isin        TEXT NOT NULL REFERENCES securities (isin),
  quantity    REAL NOT NULL,
  price       REAL NOT NULL,
  gross_cents INTEGER NOT NULL,
  fee_cents   INTEGER NOT NULL,
  tax_cents   INTEGER NOT NULL,
  total_cents INTEGER NOT NULL
);
CREATE INDEX transactions_date ON transactions (date);
CREATE INDEX transactions_isin ON transactions (isin);

-- Bestände laut Depotauszug (zur Kontrolle und als Kursquelle)
CREATE TABLE statement_positions (
  document_id INTEGER NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
  date        TEXT NOT NULL,
  isin        TEXT NOT NULL REFERENCES securities (isin),
  quantity    REAL NOT NULL,
  PRIMARY KEY (document_id, isin)
);

CREATE TABLE prices (
  isin        TEXT NOT NULL REFERENCES securities (isin),
  date        TEXT NOT NULL,
  price       REAL NOT NULL,
  source      TEXT NOT NULL CHECK (source IN ('document', 'manual', 'ha')),
  document_id INTEGER REFERENCES documents (id) ON DELETE CASCADE,
  PRIMARY KEY (isin, date, source)
);

CREATE TABLE import_failures (
  id         INTEGER PRIMARY KEY,
  file_name  TEXT NOT NULL,
  reason     TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
