CREATE TABLE IF NOT EXISTS prospect_review (
  review_id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  prospect_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_review_id TEXT,
  author_name TEXT,
  rating REAL,
  text TEXT,
  created_at TEXT NOT NULL,
  raw_json TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_prospect_review_provider ON prospect_review(business_id, provider, provider_review_id);
CREATE INDEX IF NOT EXISTS idx_prospect_review_business_prospect_created ON prospect_review(business_id, prospect_id, created_at);
