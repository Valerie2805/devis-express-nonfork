CREATE TABLE IF NOT EXISTS lead_portal_message (
  message_id TEXT PRIMARY KEY,
  portal_id TEXT NOT NULL,
  direction TEXT NOT NULL,
  author_label TEXT,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lead_portal_message_portal_created ON lead_portal_message(portal_id, created_at);

CREATE TABLE IF NOT EXISTS lead_portal_checklist (
  portal_id TEXT NOT NULL,
  item_key TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (portal_id, item_key)
);

