CREATE TABLE IF NOT EXISTS lead_site_state (
  lead_id TEXT PRIMARY KEY,
  site_status TEXT NOT NULL,
  site_started_at TEXT,
  site_delivered_at TEXT,
  updated_by_user_id TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lead_site_state_status ON lead_site_state(site_status, updated_at);

CREATE TABLE IF NOT EXISTS lead_portal_access (
  portal_id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  lead_id TEXT NOT NULL,
  portal_token_hash TEXT NOT NULL,
  portal_token_set_at TEXT NOT NULL,
  preview_token_hash TEXT NOT NULL,
  preview_token_set_at TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  pin_set_at TEXT NOT NULL,
  preview_enabled INTEGER NOT NULL DEFAULT 0,
  preview_enabled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_lead_portal_access_lead ON lead_portal_access(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_portal_access_business ON lead_portal_access(business_id);

CREATE TABLE IF NOT EXISTS lead_revenue_entry (
  entry_id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  lead_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  invoiced_at TEXT NOT NULL,
  description TEXT,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lead_revenue_business_invoiced ON lead_revenue_entry(business_id, invoiced_at);
CREATE INDEX IF NOT EXISTS idx_lead_revenue_lead_invoiced ON lead_revenue_entry(lead_id, invoiced_at);

