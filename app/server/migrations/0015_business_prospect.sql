CREATE TABLE IF NOT EXISTS business_prospect (
  business_id TEXT NOT NULL,
  prospect_id TEXT NOT NULL,
  source TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (business_id, prospect_id)
);

CREATE INDEX IF NOT EXISTS idx_business_prospect_business_created ON business_prospect(business_id, created_at);

