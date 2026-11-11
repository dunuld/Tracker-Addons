-- Zeiterfassung – Schema v1. Alle Daten gehören genau einem Home-Assistant-Benutzer.

CREATE TABLE app_user (
  id                  TEXT PRIMARY KEY,               -- HA-Benutzer-ID (Ingress-Header)
  display_name        TEXT NOT NULL,
  region              TEXT NOT NULL,                  -- Bundesland, z. B. 'BY'
  tracking_start      TEXT NOT NULL,                  -- ab hier zählt der Saldo
  opening_balance_min INTEGER NOT NULL DEFAULT 0,
  auto_break          INTEGER NOT NULL DEFAULT 1,
  default_location    TEXT NOT NULL DEFAULT 'office' CHECK (default_location IN ('home', 'office')),
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Arbeitszeitmodell, gültig ab einem Datum
CREATE TABLE work_schedule (
  id             INTEGER PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  valid_from     TEXT NOT NULL,
  weekly_minutes INTEGER NOT NULL CHECK (weekly_minutes BETWEEN 0 AND 7 * 24 * 60),
  workdays       TEXT NOT NULL,                        -- 'mon,tue,wed,thu,fri'
  UNIQUE (user_id, valid_from)
);

CREATE TABLE work_day (
  user_id  TEXT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  date     TEXT NOT NULL,
  day_type TEXT CHECK (day_type IN ('work', 'vacation', 'sick', 'holiday', 'flex')), -- NULL = automatisch
  location TEXT CHECK (location IN ('home', 'office')),
  note     TEXT,
  PRIMARY KEY (user_id, date)
);

CREATE TABLE time_stamp (
  id         INTEGER PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  date       TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time   TEXT                                       -- NULL = eingestempelt
);
CREATE INDEX idx_time_stamp_user_date ON time_stamp (user_id, date);
-- Pro Benutzer höchstens ein offener Stempel
CREATE UNIQUE INDEX idx_time_stamp_open ON time_stamp (user_id) WHERE end_time IS NULL;

CREATE TABLE project (
  id      INTEGER PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  code    TEXT,
  name    TEXT NOT NULL,
  active  INTEGER NOT NULL DEFAULT 1,
  UNIQUE (user_id, code)
);

CREATE TABLE work_package (
  id              INTEGER PRIMARY KEY,
  project_id      INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  code            TEXT,
  name            TEXT NOT NULL,
  active          INTEGER NOT NULL DEFAULT 1,
  budget_quarters INTEGER CHECK (budget_quarters IS NULL OR budget_quarters > 0),
  UNIQUE (project_id, code)
);

CREATE TABLE booking (
  id              INTEGER PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  date            TEXT NOT NULL,
  work_package_id INTEGER NOT NULL REFERENCES work_package(id),
  quarters        INTEGER NOT NULL CHECK (quarters > 0), -- 1 = 0,25 h
  comment         TEXT,
  UNIQUE (user_id, date, work_package_id)
);
CREATE INDEX idx_booking_user_date ON booking (user_id, date);
CREATE INDEX idx_booking_package ON booking (work_package_id);
