import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { nowIso } from './utils.js'
import type { Db } from './db.js'

const FALLBACK_MIGRATIONS: Array<{ id: string; sql: string }> = [
  {
    id: '0001_init.sql',
    sql: `CREATE TABLE IF NOT EXISTS schema_migrations (
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

CREATE INDEX IF NOT EXISTS idx_gallery_business_created ON business_gallery_photo(business_id, created_at);`,
  },
  {
    id: '0002_audits.sql',
    sql: `CREATE TABLE IF NOT EXISTS site_audit (
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
CREATE UNIQUE INDEX IF NOT EXISTS uq_site_audit_token_hash ON site_audit(public_token_hash);`,
  },
  {
    id: '0003_site_audit_token.sql',
    sql: `ALTER TABLE site_audit ADD COLUMN public_token_set_at TEXT;

UPDATE site_audit
SET public_token_set_at = COALESCE(public_token_set_at, created_at)
WHERE public_token_set_at IS NULL;`,
  },
]

async function ensureBusinessUserEmail(db: Db) {
  if (db.driver === 'sqlite') {
    const cols = await db.all<{ name: string }>('PRAGMA table_info(business_user)')
    const has = cols.some((c) => c.name === 'email')
    if (!has) await db.exec('ALTER TABLE business_user ADD COLUMN email TEXT')
    await db.exec('CREATE UNIQUE INDEX IF NOT EXISTS uq_business_user_email ON business_user(business_id, email)')
  } else {
    await db.exec('ALTER TABLE business_user ADD COLUMN IF NOT EXISTS email TEXT')
    await db.exec('CREATE UNIQUE INDEX IF NOT EXISTS uq_business_user_email ON business_user(business_id, email)')
  }
}

async function ensureBusinessUserLockout(db: Db) {
  if (db.driver === 'sqlite') {
    const cols = await db.all<{ name: string }>('PRAGMA table_info(business_user)')
    const names = new Set(cols.map((c) => c.name))
    if (!names.has('failed_attempts')) await db.exec('ALTER TABLE business_user ADD COLUMN failed_attempts INTEGER')
    if (!names.has('last_failed_at')) await db.exec('ALTER TABLE business_user ADD COLUMN last_failed_at TEXT')
    if (!names.has('locked_until')) await db.exec('ALTER TABLE business_user ADD COLUMN locked_until TEXT')
  } else {
    await db.exec('ALTER TABLE business_user ADD COLUMN IF NOT EXISTS failed_attempts INTEGER')
    await db.exec('ALTER TABLE business_user ADD COLUMN IF NOT EXISTS last_failed_at TEXT')
    await db.exec('ALTER TABLE business_user ADD COLUMN IF NOT EXISTS locked_until TEXT')
  }
}

async function ensurePasswordReset(db: Db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS password_reset_token (
      token_id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_prt_business_user ON password_reset_token(business_id, user_id);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_prt_hash ON password_reset_token(token_hash);
  `)
}

async function ensureAuditLog(db: Db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      audit_id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      actor_user_id TEXT,
      actor_role TEXT,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      data_json TEXT,
      ip TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_audit_business_created ON audit_log(business_id, created_at);
  `)
}

async function ensureMfaSms(db: Db) {
  if (db.driver === 'sqlite') {
    const cols = await db.all<{ name: string }>('PRAGMA table_info(business_user)')
    const names = new Set(cols.map((c) => c.name))
    if (!names.has('mfa_enabled')) await db.exec('ALTER TABLE business_user ADD COLUMN mfa_enabled INTEGER')
    if (!names.has('mfa_phone_e164')) await db.exec('ALTER TABLE business_user ADD COLUMN mfa_phone_e164 TEXT')
  } else {
    await db.exec('ALTER TABLE business_user ADD COLUMN IF NOT EXISTS mfa_enabled INTEGER')
    await db.exec('ALTER TABLE business_user ADD COLUMN IF NOT EXISTS mfa_phone_e164 TEXT')
  }

  await db.exec(`
    CREATE TABLE IF NOT EXISTS mfa_challenge (
      challenge_id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      sent_at TEXT,
      resend_count INTEGER NOT NULL DEFAULT 0,
      consumed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_mfa_business_user ON mfa_challenge(business_id, user_id);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_mfa_code_hash ON mfa_challenge(code_hash);
  `)

  if (db.driver === 'sqlite') {
    const cols = await db.all<{ name: string }>('PRAGMA table_info(mfa_challenge)')
    const names = new Set(cols.map((c) => c.name))
    if (!names.has('sent_at')) await db.exec('ALTER TABLE mfa_challenge ADD COLUMN sent_at TEXT')
    if (!names.has('resend_count')) await db.exec('ALTER TABLE mfa_challenge ADD COLUMN resend_count INTEGER')
  } else {
    await db.exec('ALTER TABLE mfa_challenge ADD COLUMN IF NOT EXISTS sent_at TEXT')
    await db.exec('ALTER TABLE mfa_challenge ADD COLUMN IF NOT EXISTS resend_count INTEGER')
  }
}

async function ensureMfaResend(db: Db) {
  if (db.driver === 'sqlite') {
    const cols = await db.all<{ name: string }>('PRAGMA table_info(mfa_challenge)')
    const names = new Set(cols.map((c) => c.name))
    if (!names.has('sent_at')) await db.exec('ALTER TABLE mfa_challenge ADD COLUMN sent_at TEXT')
    if (!names.has('resend_count')) await db.exec('ALTER TABLE mfa_challenge ADD COLUMN resend_count INTEGER')
  } else {
    await db.exec('ALTER TABLE mfa_challenge ADD COLUMN IF NOT EXISTS sent_at TEXT')
    await db.exec('ALTER TABLE mfa_challenge ADD COLUMN IF NOT EXISTS resend_count INTEGER')
  }
}

async function ensureAssetStorageKey(db: Db) {
  if (db.driver === 'sqlite') {
    const cols = await db.all<{ name: string }>('PRAGMA table_info(asset)')
    const has = cols.some((c) => c.name === 'storage_key')
    if (!has) await db.exec('ALTER TABLE asset ADD COLUMN storage_key TEXT')
  } else {
    await db.exec('ALTER TABLE asset ADD COLUMN IF NOT EXISTS storage_key TEXT')
  }
}

async function ensureLeadAdvanced(db: Db) {
  if (db.driver === 'sqlite') {
    const cols = await db.all<{ name: string }>('PRAGMA table_info(lead)')
    const names = new Set(cols.map((c) => c.name))
    if (!names.has('stage')) await db.exec('ALTER TABLE lead ADD COLUMN stage TEXT')
    if (!names.has('assignee_user_id')) await db.exec('ALTER TABLE lead ADD COLUMN assignee_user_id TEXT')
    if (!names.has('notes')) await db.exec('ALTER TABLE lead ADD COLUMN notes TEXT')
    if (!names.has('sms_opt_in')) await db.exec('ALTER TABLE lead ADD COLUMN sms_opt_in INTEGER')
    if (!names.has('sms_opt_out_at')) await db.exec('ALTER TABLE lead ADD COLUMN sms_opt_out_at TEXT')
    if (!names.has('whatsapp_opt_in')) await db.exec('ALTER TABLE lead ADD COLUMN whatsapp_opt_in INTEGER')
    if (!names.has('email_opt_in')) await db.exec('ALTER TABLE lead ADD COLUMN email_opt_in INTEGER')
    if (!names.has('consent_json')) await db.exec('ALTER TABLE lead ADD COLUMN consent_json TEXT')
    if (!names.has('last_inbound_at')) await db.exec('ALTER TABLE lead ADD COLUMN last_inbound_at TEXT')
  } else {
    await db.exec('ALTER TABLE lead ADD COLUMN IF NOT EXISTS stage TEXT')
    await db.exec('ALTER TABLE lead ADD COLUMN IF NOT EXISTS assignee_user_id TEXT')
    await db.exec('ALTER TABLE lead ADD COLUMN IF NOT EXISTS notes TEXT')
    await db.exec('ALTER TABLE lead ADD COLUMN IF NOT EXISTS sms_opt_in INTEGER')
    await db.exec('ALTER TABLE lead ADD COLUMN IF NOT EXISTS sms_opt_out_at TEXT')
    await db.exec('ALTER TABLE lead ADD COLUMN IF NOT EXISTS whatsapp_opt_in INTEGER')
    await db.exec('ALTER TABLE lead ADD COLUMN IF NOT EXISTS email_opt_in INTEGER')
    await db.exec('ALTER TABLE lead ADD COLUMN IF NOT EXISTS consent_json TEXT')
    await db.exec('ALTER TABLE lead ADD COLUMN IF NOT EXISTS last_inbound_at TEXT')
  }

  await db.exec('CREATE INDEX IF NOT EXISTS idx_lead_business_stage ON lead(business_id, stage)')
  await db.exec('CREATE INDEX IF NOT EXISTS idx_lead_business_assignee ON lead(business_id, assignee_user_id)')
}

async function ensureLeadTask(db: Db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS lead_task (
      task_id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      lead_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      run_at TEXT NOT NULL,
      payload_json TEXT,
      status TEXT NOT NULL,
      last_error TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_task_business_run ON lead_task(business_id, run_at);
    CREATE INDEX IF NOT EXISTS idx_task_status_run ON lead_task(status, run_at);
    CREATE INDEX IF NOT EXISTS idx_task_lead ON lead_task(lead_id);
  `)
}

async function ensureAppointment(db: Db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS appointment (
      appointment_id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      lead_id TEXT NOT NULL,
      start_at TEXT NOT NULL,
      end_at TEXT NOT NULL,
      status TEXT NOT NULL,
      location TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_appt_business_start ON appointment(business_id, start_at);
    CREATE INDEX IF NOT EXISTS idx_appt_lead ON appointment(lead_id);
  `)
}

export async function runMigrations(db: Db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `)

  const baseDir = path.dirname(fileURLToPath(import.meta.url))
  const dir = path.join(baseDir, 'migrations')
  const canReadDir = fs.existsSync(dir)
  const files = canReadDir ? fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort() : []

  const migrations =
    files.length > 0
      ? files.map((file) => ({ id: file, sql: fs.readFileSync(path.join(dir, file), 'utf8') }))
      : FALLBACK_MIGRATIONS

  for (const m of migrations) {
    const existing = await db.get<{ id: string }>('SELECT id FROM schema_migrations WHERE id = ?', [m.id])
    if (existing) continue
    await db.exec(m.sql)
    await db.run('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)', [m.id, nowIso()])
  }

  const id = '0002_auth_email_reset'
  const existing = await db.get<{ id: string }>('SELECT id FROM schema_migrations WHERE id = ?', [id])
  if (!existing) {
    await ensureBusinessUserEmail(db)
    await ensurePasswordReset(db)
    await db.run('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)', [id, nowIso()])
  }

  const id2 = '0003_auth_lockout'
  const existing2 = await db.get<{ id: string }>('SELECT id FROM schema_migrations WHERE id = ?', [id2])
  if (!existing2) {
    await ensureBusinessUserLockout(db)
    await db.run('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)', [id2, nowIso()])
  }

  const id3 = '0004_audit_log'
  const existing3 = await db.get<{ id: string }>('SELECT id FROM schema_migrations WHERE id = ?', [id3])
  if (!existing3) {
    await ensureAuditLog(db)
    await db.run('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)', [id3, nowIso()])
  }

  const id4 = '0005_mfa_sms'
  const existing4 = await db.get<{ id: string }>('SELECT id FROM schema_migrations WHERE id = ?', [id4])
  if (!existing4) {
    await ensureMfaSms(db)
    await db.run('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)', [id4, nowIso()])
  }

  const id5 = '0006_asset_storage_key'
  const existing5 = await db.get<{ id: string }>('SELECT id FROM schema_migrations WHERE id = ?', [id5])
  if (!existing5) {
    await ensureAssetStorageKey(db)
    await db.run('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)', [id5, nowIso()])
  }

  const id6 = '0007_mfa_resend'
  const existing6 = await db.get<{ id: string }>('SELECT id FROM schema_migrations WHERE id = ?', [id6])
  if (!existing6) {
    await ensureMfaResend(db)
    await db.run('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)', [id6, nowIso()])
  }

  const id7 = '0008_lead_advanced'
  const existing7 = await db.get<{ id: string }>('SELECT id FROM schema_migrations WHERE id = ?', [id7])
  if (!existing7) {
    await ensureLeadAdvanced(db)
    await db.run('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)', [id7, nowIso()])
  }

  const id8 = '0009_lead_task'
  const existing8 = await db.get<{ id: string }>('SELECT id FROM schema_migrations WHERE id = ?', [id8])
  if (!existing8) {
    await ensureLeadTask(db)
    await db.run('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)', [id8, nowIso()])
  }

  const id9 = '0010_appointment'
  const existing9 = await db.get<{ id: string }>('SELECT id FROM schema_migrations WHERE id = ?', [id9])
  if (!existing9) {
    await ensureAppointment(db)
    await db.run('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)', [id9, nowIso()])
  }
}
