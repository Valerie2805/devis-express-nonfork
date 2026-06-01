CREATE TABLE IF NOT EXISTS lead_commission_rate (
  business_id TEXT NOT NULL,
  lead_id TEXT NOT NULL,
  rate_pct REAL NOT NULL,
  updated_by_user_id TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (business_id, lead_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_commission_rate_business_updated ON lead_commission_rate(business_id, updated_at);

