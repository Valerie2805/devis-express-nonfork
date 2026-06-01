CREATE TABLE IF NOT EXISTS prospect (
  prospect_id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  place_id TEXT,
  name TEXT NOT NULL,
  trade_id TEXT,
  phone TEXT,
  website TEXT,
  emails_json TEXT,
  address TEXT,
  city TEXT,
  lat REAL,
  lng REAL,
  rating REAL,
  reviews_count INTEGER,
  status TEXT NOT NULL,
  tags_json TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_prospect_place_id ON prospect(place_id);
CREATE INDEX IF NOT EXISTS idx_prospect_status_updated ON prospect(status, updated_at);

CREATE TABLE IF NOT EXISTS prospect_message (
  message_id TEXT PRIMARY KEY,
  prospect_id TEXT NOT NULL,
  direction TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_message_id TEXT,
  from_email TEXT,
  to_email TEXT,
  subject TEXT,
  text TEXT,
  html TEXT,
  headers_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pmsg_prospect_created ON prospect_message(prospect_id, created_at);

CREATE TABLE IF NOT EXISTS prospect_sequence (
  sequence_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  steps_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS prospect_task (
  task_id TEXT PRIMARY KEY,
  prospect_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  run_at TEXT NOT NULL,
  payload_json TEXT,
  status TEXT NOT NULL,
  last_error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ptask_status_run ON prospect_task(status, run_at);
CREATE INDEX IF NOT EXISTS idx_ptask_prospect_run ON prospect_task(prospect_id, run_at);

