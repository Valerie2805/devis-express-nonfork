import type { Request, Response } from 'express'
import { getDb } from '../../db.js'
import { defaultGalleryUrlsForTrade, humanizeTradeId, isTextToImageUrl, loadSpecs, tradeLabelFromId } from '../../specs.js'
import { computeScore } from '../../scoring.js'
import { isPhoneValid, newId, normalizePhone, nowIso, safeJsonParse } from '../../utils.js'
import { distanceKm, getCoordsForCity, getCoordsForPostalCode } from '../../geo.js'
import { getFileStorageProvider } from '../../providers/fileStorageProvider.js'
import { uploadSingle } from '../../providers/uploadMiddleware.js'
import { applyAutomationsOnLeadCreate } from '../../automation.js'
import { createRouter } from '../router.js'

const router = createRouter()

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
  for (const [k, v] of Object.entries(override)) {
    out[k] = deepMerge(base?.[k], v)
  }
  return out
}

function parseCookies(raw: string | undefined | null) {
  const out: Record<string, string> = {}
  const s = String(raw || '')
  if (!s) return out
  for (const part of s.split(';')) {
    const idx = part.indexOf('=')
    if (idx <= 0) continue
    const k = part.slice(0, idx).trim()
    const v = part.slice(idx + 1).trim()
    if (!k) continue
    try {
      out[k] = decodeURIComponent(v)
    } catch {
      out[k] = v
    }
  }
  return out
}

function safeParseJson(s: string) {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

type AbVariant = 'A' | 'B'
type ExperimentKey = 'hero' | 'services' | 'zones' | 'tarifs' | 'quote_form'

function getExperimentDef(cfg: any, key: ExperimentKey) {
  const raw = (cfg?.settings?.ab_tests?.experiments || {}) as any
  const d = raw?.[key] && typeof raw[key] === 'object' ? raw[key] : {}
  const version = Number.isFinite(Number(d.version)) ? Number(d.version) : 1
  const id = typeof d.id === 'string' && d.id.trim() ? d.id.trim() : `${key}_v${version}`
  const allocationA = Number(d?.allocation?.A)
  const allocation = {
    A: Number.isFinite(allocationA) && allocationA >= 0 && allocationA <= 1 ? allocationA : 0.5,
    B: 1 - (Number.isFinite(allocationA) && allocationA >= 0 && allocationA <= 1 ? allocationA : 0.5),
  }
  const forced = d.forced_variant === 'A' || d.forced_variant === 'B' ? (d.forced_variant as AbVariant) : null
  const enabled = d.enabled === false ? false : true
  return { key, id, version, allocation, forced_variant: forced, enabled }
}

function sampleVariant(allocation: { A: number; B: number }): AbVariant {
  const r = Math.random()
  return r < allocation.A ? 'A' : 'B'
}

function pickExperiments(req: Request, res: Response, cfg: any) {
  const cookies = parseCookies(req.headers.cookie)
  const raw = cookies.mad_ab
  const saved = raw ? safeParseJson(raw) : null
  const state: Record<string, { id: string; variant: AbVariant }> = saved && typeof saved === 'object' ? saved : {}

  const keys: ExperimentKey[] = ['hero', 'services', 'zones', 'tarifs', 'quote_form']
  const out: Record<string, { id: string; variant: AbVariant; version: number }> = {}

  for (const key of keys) {
    const def = getExperimentDef(cfg, key)
    const legacyHeroForced = key === 'hero' && (cfg?.settings?.ab_tests?.hero_variant === 'A' || cfg?.settings?.ab_tests?.hero_variant === 'B') ? cfg.settings.ab_tests.hero_variant : null
    const forced = (legacyHeroForced || def.forced_variant) as AbVariant | null
    if (!def.enabled) continue

    const qLegacyHero = key === 'hero' ? String((req.query as any)?.hero || '') : ''
    const q = String((req.query as any)?.[`ab_${key}`] || '')
    const override = (qLegacyHero === 'A' || qLegacyHero === 'B' ? qLegacyHero : q === 'A' || q === 'B' ? q : null) as AbVariant | null

    if (forced) {
      out[key] = { id: def.id, variant: forced, version: def.version }
      continue
    }
    if (override) {
      out[key] = { id: def.id, variant: override, version: def.version }
      state[key] = { id: def.id, variant: override }
      continue
    }

    const existing = state[key]
    if (existing && existing.id === def.id && (existing.variant === 'A' || existing.variant === 'B')) {
      out[key] = { id: def.id, variant: existing.variant, version: def.version }
      continue
    }

    const v = sampleVariant(def.allocation)
    out[key] = { id: def.id, variant: v, version: def.version }
    state[key] = { id: def.id, variant: v }
  }

  res.setHeader('Set-Cookie', `mad_ab=${encodeURIComponent(JSON.stringify(state))}; Path=/; Max-Age=2592000; SameSite=Lax`)
  return out
}

router.get('/site/:businessId/config', async (req: Request, res: Response) => {
  const db = await getDb()
  const businessId = req.params.businessId
  const row = await db.get<{ config_json: string }>('SELECT config_json FROM business WHERE business_id = ?', [businessId])

  if (!row) {
    res.status(404).json({ success: false, error: 'Business not found' })
    return
  }

  const config = safeJsonParse<any>(row.config_json, {})
  const specs = loadSpecs()
  const tradeId = config.trade_id
  const tradeCopyTpl = specs.siteCopy?.trades?.[tradeId] ?? specs.siteCopy?.trades?.generic ?? null
  const tradeTarifsTpl = specs.tarifs?.trades?.[tradeId] ?? specs.tarifs?.trades?.generic ?? null
  const tarifsCommonTpl = specs.tarifs?.common ?? null
  const tradeForm = specs.formSchema?.trades?.[tradeId] ?? specs.formSchema?.trades?.generic ?? null
  const blueprintsTpl = specs.blueprints ?? null
  const tradeLabelGuess = tradeLabelFromId(tradeId) || humanizeTradeId(tradeId) || ''

  const replacements: Record<string, string> = {
    '[Entreprise]': String(config.company_name || ''),
    '[Ville]': String(config.city || ''),
    '[Zone]': String(config.zone_label || ''),
    '[Téléphone]': String(config.phone_e164 || ''),
    '[Frais de déplacement]': String(config?.pricing?.travel_fee || ''),
    '[Frais de diagnostic]': String(config?.pricing?.diagnostic_fee || ''),
    '[Métier]': tradeLabelGuess,
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
  const tradeLabel = tradeCopyMerged?.label ? String(tradeCopyMerged.label) : tradeLabelGuess
  const blueprints = blueprintsTpl
    ? renderWithPlaceholders(blueprintsTpl, {
        ...replacements,
        '[Métier]': tradeLabel,
      })
    : null

  const reviews = await db.all<{ author_name: string; rating: number; text: string; created_at: string }>(
    'SELECT author_name, rating, text, created_at FROM business_review WHERE business_id = ? ORDER BY created_at DESC LIMIT 20',
    [businessId],
  )
  const ratingCount = reviews.length
  const ratingAvg = ratingCount ? reviews.reduce((a, b) => a + Number(b.rating || 0), 0) / ratingCount : null

  const photos = await db.all<{ url: string }>(
    'SELECT url FROM business_gallery_photo WHERE business_id = ? ORDER BY created_at DESC LIMIT 20',
    [businessId],
  )
  const photosReal = (() => {
    const urls = photos.map((p) => p.url)
    const mode = config?.settings?.gallery_mode
    if (mode === 'custom') return urls
    if (!urls.length) return defaultGalleryUrlsForTrade(tradeId)
    if (urls.every((u) => isTextToImageUrl(u))) return defaultGalleryUrlsForTrade(tradeId)
    return urls
  })()

  const experiments = pickExperiments(req, res, config)

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
      ab: {
        hero_variant: experiments.hero?.variant || 'A',
        experiments,
      },
      google_reviews: {
        rating_avg: ratingAvg,
        rating_count: ratingCount,
        reviews,
      },
      photos_real: photosReal,
    },
  })
})

export function normalizeAssetKind(v: any) {
  const s = String(v || '').trim()
  if (s === 'lead_photo' || s === 'logo' || s === 'gallery_photo' || s === 'hero_image') return s
  return null
}

router.post('/site/:businessId/assets', uploadSingle('file'), async (req: Request, res: Response) => {
  const db = await getDb()
  const businessId = req.params.businessId
  const file = req.file
  if (!file) {
    res.status(400).json({ success: false, error: 'Missing file' })
    return
  }

  const kind = normalizeAssetKind((req.body as any)?.kind ?? (req.query as any)?.kind) || 'lead_photo'

  const storage = getFileStorageProvider()
  const stored = await storage.upload({
    business_id: businessId,
    kind,
    content_type: file.mimetype,
    buffer: file.buffer,
  })

  const assetId = newId()
  const now = nowIso()

  await db.run(
    `INSERT INTO asset (asset_id, business_id, kind, content_type, size_bytes, url, storage_key, sha256, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [assetId, businessId, kind, file.mimetype, stored.size_bytes, stored.url, stored.key, null, now],
  )

  res.status(201).json({ asset_id: assetId, url: stored.url })
})

function normalizeUrgency(v: any) {
  const s = String(v || '').trim().toLowerCase()
  if (s === 'plan') return 'week'
  if (s === 'now' || s === 'today' || s === 'week') return s
  return null
}

function normalizeChannelPreference(v: any) {
  const s = String(v || '').trim().toLowerCase()
  if (s === 'call' || s === 'whatsapp' || s === 'sms') return s
  return null
}

async function computeInZone(zones: any, postalCode: string, businessCity: string) {
  const zoneList: string[] = Array.isArray(zones?.zone_list) ? zones.zone_list : []
  const excluded: string[] = Array.isArray(zones?.excluded_zones) ? zones.excluded_zones : []
  if (excluded.includes(postalCode)) return false
  const mode = String(zones?.mode || 'list')
  if (mode === 'list') return zoneList.includes(postalCode)
  if (mode === 'radius') {
    const radius = Number(zones?.radius_km)
    if (!Number.isFinite(radius) || radius <= 0) return true
    const [a, b] = await Promise.all([getCoordsForCity(businessCity), getCoordsForPostalCode(postalCode)])
    if (!a || !b) return true
    return distanceKm(a, b) <= radius
  }
  return zoneList.includes(postalCode)
}

export async function submitLeadHandler(req: Request, res: Response) {
  const db = await getDb()
  const specs = loadSpecs()
  const businessId = req.params.businessId
  const businessRow = await db.get<{ config_json: string }>('SELECT config_json FROM business WHERE business_id = ?', [businessId])

  if (!businessRow) {
    res.status(404).json({ success: false, error: 'Business not found' })
    return
  }

  const config = safeJsonParse<any>(businessRow.config_json, {})
  const body = (req.body || {}) as any

  const tradeId = String(body.trade_id || '').trim()
  const requestType = String(body.request_type || '').trim()
  const urgency = normalizeUrgency(body.urgency)
  const channelPreference = normalizeChannelPreference(body.channel_preference)
  const firstName = String(body.first_name || '').trim()
  const city = String(body.city || '').trim()
  const postalCode = String(body.postal_code || '').trim()

  if (!tradeId || !requestType || !urgency || !channelPreference || !firstName || !city || !postalCode) {
    res.status(400).json({ success: false, error: 'Invalid payload' })
    return
  }

  if (!/^\d{5}$/.test(postalCode)) {
    res.status(400).json({ success: false, error: 'Invalid payload' })
    return
  }

  const phoneE164 = normalizePhone(String(body.phone || ''))
  const phoneValid = isPhoneValid(phoneE164)
  if (!phoneE164 || !phoneValid) {
    res.status(400).json({ success: false, error: 'Invalid payload' })
    return
  }

  const inZone = await computeInZone(config?.zones, postalCode, String(config?.city || ''))

  const leadId = newId()
  const now = nowIso()

  const answers = body.answers && typeof body.answers === 'object' ? body.answers : {}
  const photos = Array.isArray(body.photos) ? body.photos : []
  const photosCount = typeof body.photos_count === 'number' ? body.photos_count : photos.length
  const consent = body.consent && typeof body.consent === 'object' ? body.consent : {}
  const smsOptIn = consent.sms === true
  const whatsappOptIn = consent.whatsapp === true
  const emailOptIn = consent.email === true
  const pipelineStages = Array.isArray(config?.settings?.pipeline_stages) ? config.settings.pipeline_stages : []
  const stage =
    config?.settings?.pipeline_default_stage ? String(config.settings.pipeline_default_stage) : pipelineStages[0]?.id ? String(pipelineStages[0].id) : null

  const scoring = computeScore(specs.scoring, {
    trade_id: tradeId,
    request_type: requestType,
    in_zone: inZone,
    phone_valid: phoneValid,
    urgency,
    channel_preference: channelPreference,
    description: body.description || null,
    address: body.address || null,
    photos_count: photosCount,
    slot_preference: body.slot_preference || null,
    answers,
  })

  const status =
    scoring.decision === 'qualified'
      ? 'qualified'
      : scoring.decision === 'needs_followup'
        ? 'needs_followup'
        : 'lost'

  await db.run(
    `INSERT INTO lead (
      lead_id, business_id, trade_id, request_type, urgency, channel_preference,
      first_name, phone_e164, email, city, postal_code, address, description,
      photos_json, photos_count, slot_preference, answers_json,
      in_zone, phone_valid, score, decision, tags_json, status,
      stage, assignee_user_id, sms_opt_in, sms_opt_out_at, whatsapp_opt_in, email_opt_in, consent_json, last_inbound_at,
      created_at, updated_at, attribution_json
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?
    )`,
    [
      leadId,
      businessId,
      tradeId,
      requestType,
      urgency,
      channelPreference,
      firstName,
      phoneE164,
      body.email ? String(body.email) : null,
      city,
      postalCode,
      body.address ? String(body.address) : null,
      body.description ? String(body.description) : null,
      JSON.stringify(photos),
      photosCount,
      body.slot_preference ? String(body.slot_preference) : null,
      JSON.stringify(answers),
      inZone ? 1 : 0,
      phoneValid ? 1 : 0,
      scoring.score,
      scoring.decision,
      JSON.stringify(scoring.tags),
      status,
      stage,
      null,
      smsOptIn ? 1 : 0,
      null,
      whatsappOptIn ? 1 : 0,
      emailOptIn ? 1 : 0,
      JSON.stringify({ sms: smsOptIn, whatsapp: whatsappOptIn, email: emailOptIn, captured_at: now }),
      null,
      now,
      now,
      JSON.stringify(body.attribution || {}),
    ],
  )

  await applyAutomationsOnLeadCreate(db, businessId, leadId, config)

  res.status(201).json({
    lead_id: leadId,
    status,
    decision: scoring.decision,
    tags: scoring.tags,
  })
}

router.post('/site/:businessId/leads', submitLeadHandler)

export default router
