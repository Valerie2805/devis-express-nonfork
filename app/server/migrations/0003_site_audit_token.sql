ALTER TABLE site_audit ADD COLUMN public_token_set_at TEXT;

UPDATE site_audit
SET public_token_set_at = COALESCE(public_token_set_at, created_at)
WHERE public_token_set_at IS NULL;

