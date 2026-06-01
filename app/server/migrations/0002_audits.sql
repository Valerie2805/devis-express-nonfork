CREATE TABLE IF NOT EXISTS site_audit (
  audit_id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
  status TEXT NOT NULL,
  error TEXT,
  public_token_hash TEXT NOT NULL,
  audit_json TEXT,
  html_path TEXT,
  docx_path TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_site_audit_business_created ON site_audit(business_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_site_audit_token_hash ON site_audit(public_token_hash);

