ALTER TABLE site_audit ADD COLUMN archived_at TEXT;

CREATE INDEX IF NOT EXISTS idx_site_audit_business_archived ON site_audit(business_id, archived_at);
