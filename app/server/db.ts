import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import bcrypt from 'bcryptjs'
import Database from 'better-sqlite3'
import pg from 'pg'
import { newId, nowIso } from './utils.js'
import { buildDefaultAutomationConfig } from './automation.js'
import { runMigrations } from './migrate.js'
import { ensureInternalAdmin } from './internal/ensureAdmin.js'

const { Pool } = pg

type Driver = 'sqlite' | 'postgres'

export type Db = {
  get<T>(sql: string, params?: any[]): Promise<T | null>
  all<T>(sql: string, params?: any[]): Promise<T[]>
  run(sql: string, params?: any[]): Promise<void>
  exec(sql: string): Promise<void>
  driver: Driver
}

let db: Db | null = null
let seeded = false
let initPromise: Promise<void> | null = null

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function shouldSeed() {
  return String(process.env.SEED_DEMO || '').toLowerCase() !== 'false'
}

function toPgPlaceholders(sql: string) {
  let i = 0
  return sql.replace(/\?/g, () => `$${++i}`)
}

async function seed(database: Db) {
  if (seeded) return
  if (!shouldSeed()) {
    seeded = true
    return
  }

  const now = nowIso()
  const businessId = 'demo-business'
  const hasBusiness = await database.get<{ business_id: string }>('SELECT business_id FROM business WHERE business_id = ?', [businessId])

  if (!hasBusiness) {
    const config = {
      trade_id: 'plombier_chauffagiste',
      company_name: 'Plomberie Demo',
      phone_e164: '+33123456789',
      whatsapp_e164: '+33123456789',
      email_notifications: null,
      city: 'Paris',
      zone_label: 'Paris et proches alentours',
      zones: { mode: 'list', zone_list: ['75001', '75002', '75003'], excluded_zones: [] },
      services: { top_services: ['Fuite', 'Débouchage', 'Chauffe-eau'], all_services: [] },
      pricing: { travel_fee: 'à partir de 49€', diagnostic_fee: 'à partir de 79€' },
      availability: { mode: 'manual', next_slot_text: 'demain 14h' },
      branding: { primary_color: '#0f766e', tone: 'pro' },
      settings: { response_sla_minutes: 10, templates_enabled: true, tracking_enabled: true, ...buildDefaultAutomationConfig() },
    }

    await database.run(
      `INSERT INTO business (
        business_id, trade_id, company_name, phone_e164, whatsapp_e164, email_notifications,
        city, zone_label, config_json, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?
      )`,
      [
        businessId,
        config.trade_id,
        config.company_name,
        config.phone_e164,
        config.whatsapp_e164,
        config.email_notifications,
        config.city,
        config.zone_label,
        JSON.stringify(config),
        now,
        now,
      ],
    )
  }

  const passwordHash = bcrypt.hashSync('demo', 10)
  const hasUser = await database.get<{ user_id: string }>('SELECT user_id FROM business_user WHERE business_id = ? AND username = ?', [
    businessId,
    'owner',
  ])

  if (!hasUser) {
    await database.run(
      `INSERT INTO business_user (
        user_id, business_id, username, email, password_hash, role, created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?
      )`,
      ['demo-owner', businessId, 'owner', 'owner@demo.local', passwordHash, 'owner', now],
    )
  } else {
    await database.run('UPDATE business_user SET email = ?, password_hash = ?, role = ? WHERE business_id = ? AND username = ?', [
      'owner@demo.local',
      passwordHash,
      'owner',
      businessId,
      'owner',
    ])
  }

  await database.run(
    'UPDATE business_user SET mfa_enabled = ?, mfa_phone_e164 = ?, failed_attempts = ?, last_failed_at = ?, locked_until = ? WHERE business_id = ? AND username = ?',
    [0, null, 0, null, null, businessId, 'owner'],
  )

  const hasStaff = await database.get<{ user_id: string }>('SELECT user_id FROM business_user WHERE business_id = ? AND username = ?', [
    businessId,
    'emilie',
  ])

  if (!hasStaff) {
    await database.run(
      `INSERT INTO business_user (
        user_id, business_id, username, email, password_hash, role, created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?
      )`,
      ['demo-staff', businessId, 'emilie', 'emilie@demo.local', passwordHash, 'staff', now],
    )
  } else {
    await database.run('UPDATE business_user SET email = ?, password_hash = ?, role = ? WHERE business_id = ? AND username = ?', [
      'emilie@demo.local',
      passwordHash,
      'staff',
      businessId,
      'emilie',
    ])
  }

  await database.run(
    'UPDATE business_user SET mfa_enabled = ?, mfa_phone_e164 = ?, failed_attempts = ?, last_failed_at = ?, locked_until = ? WHERE business_id = ? AND username = ?',
    [0, null, 0, null, null, businessId, 'emilie'],
  )

  const hasReview = await database.get<{ review_id: string }>('SELECT review_id FROM business_review WHERE business_id = ? LIMIT 1', [businessId])
  if (!hasReview) {
    await database.run(
      `INSERT INTO business_review (review_id, business_id, author_name, rating, text, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ['rev-1', businessId, 'Sophie D.', 5, 'Réponse très rapide, intervention propre et tarif annoncé avant. Je recommande.', now],
    )
    await database.run(
      `INSERT INTO business_review (review_id, business_id, author_name, rating, text, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ['rev-2', businessId, 'Karim L.', 5, 'Débouchage fait dans la journée. Explications claires, pas de surprise.', now],
    )
    await database.run(
      `INSERT INTO business_review (review_id, business_id, author_name, rating, text, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ['rev-3', businessId, 'Camille R.', 4, 'Bon contact et créneau respecté. Très pro.', now],
    )
  }

  const hasPhoto = await database.get<{ photo_id: string }>('SELECT photo_id FROM business_gallery_photo WHERE business_id = ? LIMIT 1', [businessId])
  if (!hasPhoto) {
    await database.run(
      `INSERT INTO business_gallery_photo (photo_id, business_id, url, created_at)
       VALUES (?, ?, ?, ?)`,
      [
        'ph-1',
        businessId,
        'https://coreva-normal.trae.ai/api/ide/v1/text_to_image?prompt=realistic%20photo%2C%20French%20plumber%20fixing%20sink%20pipes%20under%20kitchen%20counter%2C%20tools%20visible%2C%20clean%20modern%20apartment%2C%20natural%20light%2C%20documentary%20style%2C%2035mm%2C%20high%20detail&image_size=landscape_4_3',
        now,
      ],
    )
    await database.run(
      `INSERT INTO business_gallery_photo (photo_id, business_id, url, created_at)
       VALUES (?, ?, ?, ?)`,
      [
        'ph-2',
        businessId,
        'https://coreva-normal.trae.ai/api/ide/v1/text_to_image?prompt=realistic%20photo%2C%20plumber%20unclogging%20bathroom%20drain%2C%20protective%20gloves%2C%20clean%20tiles%2C%20professional%20equipment%2C%20documentary%20style%2C%2035mm%2C%20high%20detail&image_size=landscape_4_3',
        now,
      ],
    )
    await database.run(
      `INSERT INTO business_gallery_photo (photo_id, business_id, url, created_at)
       VALUES (?, ?, ?, ?)`,
      [
        'ph-3',
        businessId,
        'https://coreva-normal.trae.ai/api/ide/v1/text_to_image?prompt=realistic%20photo%2C%20plumber%20checking%20water%20heater%20in%20utility%20room%2C%20labels%20and%20pipes%2C%20clean%20installation%2C%20natural%20light%2C%20documentary%20style%2C%2035mm&image_size=landscape_4_3',
        now,
      ],
    )
    await database.run(
      `INSERT INTO business_gallery_photo (photo_id, business_id, url, created_at)
       VALUES (?, ?, ?, ?)`,
      [
        'ph-4',
        businessId,
        'https://coreva-normal.trae.ai/api/ide/v1/text_to_image?prompt=realistic%20photo%2C%20close-up%20of%20professional%20plumbing%20tools%20arranged%20on%20clean%20work%20mat%2C%20wrench%2C%20pipe%20cutter%2C%20tape%2C%20neutral%20background%2C%20product%20photo%20style&image_size=landscape_4_3',
        now,
      ],
    )
    await database.run(
      `INSERT INTO business_gallery_photo (photo_id, business_id, url, created_at)
       VALUES (?, ?, ?, ?)`,
      [
        'ph-5',
        businessId,
        'https://coreva-normal.trae.ai/api/ide/v1/text_to_image?prompt=realistic%20photo%2C%20plumber%20in%20work%20uniform%20arriving%20at%20apartment%20door%2C%20tool%20bag%2C%20friendly%20professional%20look%2C%20Paris%20building%20hallway%2C%20documentary%20style&image_size=landscape_4_3',
        now,
      ],
    )
    await database.run(
      `INSERT INTO business_gallery_photo (photo_id, business_id, url, created_at)
       VALUES (?, ?, ?, ?)`,
      [
        'ph-6',
        businessId,
        'https://coreva-normal.trae.ai/api/ide/v1/text_to_image?prompt=realistic%20photo%2C%20clean%20fixed%20under-sink%20plumbing%20installation%2C%20no%20leaks%2C%20shiny%20pipes%2C%20tidy%20cabinet%2C%20after%20repair%2C%20documentary%20style&image_size=landscape_4_3',
        now,
      ],
    )
  }
  seeded = true
}

function createSqliteDb(): Db {
  const baseDir = path.dirname(fileURLToPath(import.meta.url))
  const dataDir = path.join(baseDir, 'data')
  const fromEnv = String(process.env.SQLITE_PATH || '').trim()
  const dbPath = fromEnv ? (path.isAbsolute(fromEnv) ? fromEnv : path.join(process.cwd(), fromEnv)) : path.join(dataDir, 'devisexpress.sqlite')
  ensureDir(path.dirname(dbPath))
  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')

  return {
    driver: 'sqlite',
    async get<T>(sql: string, params: any[] = []) {
      const row = sqlite.prepare(sql).get(...params) as T | undefined
      return row ?? null
    },
    async all<T>(sql: string, params: any[] = []) {
      return sqlite.prepare(sql).all(...params) as T[]
    },
    async run(sql: string, params: any[] = []) {
      sqlite.prepare(sql).run(...params)
    },
    async exec(sql: string) {
      sqlite.exec(sql)
    },
  }
}

function createPostgresDb(): Db {
  const connectionString = process.env.DATABASE_URL || ''
  if (!connectionString) {
    throw new Error('Missing DATABASE_URL')
  }

  const g = globalThis as any
  const pool: pg.Pool =
    g.__mad_pg_pool ||
    new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 5,
    })
  g.__mad_pg_pool = pool

  async function execRaw(sql: string) {
    const parts = String(sql)
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean)
    for (const part of parts) {
      await pool.query(part)
    }
  }

  return {
    driver: 'postgres',
    async get<T>(sql: string, params: any[] = []) {
      const res = await pool.query(toPgPlaceholders(sql), params)
      return (res.rows[0] as T | undefined) ?? null
    },
    async all<T>(sql: string, params: any[] = []) {
      const res = await pool.query(toPgPlaceholders(sql), params)
      return res.rows as T[]
    },
    async run(sql: string, params: any[] = []) {
      await pool.query(toPgPlaceholders(sql), params)
    },
    async exec(sql: string) {
      await execRaw(sql)
    },
  }
}

export async function getDb() {
  if (!db) {
    const driver = (process.env.DB_DRIVER || 'sqlite') as Driver
    if (driver === 'sqlite' && String(process.env.VERCEL || '').trim()) {
      throw new Error('DB_DRIVER=postgres requis sur Vercel (filesystem en lecture seule)')
    }
    db = driver === 'postgres' ? createPostgresDb() : createSqliteDb()
  }
  if (!initPromise) {
    initPromise = (async () => {
      await runMigrations(db!)
      await ensureInternalAdmin(db! as any)
      await seed(db!)
    })()
  }
  await initPromise
  return db
}
