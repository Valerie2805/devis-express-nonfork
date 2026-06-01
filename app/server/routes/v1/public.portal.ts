import type { Request, Response } from 'express'
import crypto from 'crypto'
import { getDb } from '../../db.js'
import { loadSpecs } from '../../specs.js'
import { newId, nowIso, safeJsonParse } from '../../utils.js'
import { createRouter } from '../router.js'
import jwt from 'jsonwebtoken'

const router = createRouter()

function sha256(s: string) {
  return crypto.createHash('sha256').update(s).digest('hex')
}

function tokenOk(storedHash: string, provided: string) {
  const computed = sha256(provided)
  try {
    return crypto.timingSafeEqual(Buffer.from(storedHash, 'hex'), Buffer.from(computed, 'hex'))
  } catch {
    return false
  }
}

function sessionSecret() {
  return process.env.JWT_SECRET || 'dev-secret'
}

function portalEncKey() {
  return crypto.createHash('sha256').update(sessionSecret()).digest()
}

function decryptPortalSecret(enc: string) {
  const s = String(enc || '').trim()
  const parts = s.split('.')
  if (parts.length !== 3) return null
  try {
    const iv = Buffer.from(parts[0], 'base64')
    const tag = Buffer.from(parts[1], 'base64')
    const data = Buffer.from(parts[2], 'base64')
    const decipher = crypto.createDecipheriv('aes-256-gcm', portalEncKey(), iv)
    decipher.setAuthTag(tag)
    const out = Buffer.concat([decipher.update(data), decipher.final()])
    return out.toString('utf8')
  } catch {
    return null
  }
}

function signSession(portalId: string) {
  return jwt.sign({ portal_id: portalId }, sessionSecret(), { expiresIn: '2h', audience: 'portal' })
}

function verifySession(token: string) {
  try {
    return jwt.verify(token, sessionSecret(), { audience: 'portal' }) as any
  } catch {
    return null
  }
}

function renderWithPlaceholders(value: any, replacements: Record<string, string>): any {
  if (typeof value === 'string') {
    let out = value
    for (const [k, v] of Object.entries(replacements)) out = out.split(k).join(v)
    return out
  }
  if (Array.isArray(value)) return value.map((v) => renderWithPlaceholders(v, replacements))
  if (!value || typeof value !== 'object') return value
  const out: any = {}
  for (const [k, v] of Object.entries(value)) out[k] = renderWithPlaceholders(v, replacements)
  return out
}

function deepMerge(base: any, override: any): any {
  if (override === null || override === undefined) return base
  if (Array.isArray(override)) return override
  if (typeof override !== 'object' || typeof base !== 'object' || base === null || Array.isArray(base)) return override
  const out: any = { ...base }
  for (const [k, v] of Object.entries(override)) out[k] = deepMerge(base?.[k], v)
  return out
}

router.get('/public/portal/:portalId', async (req: Request, res: Response) => {
  const portalId = String(req.params.portalId || '').trim()
  const token = String((req.query as any).t || '').trim()
  if (!portalId || !token) {
    res.status(404).json({ success: false, error: 'Not found' })
    return
  }

  const db = await getDb()
  const row = await db.get<any>('SELECT portal_id, portal_token_hash, preview_enabled FROM lead_portal_access WHERE portal_id = ?', [portalId])
  if (!row) {
    res.status(404).json({ success: false, error: 'Not found' })
    return
  }

  if (!tokenOk(String(row.portal_token_hash || ''), token)) {
    res.status(404).json({ success: false, error: 'Not found' })
    return
  }

  res.status(200).json({ portal_id: portalId, preview_enabled: Boolean(row.preview_enabled) })
})

router.post('/public/portal/:portalId/unlock', async (req: Request, res: Response) => {
  const portalId = String(req.params.portalId || '').trim()
  const token = String((req.query as any).t || '').trim()
  const pin = String((req.body as any)?.pin || '').trim()
  if (!portalId || !token || !pin) {
    res.status(404).json({ success: false, error: 'Not found' })
    return
  }

  const db = await getDb()
  const row = await db.get<any>('SELECT portal_id, portal_token_hash, pin_hash, preview_enabled FROM lead_portal_access WHERE portal_id = ?', [portalId])
  if (!row) {
    res.status(404).json({ success: false, error: 'Not found' })
    return
  }

  if (!tokenOk(String(row.portal_token_hash || ''), token)) {
    res.status(404).json({ success: false, error: 'Not found' })
    return
  }

  if (!tokenOk(String(row.pin_hash || ''), pin)) {
    res.status(401).json({ success: false, error: 'Invalid PIN' })
    return
  }

  res.status(200).json({ session_token: signSession(portalId), preview_enabled: Boolean(row.preview_enabled) })
})

router.get('/public/portal/:portalId/home', async (req: Request, res: Response) => {
  const portalId = String(req.params.portalId || '').trim()
  const token = String((req.query as any).t || '').trim()
  const session = String((req.query as any).s || '').trim()
  if (!portalId || !token || !session) {
    res.status(404).json({ success: false, error: 'Not found' })
    return
  }

  const payload = verifySession(session)
  if (!payload || String(payload.portal_id || '') !== portalId) {
    res.status(401).json({ success: false, error: 'Unauthorized' })
    return
  }

  const db = await getDb()
  const row = await db.get<any>(
    'SELECT portal_id, business_id, lead_id, portal_token_hash, preview_enabled, preview_token_enc FROM lead_portal_access WHERE portal_id = ?',
    [portalId],
  )
  if (!row) {
    res.status(404).json({ success: false, error: 'Not found' })
    return
  }
  if (!tokenOk(String(row.portal_token_hash || ''), token)) {
    res.status(404).json({ success: false, error: 'Not found' })
    return
  }

  const site = await db.get<any>('SELECT site_status, site_started_at, site_delivered_at FROM lead_site_state WHERE lead_id = ?', [String(row.lead_id)])
  const checklistRows = await db.all<any>(
    'SELECT item_key, done, updated_at FROM lead_portal_checklist WHERE portal_id = ? ORDER BY item_key ASC',
    [portalId],
  )
  const messages = await db.all<any>(
    'SELECT direction, author_label, text, created_at FROM lead_portal_message WHERE portal_id = ? ORDER BY created_at ASC LIMIT 200',
    [portalId],
  )

  const previewEnabled = Boolean(row.preview_enabled)
  const previewToken = previewEnabled && row.preview_token_enc ? decryptPortalSecret(String(row.preview_token_enc)) : null

  res.status(200).json({
    portal_id: portalId,
    business_id: String(row.business_id),
    lead_id: String(row.lead_id),
    site: site || { site_status: 'todo', site_started_at: null, site_delivered_at: null },
    preview_enabled: previewEnabled,
    preview_token: previewToken,
    checklist: Array.isArray(checklistRows) ? checklistRows : [],
    messages: Array.isArray(messages) ? messages : [],
  })
})

router.post('/public/portal/:portalId/messages', async (req: Request, res: Response) => {
  const portalId = String(req.params.portalId || '').trim()
  const token = String((req.query as any).t || '').trim()
  const session = String((req.query as any).s || '').trim()
  const text = String((req.body as any)?.text || '').trim()
  if (!portalId || !token || !session || !text) {
    res.status(400).json({ success: false, error: 'Invalid payload' })
    return
  }

  const payload = verifySession(session)
  if (!payload || String(payload.portal_id || '') !== portalId) {
    res.status(401).json({ success: false, error: 'Unauthorized' })
    return
  }

  const db = await getDb()
  const row = await db.get<any>('SELECT portal_id, portal_token_hash FROM lead_portal_access WHERE portal_id = ?', [portalId])
  if (!row || !tokenOk(String(row.portal_token_hash || ''), token)) {
    res.status(404).json({ success: false, error: 'Not found' })
    return
  }

  const now = nowIso()
  await db.run(
    'INSERT INTO lead_portal_message (message_id, portal_id, direction, author_label, text, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [newId(), portalId, 'client', 'Client', text, now],
  )
  res.status(200).json({ success: true, created_at: now })
})

router.patch('/public/portal/:portalId/checklist', async (req: Request, res: Response) => {
  const portalId = String(req.params.portalId || '').trim()
  const token = String((req.query as any).t || '').trim()
  const session = String((req.query as any).s || '').trim()
  const itemKey = String((req.body as any)?.item_key || '').trim()
  const done = Boolean((req.body as any)?.done) ? 1 : 0
  if (!portalId || !token || !session || !itemKey) {
    res.status(400).json({ success: false, error: 'Invalid payload' })
    return
  }

  const payload = verifySession(session)
  if (!payload || String(payload.portal_id || '') !== portalId) {
    res.status(401).json({ success: false, error: 'Unauthorized' })
    return
  }

  const db = await getDb()
  const row = await db.get<any>('SELECT portal_id, portal_token_hash FROM lead_portal_access WHERE portal_id = ?', [portalId])
  if (!row || !tokenOk(String(row.portal_token_hash || ''), token)) {
    res.status(404).json({ success: false, error: 'Not found' })
    return
  }

  const now = nowIso()
  await db.run(
    `INSERT INTO lead_portal_checklist (portal_id, item_key, done, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(portal_id, item_key) DO UPDATE SET done = excluded.done, updated_at = excluded.updated_at`,
    [portalId, itemKey, done, now],
  )

  res.status(200).json({ success: true, item_key: itemKey, done: Boolean(done), updated_at: now })
})

router.get('/public/portal/:portalId/preview', async (req: Request, res: Response) => {
  const portalId = String(req.params.portalId || '').trim()
  const token = String((req.query as any).t || '').trim()
  const session = String((req.query as any).s || '').trim()
  if (!portalId || !token || !session) {
    res.status(404).json({ success: false, error: 'Not found' })
    return
  }

  const payload = verifySession(session)
  if (!payload || String(payload.portal_id || '') !== portalId) {
    res.status(401).json({ success: false, error: 'Unauthorized' })
    return
  }

  const db = await getDb()
  const row = await db.get<any>('SELECT portal_id, business_id, preview_token_hash, preview_enabled FROM lead_portal_access WHERE portal_id = ?', [portalId])
  if (!row) {
    res.status(404).json({ success: false, error: 'Not found' })
    return
  }

  if (!Boolean(row.preview_enabled)) {
    res.status(409).json({ success: false, error: 'Not ready' })
    return
  }

  if (!tokenOk(String(row.preview_token_hash || ''), token)) {
    res.status(404).json({ success: false, error: 'Not found' })
    return
  }

  res.status(200).json({ success: true, business_id: String(row.business_id) })
})

router.get('/public/portal/:portalId/site_config', async (req: Request, res: Response) => {
  const portalId = String(req.params.portalId || '').trim()
  const token = String((req.query as any).t || '').trim()
  const session = String((req.query as any).s || '').trim()
  if (!portalId || !token || !session) {
    res.status(404).json({ success: false, error: 'Not found' })
    return
  }

  const payload = verifySession(session)
  if (!payload || String(payload.portal_id || '') !== portalId) {
    res.status(401).json({ success: false, error: 'Unauthorized' })
    return
  }

  const db = await getDb()
  const portalRow = await db.get<any>(
    'SELECT business_id, preview_token_hash, preview_enabled FROM lead_portal_access WHERE portal_id = ?',
    [portalId],
  )
  if (!portalRow) {
    res.status(404).json({ success: false, error: 'Not found' })
    return
  }
  if (!Boolean(portalRow.preview_enabled)) {
    res.status(409).json({ success: false, error: 'Not ready' })
    return
  }
  if (!tokenOk(String(portalRow.preview_token_hash || ''), token)) {
    res.status(404).json({ success: false, error: 'Not found' })
    return
  }

  const businessId = String(portalRow.business_id)
  const row = await db.get<{ config_json: string }>('SELECT config_json FROM business WHERE business_id = ?', [businessId])
  if (!row) {
    res.status(404).json({ success: false, error: 'Business not found' })
    return
  }

  const config = safeJsonParse<any>(row.config_json, {})
  const specs = loadSpecs()
  const tradeId = config.trade_id
  const tradeCopyTpl = specs.siteCopy?.trades?.[tradeId] ?? null
  const tradeTarifsTpl = specs.tarifs?.trades?.[tradeId] ?? null
  const tarifsCommonTpl = specs.tarifs?.common ?? null
  const tradeForm = specs.formSchema?.trades?.[tradeId] ?? null
  const blueprintsTpl = specs.blueprints ?? null

  const replacements: Record<string, string> = {
    '[Entreprise]': String(config.company_name || ''),
    '[Ville]': String(config.city || ''),
    '[Zone]': String(config.zone_label || ''),
    '[Téléphone]': String(config.phone_e164 || ''),
    '[Frais de déplacement]': String(config?.pricing?.travel_fee || ''),
    '[Frais de diagnostic]': String(config?.pricing?.diagnostic_fee || ''),
  }

  const tradeCopy = tradeCopyTpl ? renderWithPlaceholders(tradeCopyTpl, replacements) : null
  const tradeCopyOverride = config?.site_copy_override && typeof config.site_copy_override === 'object' ? config.site_copy_override : null
  const tradeCopyMerged = tradeCopy ? deepMerge(tradeCopy, tradeCopyOverride) : tradeCopyOverride

  const tradeTarifsBase = tradeTarifsTpl ? renderWithPlaceholders(tradeTarifsTpl, replacements) : null
  const tradeTarifsOverride = config?.tarifs_override && typeof config.tarifs_override === 'object' ? config.tarifs_override : null
  const tradeTarifs = tradeTarifsBase ? deepMerge(tradeTarifsBase, tradeTarifsOverride) : tradeTarifsOverride

  const tarifsCommonBase = tarifsCommonTpl ? renderWithPlaceholders(tarifsCommonTpl, replacements) : null
  const tarifsCommonOverride = config?.tarifs_common_override && typeof config.tarifs_common_override === 'object' ? config.tarifs_common_override : null
  const tarifsCommon = tarifsCommonBase ? deepMerge(tarifsCommonBase, tarifsCommonOverride) : tarifsCommonOverride

  const tradeLabel = tradeCopyMerged?.label ? String(tradeCopyMerged.label) : ''
  const blueprints = blueprintsTpl
    ? renderWithPlaceholders(blueprintsTpl, {
        ...replacements,
        '[Métier]': tradeLabel,
      })
    : null

  res.status(200).json({
    business_id: businessId,
    trade_id: tradeId,
    pages: blueprints?.pages ?? null,
    branding: config?.branding ?? null,
    pricing: config?.pricing ?? null,
    zones: config?.zones ?? null,
    availability: config?.availability ?? null,
    config,
    content: {
      site_copy: tradeCopyMerged,
      tarifs: tradeTarifs,
      tarifs_common: tarifsCommon,
      form: tradeForm,
      blueprints,
      trade_label: tradeLabel,
      ab: { hero_variant: 'A', experiments: {} },
      google_reviews: { rating_avg: null, rating_count: 0, reviews: [] },
      photos_real: [],
    },
  })
})

export default router
