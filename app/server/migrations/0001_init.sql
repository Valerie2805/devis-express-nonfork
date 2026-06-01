CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS business (
  business_id TEXT PRIMARY KEY,
  trade_id TEXT NOT NULL,
  company_name TEXT NOT NULL,
  phone_e164 TEXT NOT NULL,
  whatsapp_e164 TEXT,
  email_notifications TEXT,
  city TEXT NOT NULL,
  zone_label TEXT NOT NULL,
  config_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lead (
  lead_id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  trade_id TEXT NOT NULL,
  request_type TEXT NOT NULL,
  urgency TEXT NOT NULL,
  channel_preference TEXT NOT NULL,
  first_name TEXT NOT NULL,
  phone_e164 TEXT NOT NULL,
  email TEXT,
  city TEXT NOT NULL,
  postal_code TEXT NOT NULL,
  address TEXT,
  description TEXT,
  photos_json TEXT,
  photos_count INTEGER NOT NULL DEFAULT 0,
  slot_preference TEXT,
  answers_json TEXT,
  in_zone INTEGER NOT NULL,
  phone_valid INTEGER NOT NULL,
  score REAL NOT NULL,
  decision TEXT NOT NULL,
  tags_json TEXT NOT NULL,
  status TEXT NOT NULL,
  first_human_response_at TEXT,
  appointment_json TEXT,
  outcome_json TEXT,
  attribution_json TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lead_business_created ON lead(business_id, created_at);
CREATE INDEX IF NOT EXISTS idx_lead_business_status ON lead(business_id, status);

CREATE TABLE IF NOT EXISTS message_log (
  message_id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  lead_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  template_id TEXT NOT NULL,
  rendered_text TEXT NOT NULL,
  provider_message_id TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_msg_lead_created ON message_log(lead_id, created_at);

CREATE TABLE IF NOT EXISTS asset (
  asset_id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  url TEXT NOT NULL,
  storage_key TEXT,
  sha256 TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_asset_business_kind ON asset(business_id, kind);

CREATE TABLE IF NOT EXISTS analytics_event (
  event_id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  trade_id TEXT NOT NULL,
  name TEXT NOT NULL,
  page_type TEXT NOT NULL,
  page_path TEXT NOT NULL,
  properties_json TEXT,
  utm_json TEXT,
  referrer TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_event_business_created ON analytics_event(business_id, created_at);
CREATE INDEX IF NOT EXISTS idx_event_business_name ON analytics_event(business_id, name);

CREATE TABLE IF NOT EXISTS business_user (
  user_id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  username TEXT NOT NULL,
  email TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_business_user ON business_user(business_id, username);
CREATE UNIQUE INDEX IF NOT EXISTS uq_business_user_email ON business_user(business_id, email);
CREATE INDEX IF NOT EXISTS idx_business_user_business ON business_user(business_id);

CREATE TABLE IF NOT EXISTS business_review (
  review_id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  rating INTEGER NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_review_business_created ON business_review(business_id, created_at);

CREATE TABLE IF NOT EXISTS business_gallery_photo (
  photo_id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  url TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_gallery_business_created ON business_gallery_photo(business_id, created_at);
