import type { Request, Response } from 'express'
import { getDb } from '../../db.js'
import { requireAuth } from '../../middleware/auth.js'
import { renderTemplate } from '../../messaging.js'
import { getMessagingProvider } from '../../providers/messagingProvider.js'
import { getEmailProvider } from '../../providers/emailProvider.js'
import { getFileStorageProvider } from '../../providers/fileStorageProvider.js'
import { uploadSingle } from '../../providers/uploadMiddleware.js'
import { isPhoneValid, newId, normalizePhone, nowIso, safeJsonParse } from '../../utils.js'
import { applyAutomationsOnStageEntered } from '../../automation.js'
import { generateHeroVariantB, generateRecommendations } from '../../ai/recommendations.js'
import { generateMessageDraft } from '../../ai/messageDraft.js'
import { COMMON_TRADES, defaultGalleryUrlsForTrade, humanizeTradeId, isTextToImageUrl, loadSpecs, tradeLabelFromId } from '../../specs.js'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import ExcelJS from 'exceljs'
import { getPlaceDetails, searchPlaces } from '../../prospection/places.js'
import { enqueueSiteAudit } from '../../siteAudit/runner.js'
import fs from 'fs'
import path from 'path'
import { createRouter } from '../router.js'
import { emitLeadResponseSent, emitLeadStatusChanged } from '../../analyticsEvents.js'
import { ensureCompanyProfile, upsertCompanyProfile } from '../../company/companyProfile.js'
import { lookupEffectifsFromInsee } from '../../company/inseeSearch.js'

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
  for (const [k, v] of Object.entries(override)) out[k] = deepMerge(base?.[k], v)
  return out
}

function prospectIdFromPlaceId(placeId: string) {
  return `gp_${placeId}`
}

type DbLike = {
  get: <T = any>(sql: string, params?: any[]) => Promise<T>
  run: (sql: string, params?: any[]) => Promise<any>
}

async function sendProspectionTaskNow(db: DbLike, req: Request, businessId: string, taskId: string, channel: 'sms' | 'email') {
  const task = await db.get<any>('SELECT * FROM prospect_task WHERE business_id = ? AND task_id = ?', [businessId, taskId])
  if (!task) {
    const err: any = new Error('Task not found')
    err.statusCode = 404
    throw err
  }
  if (String(task.status || '') === 'canceled') {
    const err: any = new Error('Task canceled')
    err.statusCode = 409
    throw err
  }

  const now = nowIso()
  const prospect = await db.get<any>('SELECT prospect_id, phone, emails_json FROM prospect WHERE prospect_id = ?', [String(task.prospect_id)])
  if (!prospect) {
    const err: any = new Error('Prospect not found')
    err.statusCode = 404
    throw err
  }

  const payload = task?.payload_json ? safeJsonParse<any>(String(task.payload_json), {}) : {}
  const templates = payload?.templates || {}

  try {
    if (channel === 'sms') {
      const text = String(templates?.sms?.text || '').trim()
      const rawPhone = String(prospect?.phone || '').trim()
      const to = normalizePhone(rawPhone)
      if (!text || !to || !isPhoneValid(to)) {
        const err: any = new Error('Missing SMS text or phone')
        err.statusCode = 400
        throw err
      }
      const messaging = getMessagingProvider()
      const r = await messaging.send({ channel: 'sms', to, text })
      await db.run(
        `INSERT INTO prospect_message (
          message_id, business_id, prospect_id, direction, provider, provider_message_id, from_email, to_email, subject, text, html, headers_json,
          channel, to_phone, task_id, created_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?
        )`,
        [
          newId(),
          businessId,
          String(task.prospect_id),
          'outbound',
          process.env.MESSAGE_PROVIDER || 'messaging',
          r?.provider_message_id || null,
          null,
          null,
          null,
          text,
          null,
          null,
          'sms',
          to,
          taskId,
          now,
        ],
      )
      await db.run(
        'UPDATE prospect_task SET status = ?, approved_channel = ?, approved_at = ?, sent_at = ?, last_error = ?, attempts = ?, updated_at = ? WHERE business_id = ? AND task_id = ?',
        ['sent', 'sms', now, now, null, Number(task.attempts || 0), now, businessId, taskId],
      )
      await addAudit(db, req, businessId, { action: 'prospection.task.send', target_type: 'prospect_task', target_id: taskId, data: { channel: 'sms' } })
      return { status: 'sent' as const }
    }

    const email = templates?.email || {}
    const subject = String(email?.subject || 'Message').trim()
    const text = String(email?.text || '').trim()
    const explicitTo = email?.to ? String(email.to).trim() : ''
    const emails = safeJsonParse<string[]>(String(prospect?.emails_json || '[]'), [])
    const toEmail = explicitTo || (Array.isArray(emails) && emails.length ? String(emails[0]).trim() : '')
    if (!toEmail || !text) {
      const err: any = new Error('Missing email recipient or text')
      err.statusCode = 400
      throw err
    }
    const emailProvider = getEmailProvider()
    await emailProvider.send({ to: toEmail, subject, text })
    await db.run(
      `INSERT INTO prospect_message (
        message_id, business_id, prospect_id, direction, provider, provider_message_id, from_email, to_email, subject, text, html, headers_json,
        channel, to_phone, task_id, created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?
      )`,
      [newId(), businessId, String(task.prospect_id), 'outbound', 'email', null, null, toEmail, subject, text, null, null, 'email', null, taskId, now],
    )
    await db.run(
      'UPDATE prospect_task SET status = ?, approved_channel = ?, approved_at = ?, sent_at = ?, last_error = ?, attempts = ?, updated_at = ? WHERE business_id = ? AND task_id = ?',
      ['sent', 'email', now, now, null, Number(task.attempts || 0), now, businessId, taskId],
    )
    await addAudit(db, req, businessId, { action: 'prospection.task.send', target_type: 'prospect_task', target_id: taskId, data: { channel: 'email' } })
    return { status: 'sent' as const }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await db.run(
      'UPDATE prospect_task SET status = ?, approved_channel = ?, approved_at = ?, last_error = ?, attempts = ?, updated_at = ? WHERE business_id = ? AND task_id = ?',
      ['failed', channel, now, msg, Number(task.attempts || 0) + 1, now, businessId, taskId],
    )
    throw e
  }
}

function portalEncKey() {
  const raw = process.env.JWT_SECRET || 'dev-secret'
  return crypto.createHash('sha256').update(raw).digest()
}

function encryptPortalSecret(plaintext: string) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', portalEncKey(), iv)
  const enc = Buffer.concat([cipher.update(Buffer.from(plaintext, 'utf8')), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`
}

function mustAccessBusiness(req: Request, res: Response): string | null {
  const businessId = req.params.businessId
  if (!req.auth || req.auth.business_id !== businessId) {
    res.status(403).json({ success: false, error: 'Forbidden' })
    return null
  }
  return businessId
}

function mustBeOwner(req: Request, res: Response): boolean {
  if (!req.auth || req.auth.role !== 'owner') {
    res.status(403).json({ success: false, error: 'Forbidden' })
    return false
  }
  return true
}

async function mustHavePermission(req: Request, res: Response, businessId: string, perm: string): Promise<boolean> {
  if (req.auth?.role === 'owner') return true
  const db = await getDb()
  const row = await db.get<{ config_json: string }>('SELECT config_json FROM business WHERE business_id = ?', [businessId])
  const cfg = row ? safeJsonParse<any>(row.config_json, {}) : {}
  const staffPerms = cfg?.settings?.staff_permissions || {}
  if (!staffPerms || typeof staffPerms !== 'object' || !staffPerms[perm]) {
    res.status(403).json({ success: false, error: 'Forbidden' })
    return false
  }
  return true
}

async function addAudit(
  db: any,
  req: Request,
  businessId: string,
  entry: { action: string; target_type?: string | null; target_id?: string | null; data?: any },
) {
  await db.run(
    `INSERT INTO audit_log (
      audit_id, business_id, actor_user_id, actor_role, action, target_type, target_id, data_json, ip, user_agent, created_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )`,
    [
      newId(),
      businessId,
      req.auth?.user_id || null,
      req.auth?.role || null,
      entry.action,
      entry.target_type || null,
      entry.target_id || null,
      entry.data ? JSON.stringify(entry.data) : null,
      req.ip || null,
      String(req.header('user-agent') || '') || null,
      nowIso(),
    ],
  )
}

function monthKey(iso: string | null) {
  if (!iso) return null
  const s = String(iso)
  const mk = s.slice(0, 7)
  return /^\d{4}-\d{2}$/.test(mk) ? mk : null
}

router.get('/backoffice/:businessId/me', requireAuth, (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return
  res.status(200).json({ business_id: businessId, role: req.auth?.role || 'staff', user_id: req.auth?.user_id || null })
})

router.post('/backoffice/:businessId/me/password', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return
  const userId = String(req.auth?.user_id || '').trim()
  const oldPassword = String((req.body as any)?.old_password || '')
  const newPassword = String((req.body as any)?.new_password || '')
  if (!userId || newPassword.length < 8) {
    res.status(400).json({ success: false, error: 'Invalid payload' })
    return
  }

  const db = await getDb()
  const user = await db.get<{ user_id: string; password_hash: string }>('SELECT user_id, password_hash FROM business_user WHERE business_id = ? AND user_id = ?', [
    businessId,
    userId,
  ])
  if (!user) {
    res.status(401).json({ success: false, error: 'Unauthorized' })
    return
  }

  const ok = bcrypt.compareSync(oldPassword, user.password_hash)
  if (!ok) {
    res.status(401).json({ success: false, error: 'Invalid credentials' })
    return
  }

  const hash = bcrypt.hashSync(newPassword, 10)
  await db.run(
    'UPDATE business_user SET password_hash = ?, failed_attempts = ?, last_failed_at = ?, locked_until = ? WHERE business_id = ? AND user_id = ?',
    [hash, 0, null, null, businessId, userId],
  )

  await addAudit(db, req, businessId, { action: 'user.password.change', target_type: 'business_user', target_id: userId })

  res.status(204).end()
})

router.get('/backoffice/:businessId/commissions', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return
  if (!(await mustHavePermission(req, res, businessId, 'commissions_read'))) return

  const from = String((req.query as any).from || '').trim()
  const to = String((req.query as any).to || '').trim()

  const db = await getDb()
  const businessRow = await db.get<{ config_json: string }>('SELECT config_json FROM business WHERE business_id = ?', [businessId])
  const cfg = businessRow ? safeJsonParse<any>(businessRow.config_json, {}) : {}
  const defaultRate = Number(cfg?.settings?.commissions?.default_rate_pct)
  const defaultRatePct = Number.isFinite(defaultRate) ? defaultRate : 10

  const leads = await db.all<any>(
    'SELECT lead_id, first_name, city, outcome_json FROM lead WHERE business_id = ? AND status = ? ORDER BY updated_at DESC LIMIT 500',
    [businessId, 'won'],
  )
  const rates = await db.all<any>('SELECT lead_id, rate_pct FROM lead_commission_rate WHERE business_id = ?', [businessId])
  const rateByLead = new Map<string, number>()
  for (const r of rates) rateByLead.set(String(r.lead_id), Number(r.rate_pct))

  const items: any[] = []
  const totalsByMonth: Record<string, { revenue_cents: number; commission_cents: number; count: number }> = {}

  const leadIds = leads.map((l: any) => String(l.lead_id)).filter(Boolean)
  const revenueByLead = new Map<
    string,
    {
      amount_cents: number
      commission_cents: number
      months: Set<string>
      by_month: Map<string, { amount_cents: number; commission_cents: number }>
    }
  >()

  if (leadIds.length) {
    const placeholders = leadIds.map(() => '?').join(',')
    const revenueRows = await db.all<any>(
      `SELECT lead_id, amount_cents, currency, invoiced_at
       FROM lead_revenue_entry
       WHERE business_id = ? AND lead_id IN (${placeholders})`,
      [businessId, ...leadIds],
    )
    for (const r of revenueRows) {
      const leadId = String(r.lead_id || '')
      const amount = Number(r.amount_cents || 0)
      const invAt = typeof r.invoiced_at === 'string' ? String(r.invoiced_at) : null
      const mk = monthKey(invAt)
      if (!leadId || !Number.isFinite(amount) || amount <= 0 || !mk) continue
      if (from && /^\d{4}-\d{2}$/.test(from) && mk < from) continue
      if (to && /^\d{4}-\d{2}$/.test(to) && mk > to) continue

      const ratePctRaw = rateByLead.has(leadId) ? Number(rateByLead.get(leadId)) : defaultRatePct
      const ratePct = Number.isFinite(ratePctRaw) ? ratePctRaw : defaultRatePct
      const commissionCents = Math.round(amount * (ratePct / 100))

      const curr = revenueByLead.get(leadId) || { amount_cents: 0, commission_cents: 0, months: new Set<string>(), by_month: new Map() }
      curr.amount_cents += amount
      curr.commission_cents += commissionCents
      curr.months.add(mk)
      const bm = curr.by_month.get(mk) || { amount_cents: 0, commission_cents: 0 }
      bm.amount_cents += amount
      bm.commission_cents += commissionCents
      curr.by_month.set(mk, bm)
      revenueByLead.set(leadId, curr)

      if (!totalsByMonth[mk]) totalsByMonth[mk] = { revenue_cents: 0, commission_cents: 0, count: 0 }
      totalsByMonth[mk].revenue_cents += amount
      totalsByMonth[mk].commission_cents += commissionCents
      totalsByMonth[mk].count += 1
    }
  }

  for (const l of leads) {
    const leadId = String(l.lead_id || '')
    if (!leadId) continue
    const ratePctRaw = rateByLead.has(leadId) ? Number(rateByLead.get(leadId)) : defaultRatePct
    const ratePct = Number.isFinite(ratePctRaw) ? ratePctRaw : defaultRatePct

    const revenue = revenueByLead.get(leadId)
    if (revenue && revenue.amount_cents > 0) {
      const months = Array.from(revenue.months).sort((a, b) => a.localeCompare(b))
      const mk = months.length === 1 ? months[0] : months.length ? months[0] : null
      items.push({
        lead_id: leadId,
        first_name: String(l.first_name || ''),
        city: String(l.city || ''),
        month: mk,
        won_at: null,
        months,
        by_month: months.map((m) => ({ month: m, ...(revenue.by_month.get(m) || { amount_cents: 0, commission_cents: 0 }) })),
        amount_cents: revenue.amount_cents,
        rate_pct: ratePct,
        commission_cents: revenue.commission_cents,
      })
      continue
    }

    const outcome = l?.outcome_json ? safeJsonParse<any>(String(l.outcome_json), null) : null
    const amount = Number(outcome?.amount_cents || 0)
    const wonAt = typeof outcome?.won_at === 'string' ? String(outcome.won_at) : null
    if (!Number.isFinite(amount) || amount <= 0 || !wonAt) continue
    const mk = monthKey(wonAt)
    if (!mk) continue
    if (from && /^\d{4}-\d{2}$/.test(from) && mk < from) continue
    if (to && /^\d{4}-\d{2}$/.test(to) && mk > to) continue

    const commissionCents = Math.round(amount * (ratePct / 100))
    items.push({
      lead_id: leadId,
      first_name: String(l.first_name || ''),
      city: String(l.city || ''),
      month: mk,
      won_at: wonAt,
      months: [mk],
      by_month: [{ month: mk, amount_cents: amount, commission_cents: commissionCents }],
      amount_cents: amount,
      rate_pct: ratePct,
      commission_cents: commissionCents,
    })
    if (!totalsByMonth[mk]) totalsByMonth[mk] = { revenue_cents: 0, commission_cents: 0, count: 0 }
    totalsByMonth[mk].revenue_cents += amount
    totalsByMonth[mk].commission_cents += commissionCents
    totalsByMonth[mk].count += 1
  }

  res.status(200).json({ items, totals_by_month: totalsByMonth, default_rate_pct: defaultRatePct })
})

router.put('/backoffice/:businessId/leads/:leadId/commission_rate', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return
  if (!(await mustHavePermission(req, res, businessId, 'commissions_write'))) return

  const leadId = String(req.params.leadId || '').trim()
  const ratePct = Number((req.body as any)?.rate_pct)
  if (!leadId || !Number.isFinite(ratePct) || ratePct < 0 || ratePct > 100) {
    res.status(400).json({ success: false, error: 'Invalid payload' })
    return
  }

  const db = await getDb()
  const lead = await db.get<any>('SELECT lead_id FROM lead WHERE business_id = ? AND lead_id = ?', [businessId, leadId])
  if (!lead) {
    res.status(404).json({ success: false, error: 'Lead not found' })
    return
  }

  const now = nowIso()
  await db.run(
    `INSERT INTO lead_commission_rate (business_id, lead_id, rate_pct, updated_by_user_id, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(business_id, lead_id) DO UPDATE SET
       rate_pct = excluded.rate_pct,
       updated_by_user_id = excluded.updated_by_user_id,
       updated_at = excluded.updated_at`,
    [businessId, leadId, ratePct, req.auth?.user_id || null, now],
  )

  await addAudit(db, req, businessId, { action: 'lead.commission_rate.update', target_type: 'lead', target_id: leadId, data: { rate_pct: ratePct } })

  res.status(200).json({ lead_id: leadId, rate_pct: ratePct, updated_at: now })
})

router.post('/backoffice/:businessId/prospection/search_places', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return
  if (!(await mustHavePermission(req, res, businessId, 'prospection_write'))) return
  const { query } = (req.body || {}) as { query?: string }
  const q = String(query || '').trim()
  if (!q) {
    res.status(400).json({ success: false, error: 'Invalid payload' })
    return
  }
  try {
    const results = await searchPlaces({ query: q })
    res.status(200).json({ results })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('GOOGLE_PLACES_API_KEY')) {
      res.status(400).json({ success: false, error: 'Google Places non configuré (GOOGLE_PLACES_API_KEY)' })
      return
    }
    res.status(502).json({ success: false, error: `Erreur Google Places: ${msg}` })
  }
})

router.post('/backoffice/:businessId/prospection/import_places', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return
  if (!(await mustHavePermission(req, res, businessId, 'prospection_write'))) return

  const { place_ids, trade_id, headcount_range, revenue_level } = (req.body || {}) as {
    place_ids?: string[]
    trade_id?: string
    headcount_range?: string
    revenue_level?: string
  }
  const ids = Array.isArray(place_ids) ? place_ids.map((s) => String(s || '').trim()).filter(Boolean) : []
  if (!ids.length) {
    res.status(400).json({ success: false, error: 'Invalid payload' })
    return
  }

  const db = await getDb()
  const now = nowIso()
  let imported = 0
  const hc = headcount_range ? String(headcount_range).trim() : ''
  const revenueLevel = revenue_level ? String(revenue_level).trim() : ''
  const revenueEur =
    revenueLevel === 'up_to_100k'
      ? 100_000
      : revenueLevel === 'up_to_1m'
        ? 1_000_000
        : revenueLevel === 'up_to_20m'
          ? 20_000_000
          : revenueLevel === 'from_50m'
            ? 50_000_000
            : null

  try {
    for (const pid of ids) {
      const d = await getPlaceDetails({ place_id: pid })
      const prospectId = prospectIdFromPlaceId(d.place_id)
      await db.run(
        `INSERT INTO prospect (
          prospect_id, source, place_id, name, trade_id, phone, website, emails_json, address, city,
          lat, lng, rating, reviews_count, status, tags_json, notes, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
        ON CONFLICT(place_id) DO UPDATE SET
          name = excluded.name,
          trade_id = excluded.trade_id,
          phone = excluded.phone,
          website = excluded.website,
          address = excluded.address,
          lat = excluded.lat,
          lng = excluded.lng,
          rating = excluded.rating,
          reviews_count = excluded.reviews_count,
          updated_at = excluded.updated_at`,
        [
          prospectId,
          'google_places',
          d.place_id,
          d.name,
          trade_id ? String(trade_id) : null,
          d.phone,
          d.website,
          '[]',
          d.address,
          '',
          d.lat,
          d.lng,
          d.rating,
          d.reviews_count,
          'new',
          '[]',
          null,
          now,
          now,
        ],
      )

      await db.run(
        `INSERT INTO business_prospect (business_id, prospect_id, source, created_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(business_id, prospect_id) DO NOTHING`,
        [businessId, prospectId, 'google_places', now],
      )

      let inferredHc = hc
      if (!inferredHc) {
        const inferred = await lookupEffectifsFromInsee({ name: d.name, address: d.address })
        if (inferred?.headcount_range) inferredHc = inferred.headcount_range
      }

      if (inferredHc || revenueEur !== null) {
        await upsertCompanyProfile(
          db,
          { prospect_id: prospectId },
          { headcount_range: inferredHc || undefined, annual_revenue_eur: revenueEur ?? undefined },
        )
      }

      if (Array.isArray((d as any).reviews) && (d as any).reviews.length) {
        for (const rv of (d as any).reviews as any[]) {
          const author = String(rv?.author_name || '').trim()
          const time = Number.isFinite(Number(rv?.time)) ? Number(rv.time) : null
          const providerReviewId = `${d.place_id}:${time || 0}:${author}`
          const createdAt = time ? new Date(time * 1000).toISOString() : now
          await db.run(
            `INSERT INTO prospect_review (
              review_id, business_id, prospect_id, provider, provider_review_id, author_name, rating, text, created_at, raw_json
            ) VALUES (
              ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            )
            ON CONFLICT (business_id, provider, provider_review_id) DO NOTHING`,
            [
              newId(),
              businessId,
              prospectId,
              'google_places',
              providerReviewId,
              author || null,
              Number.isFinite(Number(rv?.rating)) ? Number(rv.rating) : null,
              String(rv?.text || ''),
              createdAt,
              JSON.stringify(rv || {}),
            ],
          )
        }
      }

      imported++
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('GOOGLE_PLACES_API_KEY')) {
      res.status(400).json({ success: false, error: 'Google Places non configuré (GOOGLE_PLACES_API_KEY)' })
      return
    }
    res.status(502).json({ success: false, error: `Erreur Google Places: ${msg}` })
    return
  }

  res.status(200).json({ imported })
})

router.post('/backoffice/:businessId/prospection/import_reviews', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return
  if (!(await mustHavePermission(req, res, businessId, 'prospection_write'))) return

  const ids = Array.isArray((req.body as any)?.prospect_ids)
    ? (req.body as any).prospect_ids.map((s: any) => String(s || '').trim()).filter(Boolean)
    : []
  const limit = Math.max(1, Math.min(50, Number((req.body as any)?.limit || 20) || 20))

  const db = await getDb()
  const now = nowIso()

  let rows: Array<{ prospect_id: string; place_id: string | null }> = []
  if (ids.length) {
    const placeholders = ids.map(() => '?').join(',')
    rows = await db.all<any>(
      `SELECT p.prospect_id, p.place_id
       FROM business_prospect bp
       JOIN prospect p ON p.prospect_id = bp.prospect_id
       WHERE bp.business_id = ? AND p.prospect_id IN (${placeholders})
       LIMIT ?`,
      [businessId, ...ids, limit],
    )
  } else {
    rows = await db.all<any>(
      `SELECT p.prospect_id, p.place_id
       FROM business_prospect bp
       JOIN prospect p ON p.prospect_id = bp.prospect_id
       WHERE bp.business_id = ? AND p.place_id IS NOT NULL
       ORDER BY bp.created_at DESC
       LIMIT ?`,
      [businessId, limit],
    )
  }

  let processed = 0
  let inserted = 0

  for (const r of rows) {
    const placeId = String(r.place_id || '').trim()
    const prospectId = String(r.prospect_id || '').trim()
    if (!placeId || !prospectId) continue
    const d = await getPlaceDetails({ place_id: placeId })
    processed += 1
    if (!Array.isArray((d as any).reviews) || !(d as any).reviews.length) continue
    for (const rv of (d as any).reviews as any[]) {
      const author = String(rv?.author_name || '').trim()
      const time = Number.isFinite(Number(rv?.time)) ? Number(rv.time) : null
      const providerReviewId = `${d.place_id}:${time || 0}:${author}`
      const createdAt = time ? new Date(time * 1000).toISOString() : now
      await db.run(
        `INSERT INTO prospect_review (
          review_id, business_id, prospect_id, provider, provider_review_id, author_name, rating, text, created_at, raw_json
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
        ON CONFLICT (business_id, provider, provider_review_id) DO NOTHING`,
        [
          newId(),
          businessId,
          prospectId,
          'google_places',
          providerReviewId,
          author || null,
          Number.isFinite(Number(rv?.rating)) ? Number(rv.rating) : null,
          String(rv?.text || ''),
          createdAt,
          JSON.stringify(rv || {}),
        ],
      )
      inserted += 1
    }
  }

  await addAudit(db, req, businessId, { action: 'prospection.reviews.import', target_type: 'prospect', target_id: null, data: { processed, inserted } })
  res.status(200).json({ success: true, processed, inserted })
})

router.get('/backoffice/:businessId/prospection/prospects', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return
  if (!(await mustHavePermission(req, res, businessId, 'prospection_read'))) return
  const db = await getDb()

  const q = String((req.query as any).q || '').trim()
  const includeArchived = String((req.query as any).include_archived || '') === '1'
  const statusFilter = String((req.query as any).status || '').trim()
  const headcountRange = String((req.query as any).headcount_range || '').trim()
  const hasPhone = String((req.query as any).has_phone || '') === '1'
  const hasEmail = String((req.query as any).has_email || '') === '1'
  const hasWebsite = String((req.query as any).has_website || '') === '1'
  const sort = String((req.query as any).sort || '').trim() || 'imported_at'
  const scoreMinRaw = (req.query as any).score_min
  const scoreMaxRaw = (req.query as any).score_max
  const scoreMin = scoreMinRaw !== undefined && scoreMinRaw !== null && String(scoreMinRaw).trim() !== '' ? Number(scoreMinRaw) : null
  const scoreMax = scoreMaxRaw !== undefined && scoreMaxRaw !== null && String(scoreMaxRaw).trim() !== '' ? Number(scoreMaxRaw) : null
  const limit = Math.max(1, Math.min(200, Number((req.query as any).limit || 50) || 50))
  const offset = Math.max(0, Number((req.query as any).offset || 0) || 0)

  const params: any[] = [businessId]
  let where = 'bp.business_id = ?'
  if (!includeArchived) {
    where += ' AND p.status != ?'
    params.push('archived')
  }
  if (statusFilter) {
    where += ' AND p.status = ?'
    params.push(statusFilter)
  }
  if (headcountRange) {
    const map: Record<string, string[]> = {
      '1_9': ['1_9', '0_1', '2_10'],
      '10_19': ['10_19', '11_20'],
      '20_49': ['20_49', '21_49'],
      '50_99': ['50_99', '50_plus'],
      '100_plus': ['100_plus', '50_plus'],
      '0_1': ['0_1'],
      '2_10': ['2_10'],
      '11_20': ['11_20'],
      '21_49': ['21_49'],
      '50_plus': ['50_plus'],
    }
    const values = map[headcountRange] || [headcountRange]
    const placeholders = values.map(() => '?').join(',')
    where += ` AND cp.headcount_range IN (${placeholders})`
    params.push(...values)
  }
  if (hasPhone) where += " AND p.phone IS NOT NULL AND p.phone != ''"
  if (hasWebsite) where += " AND p.website IS NOT NULL AND p.website != ''"
  if (hasEmail) where += " AND p.emails_json IS NOT NULL AND p.emails_json != '[]' AND p.emails_json != ''"
  if (q) {
    where += ' AND (p.name LIKE ? OR p.city LIKE ? OR p.website LIKE ? OR p.phone LIKE ?)'
    const like = `%${q}%`
    params.push(like, like, like, like)
  }

  const scoreExpr = `
    (CASE WHEN p.phone IS NOT NULL AND p.phone != '' THEN 20 ELSE 0 END) +
    (CASE WHEN p.emails_json IS NOT NULL AND p.emails_json != '[]' AND p.emails_json != '' THEN 20 ELSE 0 END) +
    (CASE WHEN p.website IS NOT NULL AND p.website != '' THEN 10 ELSE 0 END) +
    (CASE WHEN p.rating IS NOT NULL THEN CAST(p.rating * 10 AS INTEGER) ELSE 0 END) +
    (CASE
      WHEN p.reviews_count IS NULL THEN 0
      WHEN p.reviews_count > 50 THEN 25
      ELSE CAST(p.reviews_count / 2 AS INTEGER)
    END)
  `

  if (Number.isFinite(scoreMin as any)) {
    where += ` AND (${scoreExpr}) >= ?`
    params.push(Number(scoreMin))
  }
  if (Number.isFinite(scoreMax as any)) {
    where += ` AND (${scoreExpr}) <= ?`
    params.push(Number(scoreMax))
  }

  const totalRow = await db.get<any>(
    `SELECT COUNT(*) AS c
     FROM business_prospect bp
     JOIN prospect p ON p.prospect_id = bp.prospect_id
     LEFT JOIN company_profile cp ON cp.prospect_id = p.prospect_id
     WHERE ${where}`,
    params,
  )

  const orderBy = sort === 'score' ? `score DESC, bp.created_at DESC` : `bp.created_at DESC`
  const items = await db.all<any>(
    `SELECT
      p.prospect_id, p.name, p.trade_id, p.phone, p.website, p.emails_json, p.notes, p.address, p.city, p.lat, p.lng,
      p.rating, p.reviews_count, p.status, p.updated_at,
      bp.created_at AS imported_at,
      cp.headcount_range AS headcount_range,
      (${scoreExpr}) AS score
     FROM business_prospect bp
     JOIN prospect p ON p.prospect_id = bp.prospect_id
     LEFT JOIN company_profile cp ON cp.prospect_id = p.prospect_id
     WHERE ${where}
     ORDER BY ${orderBy}
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  )

  res.status(200).json({
    items: items.map((r: any) => ({
      prospect_id: r.prospect_id,
      name: r.name,
      trade_id: r.trade_id,
      phone: r.phone,
      website: r.website,
      emails: safeJsonParse<string[]>(r.emails_json || '[]', []),
      notes: r.notes || null,
      address: r.address || null,
      city: r.city || null,
      lat: r.lat,
      lng: r.lng,
      rating: r.rating,
      reviews_count: r.reviews_count,
      status: r.status,
      updated_at: r.updated_at,
      imported_at: r.imported_at,
      headcount_range: r.headcount_range || null,
      score: Number(r.score || 0),
    })),
    total: Number(totalRow?.c || 0),
  })
})

router.patch('/backoffice/:businessId/prospection/prospects/:prospectId', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return
  if (!(await mustHavePermission(req, res, businessId, 'prospection_write'))) return
  const prospectId = String(req.params.prospectId || '').trim()
  if (!prospectId) {
    res.status(400).json({ success: false, error: 'Invalid payload' })
    return
  }
  const nextStatus = (req.body as any)?.status ? String((req.body as any).status).trim() : null
  const nextNotes = (req.body as any)?.notes !== undefined ? String((req.body as any).notes || '') : null

  const db = await getDb()
  const link = await db.get<any>('SELECT business_id FROM business_prospect WHERE business_id = ? AND prospect_id = ?', [businessId, prospectId])
  if (!link) {
    res.status(404).json({ success: false, error: 'Prospect not found' })
    return
  }

  const sets: string[] = []
  const params: any[] = []
  if (nextStatus !== null) {
    sets.push('status = ?')
    params.push(nextStatus)
  }
  if (nextNotes !== null) {
    sets.push('notes = ?')
    params.push(nextNotes)
  }
  if (!sets.length) {
    res.status(400).json({ success: false, error: 'Invalid payload' })
    return
  }
  sets.push('updated_at = ?')
  params.push(nowIso())

  await db.run(`UPDATE prospect SET ${sets.join(', ')} WHERE prospect_id = ?`, [...params, prospectId])
  await addAudit(db, req, businessId, { action: 'prospection.prospect.update', target_type: 'prospect', target_id: prospectId })
  res.status(200).json({ success: true })
})

router.post('/backoffice/:businessId/prospection/prospects/archive_bulk', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return
  if (!(await mustHavePermission(req, res, businessId, 'prospection_write'))) return

  const q = (req.body as any)?.q ? String((req.body as any).q).trim() : ''
  const limitRaw = Number((req.body as any)?.limit || 200)
  const limit = Math.max(1, Math.min(500, Number.isFinite(limitRaw) ? limitRaw : 200))

  const params: any[] = [businessId, 'archived']
  let where = 'bp.business_id = ? AND p.status != ?'
  if (q) {
    where += ' AND (p.name LIKE ? OR p.city LIKE ? OR p.website LIKE ? OR p.phone LIKE ?)'
    const like = `%${q}%`
    params.push(like, like, like, like)
  }

  const db = await getDb()
  const rows = await db.all<any>(
    `SELECT p.prospect_id
     FROM business_prospect bp
     JOIN prospect p ON p.prospect_id = bp.prospect_id
     WHERE ${where}
     ORDER BY bp.created_at DESC
     LIMIT ?`,
    [...params, limit],
  )

  const now = nowIso()
  let archived = 0
  for (const r of rows) {
    const prospectId = String(r?.prospect_id || '').trim()
    if (!prospectId) continue
    await db.run('UPDATE prospect SET status = ?, updated_at = ? WHERE prospect_id = ?', ['archived', now, prospectId])
    archived += 1
  }

  await addAudit(db, req, businessId, { action: 'prospection.prospect.archive_bulk', target_type: 'prospect', target_id: null, data: { q: q || null, limit, archived } })
  res.status(200).json({ success: true, archived })
})

router.get('/backoffice/:businessId/prospection/prospects/:prospectId/reviews', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return
  if (!(await mustHavePermission(req, res, businessId, 'prospection_read'))) return
  const prospectId = String(req.params.prospectId || '').trim()
  const limit = Math.max(1, Math.min(50, Number((req.query as any).limit || 10) || 10))
  const offset = Math.max(0, Number((req.query as any).offset || 0) || 0)
  if (!prospectId) {
    res.status(400).json({ success: false, error: 'Invalid payload' })
    return
  }

  const db = await getDb()
  const link = await db.get<any>('SELECT business_id FROM business_prospect WHERE business_id = ? AND prospect_id = ?', [businessId, prospectId])
  if (!link) {
    res.status(404).json({ success: false, error: 'Prospect not found' })
    return
  }

  const rows = await db.all<any>(
    `SELECT author_name, rating, text, created_at
     FROM prospect_review
     WHERE business_id = ? AND prospect_id = ?
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [businessId, prospectId, limit, offset],
  )
  res.status(200).json({
    items: rows.map((r) => ({
      author_name: r.author_name || null,
      rating: Number.isFinite(Number(r.rating)) ? Number(r.rating) : null,
      text: r.text || '',
      created_at: r.created_at,
    })),
  })
})

router.get('/backoffice/:businessId/prospection/prospects/:prospectId/messages', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return
  if (!(await mustHavePermission(req, res, businessId, 'prospection_read'))) return
  const prospectId = String(req.params.prospectId || '').trim()
  const limit = Math.max(1, Math.min(200, Number((req.query as any).limit || 50) || 50))
  const offset = Math.max(0, Number((req.query as any).offset || 0) || 0)
  if (!prospectId) {
    res.status(400).json({ success: false, error: 'Invalid payload' })
    return
  }

  const db = await getDb()
  const link = await db.get<any>('SELECT business_id FROM business_prospect WHERE business_id = ? AND prospect_id = ?', [businessId, prospectId])
  if (!link) {
    res.status(404).json({ success: false, error: 'Prospect not found' })
    return
  }

  const rows = await db.all<any>(
    `SELECT message_id, direction, provider, channel, from_email, to_email, to_phone, subject, text, created_at, task_id
     FROM prospect_message
     WHERE business_id = ? AND prospect_id = ?
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [businessId, prospectId, limit, offset],
  )

  res.status(200).json({
    items: rows.map((r) => ({
      message_id: r.message_id,
      direction: r.direction,
      provider: r.provider,
      channel: r.channel || null,
      from_email: r.from_email || null,
      to_email: r.to_email || null,
      to_phone: r.to_phone || null,
      subject: r.subject || null,
      text: r.text || '',
      created_at: r.created_at,
      task_id: r.task_id || null,
    })),
  })
})

router.get('/backoffice/:businessId/prospection/stats', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return
  if (!(await mustHavePermission(req, res, businessId, 'prospection_read'))) return
  const db = await getDb()

  const totalRow = await db.get<any>('SELECT COUNT(*) AS c FROM business_prospect WHERE business_id = ?', [businessId])

  const d30 = new Date()
  d30.setDate(d30.getDate() - 29)
  const from30 = d30.toISOString()

  const series = await db.all<any>(
    `SELECT substr(created_at, 1, 10) AS d, COUNT(*) AS c
     FROM business_prospect
     WHERE business_id = ? AND created_at >= ?
     GROUP BY d
     ORDER BY d ASC`,
    [businessId, from30],
  )

  res.status(200).json({ total: Number(totalRow?.c || 0), series })
})

router.get('/backoffice/:businessId/prospection/sequences', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return
  if (!(await mustHavePermission(req, res, businessId, 'prospection_read'))) return
  const db = await getDb()
  const rows = await db.all<any>(
    `SELECT sequence_id, name, enabled, steps_json, created_at, updated_at
     FROM prospect_sequence
     WHERE business_id = ?
     ORDER BY updated_at DESC
     LIMIT 200`,
    [businessId],
  )
  res.status(200).json({
    items: rows.map((r) => ({
      sequence_id: r.sequence_id,
      name: r.name,
      enabled: Boolean(r.enabled),
      steps: safeJsonParse<any[]>(r.steps_json, []),
      created_at: r.created_at,
      updated_at: r.updated_at,
    })),
  })
})

router.post('/backoffice/:businessId/prospection/sequences', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return
  if (!(await mustHavePermission(req, res, businessId, 'prospection_write'))) return
  const body = (req.body || {}) as any
  const name = String(body.name || '').trim()
  const enabled = body.enabled === false ? 0 : 1
  const steps = Array.isArray(body.steps) ? body.steps : []
  if (!name || steps.length === 0) {
    res.status(400).json({ success: false, error: 'Invalid payload' })
    return
  }
  const db = await getDb()
  const now = nowIso()
  const sequenceId = newId()
  await db.run(
    `INSERT INTO prospect_sequence (sequence_id, business_id, name, enabled, steps_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [sequenceId, businessId, name, enabled, JSON.stringify(steps), now, now],
  )
  await addAudit(db, req, businessId, { action: 'prospection.sequence.create', target_type: 'prospect_sequence', target_id: sequenceId })
  res.status(201).json({ sequence_id: sequenceId })
})

router.patch('/backoffice/:businessId/prospection/sequences/:sequenceId', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return
  if (!(await mustHavePermission(req, res, businessId, 'prospection_write'))) return
  const sequenceId = String(req.params.sequenceId || '').trim()
  const body = (req.body || {}) as any
  const name = body.name !== undefined ? String(body.name || '').trim() : null
  const enabled = body.enabled !== undefined ? (body.enabled === false ? 0 : 1) : null
  const steps = body.steps !== undefined ? (Array.isArray(body.steps) ? body.steps : null) : null
  if (!sequenceId) {
    res.status(400).json({ success: false, error: 'Invalid payload' })
    return
  }
  const sets: string[] = []
  const params: any[] = []
  if (name !== null) {
    if (!name) {
      res.status(400).json({ success: false, error: 'Invalid payload' })
      return
    }
    sets.push('name = ?')
    params.push(name)
  }
  if (enabled !== null) {
    sets.push('enabled = ?')
    params.push(enabled)
  }
  if (steps !== null) {
    if (!steps) {
      res.status(400).json({ success: false, error: 'Invalid payload' })
      return
    }
    sets.push('steps_json = ?')
    params.push(JSON.stringify(steps))
  }
  if (!sets.length) {
    res.status(400).json({ success: false, error: 'Invalid payload' })
    return
  }
  const now = nowIso()
  sets.push('updated_at = ?')
  params.push(now)
  const db = await getDb()
  const exists = await db.get<any>('SELECT sequence_id FROM prospect_sequence WHERE business_id = ? AND sequence_id = ?', [businessId, sequenceId])
  if (!exists) {
    res.status(404).json({ success: false, error: 'Sequence not found' })
    return
  }
  await db.run(`UPDATE prospect_sequence SET ${sets.join(', ')} WHERE business_id = ? AND sequence_id = ?`, [...params, businessId, sequenceId])
  await addAudit(db, req, businessId, { action: 'prospection.sequence.update', target_type: 'prospect_sequence', target_id: sequenceId })
  res.status(200).json({ success: true })
})

router.delete('/backoffice/:businessId/prospection/sequences/:sequenceId', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return
  if (!(await mustHavePermission(req, res, businessId, 'prospection_write'))) return
  const sequenceId = String(req.params.sequenceId || '').trim()
  if (!sequenceId) {
    res.status(400).json({ success: false, error: 'Invalid payload' })
    return
  }
  const db = await getDb()
  await db.run('DELETE FROM prospect_sequence WHERE business_id = ? AND sequence_id = ?', [businessId, sequenceId])
  await addAudit(db, req, businessId, { action: 'prospection.sequence.delete', target_type: 'prospect_sequence', target_id: sequenceId })
  res.status(204).end()
})

router.post('/backoffice/:businessId/prospection/sequences/:sequenceId/activate', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return
  if (!(await mustHavePermission(req, res, businessId, 'prospection_write'))) return
  const sequenceId = String(req.params.sequenceId || '').trim()
  const ids = Array.isArray((req.body as any)?.prospect_ids)
    ? (req.body as any).prospect_ids.map((s: any) => String(s || '').trim()).filter(Boolean)
    : []
  if (!sequenceId || ids.length === 0) {
    res.status(400).json({ success: false, error: 'Invalid payload' })
    return
  }

  const db = await getDb()
  const seq = await db.get<any>('SELECT sequence_id, steps_json FROM prospect_sequence WHERE business_id = ? AND sequence_id = ?', [businessId, sequenceId])
  if (!seq) {
    res.status(404).json({ success: false, error: 'Sequence not found' })
    return
  }

  const steps = safeJsonParse<any[]>(seq.steps_json, [])
  if (!Array.isArray(steps) || steps.length === 0) {
    res.status(400).json({ success: false, error: 'Invalid sequence' })
    return
  }

  const now = nowIso()
  const baseMs = new Date(now).getTime()
  let created = 0

  for (const prospectId of ids) {
    for (const step of steps) {
      const delayMin = Number(step?.delay_minutes || 0)
      const runAt = new Date(baseMs + Math.max(0, delayMin) * 60_000).toISOString()
      const payload = { templates: step?.templates || {}, sequence_id: sequenceId, step_id: step?.id || null }
      await db.run(
        `INSERT INTO prospect_task (
          task_id, business_id, prospect_id, kind, run_at, payload_json, status, last_error, attempts,
          sequence_id, step_id, approved_channel, approved_at, sent_at, canceled_at,
          created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?
        )`,
        [
          newId(),
          businessId,
          prospectId,
          'send_message',
          runAt,
          JSON.stringify(payload),
          'pending_review',
          null,
          0,
          sequenceId,
          step?.id ? String(step.id) : null,
          null,
          null,
          null,
          null,
          now,
          now,
        ],
      )
      created += 1
    }
  }

  await addAudit(db, req, businessId, { action: 'prospection.sequence.activate', target_type: 'prospect_sequence', target_id: sequenceId, data: { tasks: created } })
  res.status(200).json({ created })
})

router.post('/backoffice/:businessId/prospection/tasks/:taskId/approve', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return
  if (!(await mustHavePermission(req, res, businessId, 'prospection_validate'))) return
  const taskId = String(req.params.taskId || '').trim()
  const channel = String((req.body as any)?.channel || '').trim()
  const send = (req.body as any)?.send === true
  const runAt = (req.body as any)?.run_at ? String((req.body as any).run_at).trim() : null
  if (!taskId || (channel !== 'sms' && channel !== 'email')) {
    res.status(400).json({ success: false, error: 'Invalid payload' })
    return
  }

  const db = await getDb()
  const task = await db.get<any>('SELECT * FROM prospect_task WHERE business_id = ? AND task_id = ?', [businessId, taskId])
  if (!task) {
    res.status(404).json({ success: false, error: 'Task not found' })
    return
  }

  if (String(task.status || '') === 'canceled') {
    res.status(409).json({ success: false, error: 'Task canceled' })
    return
  }

  const now = nowIso()
  const nextRunAt = runAt || String(task.run_at || now)

  if (!send) {
    await db.run(
      'UPDATE prospect_task SET status = ?, approved_channel = ?, approved_at = ?, run_at = ?, updated_at = ? WHERE business_id = ? AND task_id = ?',
      ['approved', channel, now, nextRunAt, now, businessId, taskId],
    )
    await addAudit(db, req, businessId, { action: 'prospection.task.approve', target_type: 'prospect_task', target_id: taskId, data: { channel } })
    res.status(200).json({ success: true, status: 'approved' })
    return
  }
  try {
    const r = await sendProspectionTaskNow(db, req, businessId, taskId, channel as any)
    res.status(200).json({ success: true, status: r.status })
  } catch (e) {
    const code = (e as any)?.statusCode ? Number((e as any).statusCode) : 500
    res.status(code).json({ success: false, error: e instanceof Error ? e.message : String(e) })
  }
})

router.post('/backoffice/:businessId/prospection/tasks/bulk_approve', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return
  if (!(await mustHavePermission(req, res, businessId, 'prospection_validate'))) return
  const ids = Array.isArray((req.body as any)?.task_ids) ? (req.body as any).task_ids.map((s: any) => String(s || '').trim()).filter(Boolean) : []
  const channel = String((req.body as any)?.channel || '').trim()
  const send = (req.body as any)?.send === true
  const runAt = (req.body as any)?.run_at ? String((req.body as any).run_at).trim() : null
  if (!ids.length || (channel !== 'sms' && channel !== 'email')) {
    res.status(400).json({ success: false, error: 'Invalid payload' })
    return
  }

  const db = await getDb()
  const now = nowIso()
  let ok = 0
  let sent = 0
  let failed = 0
  for (const taskId of ids.slice(0, 500)) {
    if (!taskId) continue
    const task = await db.get<any>('SELECT task_id, status FROM prospect_task WHERE business_id = ? AND task_id = ?', [businessId, taskId])
    if (!task) continue
    if (String(task.status || '') === 'canceled') continue
    if (!send) {
      const nextRunAt = runAt || nowIso()
      await db.run(
        'UPDATE prospect_task SET status = ?, approved_channel = ?, approved_at = ?, run_at = ?, updated_at = ? WHERE business_id = ? AND task_id = ?',
        ['approved', channel, now, nextRunAt, now, businessId, taskId],
      )
      ok += 1
      continue
    }
    try {
      await sendProspectionTaskNow(db, req, businessId, taskId, channel as any)
      ok += 1
      sent += 1
    } catch {
      ok += 1
      failed += 1
    }
  }

  await addAudit(db, req, businessId, { action: 'prospection.task.bulk_approve', target_type: 'prospect_task', target_id: null, data: { tasks: ok, send, channel } })
  res.status(200).json({ success: true, tasks: ok, sent, failed })
})

router.get('/backoffice/:businessId/prospection/tasks', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return
  if (!(await mustHavePermission(req, res, businessId, 'prospection_read'))) return
  const status = String((req.query as any).status || '').trim()
  const sequenceId = String((req.query as any).sequence_id || '').trim()
  const prospectId = String((req.query as any).prospect_id || '').trim()
  const dueOnly = String((req.query as any).due || '') === '1'
  const limit = Math.max(1, Math.min(200, Number((req.query as any).limit || 100) || 100))

  const params: any[] = [businessId]
  let where = 't.business_id = ?'
  if (status) {
    where += ' AND t.status = ?'
    params.push(status)
  }
  if (sequenceId) {
    where += ' AND t.sequence_id = ?'
    params.push(sequenceId)
  }
  if (prospectId) {
    where += ' AND t.prospect_id = ?'
    params.push(prospectId)
  }
  if (dueOnly) {
    where += ' AND t.run_at <= ?'
    params.push(nowIso())
  }

  const db = await getDb()
  const rows = await db.all<any>(
    `SELECT
       t.task_id, t.prospect_id, t.kind, t.run_at, t.payload_json, t.status, t.last_error, t.attempts, t.sequence_id, t.step_id, t.approved_channel, t.approved_at,
       p.name AS prospect_name, p.phone AS prospect_phone, p.emails_json AS prospect_emails_json, p.website AS prospect_website, p.city AS prospect_city
     FROM prospect_task t
     JOIN prospect p ON p.prospect_id = t.prospect_id
     WHERE ${where}
     ORDER BY t.run_at ASC
     LIMIT ?`,
    [...params, limit],
  )

  res.status(200).json({
    items: rows.map((r) => ({
      task_id: r.task_id,
      prospect_id: r.prospect_id,
      kind: r.kind,
      run_at: r.run_at,
      status: r.status,
      last_error: r.last_error,
      attempts: r.attempts,
      sequence_id: r.sequence_id,
      step_id: r.step_id,
      approved_channel: r.approved_channel,
      approved_at: r.approved_at,
      payload: safeJsonParse<any>(r.payload_json, {}),
      prospect: {
        name: r.prospect_name,
        phone: r.prospect_phone,
        emails: safeJsonParse<string[]>(r.prospect_emails_json || '[]', []),
        website: r.prospect_website,
        city: r.prospect_city,
      },
    })),
  })
})

router.post('/backoffice/:businessId/prospection/tasks/:taskId/cancel', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return
  if (!(await mustHavePermission(req, res, businessId, 'prospection_validate'))) return
  const taskId = String(req.params.taskId || '').trim()
  if (!taskId) {
    res.status(400).json({ success: false, error: 'Invalid payload' })
    return
  }

  const db = await getDb()
  const task = await db.get<any>('SELECT task_id, status FROM prospect_task WHERE business_id = ? AND task_id = ?', [businessId, taskId])
  if (!task) {
    res.status(404).json({ success: false, error: 'Task not found' })
    return
  }

  const now = nowIso()
  await db.run('UPDATE prospect_task SET status = ?, canceled_at = ?, updated_at = ? WHERE business_id = ? AND task_id = ?', [
    'canceled',
    now,
    now,
    businessId,
    taskId,
  ])
  await addAudit(db, req, businessId, { action: 'prospection.task.cancel', target_type: 'prospect_task', target_id: taskId })
  res.status(200).json({ success: true, status: 'canceled' })
})

router.post('/backoffice/:businessId/prospection/sequences/:sequenceId/approve', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return
  if (!(await mustHavePermission(req, res, businessId, 'prospection_validate'))) return
  const sequenceId = String(req.params.sequenceId || '').trim()
  const channel = String((req.body as any)?.channel || '').trim()
  const send = (req.body as any)?.send === true
  const dueOnly = (req.body as any)?.due_only === true
  if (!sequenceId || (channel !== 'sms' && channel !== 'email')) {
    res.status(400).json({ success: false, error: 'Invalid payload' })
    return
  }
  const db = await getDb()
  const params: any[] = [businessId, sequenceId, 'pending_review']
  let where = 'business_id = ? AND sequence_id = ? AND status = ?'
  if (dueOnly) {
    where += ' AND run_at <= ?'
    params.push(nowIso())
  }
  const tasks = await db.all<any>(`SELECT task_id FROM prospect_task WHERE ${where} ORDER BY run_at ASC LIMIT 500`, params)
  let ok = 0
  let sent = 0
  let failed = 0
  for (const t of tasks) {
    const taskId = String(t.task_id || '')
    if (!taskId) continue
    if (!send) {
      await db.run(
        'UPDATE prospect_task SET status = ?, approved_channel = ?, approved_at = ?, updated_at = ? WHERE business_id = ? AND task_id = ?',
        ['approved', channel, nowIso(), nowIso(), businessId, taskId],
      )
      ok += 1
      continue
    }
    try {
      await sendProspectionTaskNow(db, req, businessId, taskId, channel as any)
      sent += 1
      ok += 1
    } catch {
      failed += 1
      ok += 1
    }
  }
  await addAudit(db, req, businessId, { action: 'prospection.sequence.approve', target_type: 'prospect_sequence', target_id: sequenceId, data: { tasks: ok, send: Boolean(send), channel } })
  res.status(200).json({ success: true, tasks: ok, sent, failed })
})

router.get('/backoffice/:businessId/users', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return
  if (!mustBeOwner(req, res)) return
  const db = await getDb()
  const users = await db.all<any>(
    'SELECT user_id, username, email, role, mfa_enabled, mfa_phone_e164, created_at FROM business_user WHERE business_id = ? ORDER BY created_at ASC',
    [businessId],
  )
  res.status(200).json({
    users: users.map((u) => ({
      user_id: u.user_id,
      username: u.username,
      email: u.email,
      role: u.role,
      mfa_enabled: Boolean(u.mfa_enabled),
      mfa_phone_e164: u.mfa_phone_e164 || null,
      created_at: u.created_at,
    })),
  })
})

router.post('/backoffice/:businessId/users', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return
  if (!mustBeOwner(req, res)) return
  const db = await getDb()
  const body = (req.body || {}) as any
  const username = String(body.username || '').trim()
  const email = body.email ? String(body.email).trim().toLowerCase() : null
  const password = String(body.password || '')
  if (!username || password.length < 8) {
    res.status(400).json({ success: false, error: 'Invalid payload' })
    return
  }

  const now = nowIso()
  const userId = newId()
  const passwordHash = bcrypt.hashSync(password, 10)
  await db.run(
    `INSERT INTO business_user (user_id, business_id, username, email, password_hash, role, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId, businessId, username, email, passwordHash, 'staff', now],
  )
  await addAudit(db, req, businessId, { action: 'user.create', target_type: 'business_user', target_id: userId, data: { username, email } })
  res.status(201).json({ user_id: userId })
})

router.patch('/backoffice/:businessId/users/:userId', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return
  if (!mustBeOwner(req, res)) return
  const db = await getDb()
  const userId = req.params.userId
  const body = (req.body || {}) as any

  const enabled = body.mfa_enabled === true || body.mfa_enabled === false ? Boolean(body.mfa_enabled) : null
  const phone = body.mfa_phone_e164 === null || body.mfa_phone_e164 === undefined ? null : String(body.mfa_phone_e164 || '').trim()

  if (enabled === null && phone === null) {
    res.status(400).json({ success: false, error: 'Invalid payload' })
    return
  }

  const updates: string[] = []
  const params: any[] = []
  if (enabled !== null) {
    updates.push('mfa_enabled = ?')
    params.push(enabled ? 1 : 0)
  }
  if (phone !== null) {
    updates.push('mfa_phone_e164 = ?')
    params.push(phone || null)
  }
  params.push(businessId, userId)
  await db.run(`UPDATE business_user SET ${updates.join(', ')} WHERE business_id = ? AND user_id = ?`, params)
  await addAudit(db, req, businessId, { action: 'user.mfa.update', target_type: 'business_user', target_id: userId, data: { enabled, phone } })
  res.status(204).end()
})

router.delete('/backoffice/:businessId/users/:userId', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return
  if (!mustBeOwner(req, res)) return
  const db = await getDb()
  const userId = req.params.userId
  const user = await db.get<{ user_id: string; role: string }>('SELECT user_id, role FROM business_user WHERE business_id = ? AND user_id = ?', [
    businessId,
    userId,
  ])
  if (!user) {
    res.status(404).json({ success: false, error: 'Not found' })
    return
  }
  if (user.role === 'owner') {
    res.status(400).json({ success: false, error: 'Cannot delete owner' })
    return
  }
  await db.run('DELETE FROM business_user WHERE business_id = ? AND user_id = ?', [businessId, userId])
  await addAudit(db, req, businessId, { action: 'user.delete', target_type: 'business_user', target_id: userId })
  res.status(204).end()
})

router.get('/backoffice/:businessId/audit', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return
  if (!mustBeOwner(req, res)) return
  const db = await getDb()
  const limit = Math.min(200, Math.max(1, Number((req.query as any).limit || 50)))
  const offset = Math.max(0, Number((req.query as any).offset || 0))
  const rows = await db.all<any>(
    `SELECT audit_id, actor_user_id, actor_role, action, target_type, target_id, data_json, ip, user_agent, created_at
     FROM audit_log
     WHERE business_id = ?
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [businessId, limit, offset],
  )
  res.status(200).json({
    items: rows.map((r) => ({
      audit_id: r.audit_id,
      actor_user_id: r.actor_user_id,
      actor_role: r.actor_role,
      action: r.action,
      target_type: r.target_type,
      target_id: r.target_id,
      data: safeJsonParse<any>(r.data_json, null),
      ip: r.ip,
      user_agent: r.user_agent,
      created_at: r.created_at,
    })),
  })
})

router.get('/backoffice/:businessId/leads', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return

  const db = await getDb()
  const { status, stage, assignee_user_id, tag, urgency, from, to, q, limit = '50', offset = '0' } = req.query as Record<string, string>

  const params: any[] = [businessId]
  let where = 'business_id = ?'

  if (status) {
    where += ' AND status = ?'
    params.push(status)
  }

  if (stage) {
    where += ' AND stage = ?'
    params.push(stage)
  }

  if (req.auth?.role === 'staff' && req.auth.user_id) {
    where += ' AND assignee_user_id = ?'
    params.push(String(req.auth.user_id))
  } else if (assignee_user_id) {
    where += ' AND assignee_user_id = ?'
    params.push(assignee_user_id)
  }

  if (urgency) {
    where += ' AND urgency = ?'
    params.push(urgency)
  }

  if (from) {
    where += ' AND created_at >= ?'
    params.push(from)
  }

  if (to) {
    where += ' AND created_at <= ?'
    params.push(to)
  }

  if (q) {
    const qq = `%${String(q).trim()}%`
    where +=
      ' AND (lead_id LIKE ? OR first_name LIKE ? OR phone_e164 LIKE ? OR city LIKE ? OR request_type LIKE ? OR email LIKE ? OR postal_code LIKE ? OR address LIKE ? OR description LIKE ? OR notes LIKE ? OR tags_json LIKE ?)'
    params.push(qq, qq, qq, qq, qq, qq, qq, qq, qq, qq, qq)
  }

  let sql = `SELECT * FROM lead WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  params.push(Number(limit))
  params.push(Number(offset))

  const rows = await db.all<any>(sql, params)
  const items = rows
    .map((r) => ({
      lead_id: r.lead_id,
      created_at: r.created_at,
      status: r.status,
      stage: r.stage || null,
      assignee_user_id: r.assignee_user_id || null,
      trade_id: r.trade_id,
      request_type: r.request_type,
      urgency: r.urgency,
      city: r.city,
      channel_preference: r.channel_preference,
      phone_valid: Boolean(r.phone_valid),
      sms_opt_in: Boolean(r.sms_opt_in),
      whatsapp_opt_in: Boolean(r.whatsapp_opt_in),
      tags: safeJsonParse<string[]>(r.tags_json, []),
      score: r.score,
      decision: r.decision,
      first_name: r.first_name,
      phone_e164: r.phone_e164,
    }))
    .filter((r) => (!tag ? true : r.tags.includes(tag)))

  const totalRow = await db.get<{ c: number }>(`SELECT COUNT(*) as c FROM lead WHERE ${where}`, params.slice(0, params.length - 2))

  res.status(200).json({ items, total: totalRow.c })
})

function formatDateFr(iso: any) {
  if (!iso) return ''
  try {
    return new Date(String(iso)).toLocaleString('fr-FR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch {
    return String(iso)
  }
}

function csvCell(value: any) {
  if (value === null || value === undefined) return ''
  const s = String(value)
  if (/[";\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

router.get('/backoffice/:businessId/leads/export', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return
  if (!(await mustHavePermission(req, res, businessId, 'export_leads'))) return

  const db = await getDb()
  const { status, stage, assignee_user_id, tag, urgency, from, to, q } = req.query as Record<string, string>

  const params: any[] = [businessId]
  let where = 'business_id = ?'

  if (status) {
    where += ' AND status = ?'
    params.push(status)
  }

  if (stage) {
    where += ' AND stage = ?'
    params.push(stage)
  }

  if (req.auth?.role === 'staff' && req.auth.user_id) {
    where += ' AND assignee_user_id = ?'
    params.push(String(req.auth.user_id))
  } else if (assignee_user_id) {
    where += ' AND assignee_user_id = ?'
    params.push(assignee_user_id)
  }

  if (from) {
    where += ' AND created_at >= ?'
    params.push(from)
  }

  if (to) {
    where += ' AND created_at <= ?'
    params.push(to)
  }

  if (urgency) {
    where += ' AND urgency = ?'
    params.push(urgency)
  }

  if (q) {
    const qq = `%${String(q).trim()}%`
    where +=
      ' AND (lead_id LIKE ? OR first_name LIKE ? OR phone_e164 LIKE ? OR city LIKE ? OR request_type LIKE ? OR email LIKE ? OR postal_code LIKE ? OR address LIKE ? OR description LIKE ? OR notes LIKE ? OR tags_json LIKE ?)'
    params.push(qq, qq, qq, qq, qq, qq, qq, qq, qq, qq, qq)
  }

  const rows = await db.all<any>(
    `SELECT lead_id, created_at, status, trade_id, request_type, urgency, channel_preference,
            first_name, phone_e164, email, city, postal_code, address, description,
            photos_count, tags_json, score, decision
     FROM lead
     WHERE ${where}
     ORDER BY created_at DESC
     LIMIT 10000`,
    params,
  )

  const items = rows
    .map((r) => ({ ...r, tags: safeJsonParse<string[]>(r.tags_json, []) }))
    .filter((r) => (!tag ? true : r.tags.includes(tag)))

  const profileRow = await db.get<any>('SELECT website_url, created_at FROM company_profile WHERE business_id = ?', [businessId])
  const businessWebsiteUrl = profileRow?.website_url ? String(profileRow.website_url) : ''
  const businessProfileCreatedAtFr = profileRow?.created_at ? formatDateFr(profileRow.created_at) : ''

  const header = [
    'lead_id',
    'created_at',
    'created_at_fr',
    'status',
    'trade_id',
    'request_type',
    'urgency',
    'channel_preference',
    'first_name',
    'phone_e164',
    'email',
    'city',
    'postal_code',
    'address',
    'description',
    'photos_count',
    'score',
    'decision',
    'tags',
    'business_website_url',
    'business_profile_created_at_fr',
  ]

  const lines = [header.join(';')]
  for (const r of items) {
    const line = [
      r.lead_id,
      r.created_at,
      formatDateFr(r.created_at),
      r.status,
      r.trade_id,
      r.request_type,
      r.urgency,
      r.channel_preference,
      r.first_name,
      r.phone_e164,
      r.email,
      r.city,
      r.postal_code,
      r.address,
      r.description,
      r.photos_count,
      r.score,
      r.decision,
      (r.tags || []).join('|'),
      businessWebsiteUrl,
      businessProfileCreatedAtFr,
    ]
      .map(csvCell)
      .join(';')
    lines.push(line)
  }

  await addAudit(db, req, businessId, { action: 'leads.export', target_type: 'lead', data: { status: status || null, tag: tag || null } })

  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="leads-${businessId}.csv"`)
  res.status(200).send(`\ufeff${lines.join('\r\n')}`)
})

router.get('/backoffice/:businessId/leads/export.xlsx', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return
  if (!(await mustHavePermission(req, res, businessId, 'export_leads'))) return

  const db = await getDb()
  const { status, stage, assignee_user_id, tag, urgency, from, to, q } = req.query as Record<string, string>

  const params: any[] = [businessId]
  let where = 'business_id = ?'

  if (status) {
    where += ' AND status = ?'
    params.push(status)
  }

  if (stage) {
    where += ' AND stage = ?'
    params.push(stage)
  }

  if (req.auth?.role === 'staff' && req.auth.user_id) {
    where += ' AND assignee_user_id = ?'
    params.push(String(req.auth.user_id))
  } else if (assignee_user_id) {
    where += ' AND assignee_user_id = ?'
    params.push(assignee_user_id)
  }

  if (from) {
    where += ' AND created_at >= ?'
    params.push(from)
  }

  if (to) {
    where += ' AND created_at <= ?'
    params.push(to)
  }

  if (urgency) {
    where += ' AND urgency = ?'
    params.push(urgency)
  }

  if (q) {
    const qq = `%${String(q).trim()}%`
    where +=
      ' AND (lead_id LIKE ? OR first_name LIKE ? OR phone_e164 LIKE ? OR city LIKE ? OR request_type LIKE ? OR email LIKE ? OR postal_code LIKE ? OR address LIKE ? OR description LIKE ? OR notes LIKE ? OR tags_json LIKE ?)'
    params.push(qq, qq, qq, qq, qq, qq, qq, qq, qq, qq, qq)
  }

  const rows = await db.all<any>(
    `SELECT lead_id, created_at, status, trade_id, request_type, urgency, channel_preference,
            first_name, phone_e164, email, city, postal_code, address, description,
            photos_count, tags_json, score, decision
     FROM lead
     WHERE ${where}
     ORDER BY created_at DESC
     LIMIT 10000`,
    params,
  )

  const items = rows
    .map((r) => ({ ...r, tags: safeJsonParse<string[]>(r.tags_json, []) }))
    .filter((r) => (!tag ? true : r.tags.includes(tag)))

  const profileRow = await db.get<any>('SELECT website_url, created_at FROM company_profile WHERE business_id = ?', [businessId])
  const businessWebsiteUrl = profileRow?.website_url ? String(profileRow.website_url) : ''
  const businessProfileCreatedAt = profileRow?.created_at ? new Date(String(profileRow.created_at)) : null

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Leads')
  ws.columns = [
    { header: 'lead_id', key: 'lead_id', width: 20 },
    { header: 'created_at', key: 'created_at', width: 18 },
    { header: 'status', key: 'status', width: 12 },
    { header: 'trade_id', key: 'trade_id', width: 12 },
    { header: 'request_type', key: 'request_type', width: 18 },
    { header: 'urgency', key: 'urgency', width: 10 },
    { header: 'channel_preference', key: 'channel_preference', width: 18 },
    { header: 'first_name', key: 'first_name', width: 16 },
    { header: 'phone_e164', key: 'phone_e164', width: 16 },
    { header: 'email', key: 'email', width: 24 },
    { header: 'city', key: 'city', width: 14 },
    { header: 'postal_code', key: 'postal_code', width: 10 },
    { header: 'address', key: 'address', width: 24 },
    { header: 'description', key: 'description', width: 40 },
    { header: 'photos_count', key: 'photos_count', width: 12 },
    { header: 'score', key: 'score', width: 8 },
    { header: 'decision', key: 'decision', width: 14 },
    { header: 'tags', key: 'tags', width: 18 },
    { header: 'business_website_url', key: 'business_website_url', width: 28 },
    { header: 'business_profile_created_at', key: 'business_profile_created_at', width: 20 },
  ]

  for (const r of items) {
    ws.addRow({
      lead_id: r.lead_id,
      created_at: r.created_at ? new Date(String(r.created_at)) : null,
      status: r.status,
      trade_id: r.trade_id,
      request_type: r.request_type,
      urgency: r.urgency,
      channel_preference: r.channel_preference,
      first_name: r.first_name,
      phone_e164: r.phone_e164,
      email: r.email,
      city: r.city,
      postal_code: r.postal_code,
      address: r.address,
      description: r.description,
      photos_count: r.photos_count,
      score: r.score,
      decision: r.decision,
      tags: (r.tags || []).join('|'),
      business_website_url: businessWebsiteUrl,
      business_profile_created_at: businessProfileCreatedAt,
    })
  }

  const dateFmt = 'dd/mm/yyyy hh:mm'
  ws.getColumn('created_at').numFmt = dateFmt
  ws.getColumn('business_profile_created_at').numFmt = dateFmt

  await addAudit(db, req, businessId, { action: 'leads.export.xlsx', target_type: 'lead', data: { status: status || null, tag: tag || null } })

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename="leads-${businessId}.xlsx"`)
  const buf = await wb.xlsx.writeBuffer()
  res.status(200).send(Buffer.from(buf))
})

router.get('/backoffice/:businessId/leads/:leadId', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return

  const db = await getDb()
  const leadId = req.params.leadId
  const row = await db.get<any>('SELECT * FROM lead WHERE business_id = ? AND lead_id = ?', [businessId, leadId])

  if (!row) {
    res.status(404).json({ success: false, error: 'Lead not found' })
    return
  }

  const messages = await db.all<any>('SELECT * FROM message_log WHERE lead_id = ? ORDER BY created_at ASC', [leadId])

  res.status(200).json({
    lead: {
      ...row,
      tags: safeJsonParse<string[]>(row.tags_json, []),
      photos: safeJsonParse<any[]>(row.photos_json, []),
      answers: safeJsonParse<any>(row.answers_json, {}),
      appointment: safeJsonParse<any>(row.appointment_json, null),
      outcome: safeJsonParse<any>(row.outcome_json, null),
    },
    timeline: [],
    messages: messages.map((m) => ({
      message_id: m.message_id,
      created_at: m.created_at,
      channel: m.channel,
      template_id: m.template_id,
      status: m.status,
      rendered_text: m.rendered_text,
    })),
  })
})

router.patch('/backoffice/:businessId/leads/:leadId', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return

  const db = await getDb()
  const leadId = req.params.leadId
  const body = (req.body || {}) as any

  const current = await db.get<any>('SELECT status, stage, first_human_response_at, trade_id, outcome_json FROM lead WHERE business_id = ? AND lead_id = ?', [
    businessId,
    leadId,
  ])
  if (!current) {
    res.status(404).json({ success: false, error: 'Lead not found' })
    return
  }

  const now = nowIso()
  const updates: string[] = []
  const params: any[] = []

  if (body.status) {
    updates.push('status = ?')
    params.push(body.status)
    if (!current.first_human_response_at && ['contacted', 'appointment', 'quote_sent', 'won', 'lost'].includes(body.status)) {
      updates.push('first_human_response_at = ?')
      params.push(now)
    }
  }

  if (body.appointment) {
    let appt: any = body.appointment
    if (appt && appt.date && appt.time) {
      const startAt = new Date(`${String(appt.date)}T${String(appt.time)}:00`).toISOString()
      const endAt = new Date(new Date(startAt).getTime() + 60 * 60 * 1000).toISOString()
      const appointmentId = newId()
      await db.run(
        `INSERT INTO appointment (
          appointment_id, business_id, lead_id, start_at, end_at, status, location, notes, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )`,
        [appointmentId, businessId, leadId, startAt, endAt, 'scheduled', appt.address ? String(appt.address) : null, null, now, now],
      )
      appt = { ...appt, appointment_id: appointmentId, start_at: startAt, end_at: endAt, status: 'scheduled' }
      if (body.stage === undefined) {
        updates.push('stage = ?')
        params.push('appointment')
      }
    }
    updates.push('appointment_json = ?')
    params.push(JSON.stringify(appt))
  }

  const existingOutcome = current.outcome_json ? safeJsonParse<any>(current.outcome_json, {}) : {}
  const shouldEnsureWonAt = Boolean(body.status) && String(body.status) === 'won'
  const nextOutcomeBase = existingOutcome && typeof existingOutcome === 'object' && !Array.isArray(existingOutcome) ? existingOutcome : {}
  const nextOutcome =
    body.outcome && typeof body.outcome === 'object' && !Array.isArray(body.outcome) ? { ...nextOutcomeBase, ...body.outcome } : nextOutcomeBase

  if (shouldEnsureWonAt && !nextOutcome.won_at) nextOutcome.won_at = now
  if (nextOutcome.amount_cents && !nextOutcome.currency) nextOutcome.currency = 'EUR'

  const shouldWriteOutcome =
    (body.outcome && typeof body.outcome === 'object') || (shouldEnsureWonAt && (!existingOutcome || !existingOutcome.won_at))
  if (shouldWriteOutcome) {
    updates.push('outcome_json = ?')
    params.push(Object.keys(nextOutcome).length ? JSON.stringify(nextOutcome) : null)
  }

  if (body.stage !== undefined) {
    updates.push('stage = ?')
    params.push(body.stage ? String(body.stage) : null)
  }

  if (body.assignee_user_id !== undefined) {
    updates.push('assignee_user_id = ?')
    params.push(body.assignee_user_id ? String(body.assignee_user_id) : null)
  }

  if (body.urgency !== undefined) {
    updates.push('urgency = ?')
    params.push(body.urgency ? String(body.urgency) : null)
  }

  if (body.notes !== undefined) {
    updates.push('notes = ?')
    params.push(body.notes ? String(body.notes) : null)
  }

  if (updates.length === 0) {
    res.status(200).json({ lead_id: leadId, status: current.status, updated_at: now })
    return
  }

  updates.push('updated_at = ?')
  params.push(now)
  params.push(businessId, leadId)
  await db.run(`UPDATE lead SET ${updates.join(', ')} WHERE business_id = ? AND lead_id = ?`, params)

  if (body.stage !== undefined && String(body.stage || '') !== String(current.stage || '')) {
    const businessRow = await db.get<{ config_json: string }>('SELECT config_json FROM business WHERE business_id = ?', [businessId])
    const cfg = businessRow ? safeJsonParse<any>(businessRow.config_json, {}) : {}
    await applyAutomationsOnStageEntered(db, businessId, leadId, cfg, body.stage ? String(body.stage) : '')
  }

  await addAudit(db, req, businessId, {
    action: 'lead.update',
    target_type: 'lead',
    target_id: leadId,
    data: { status: body.status || null, stage: body.stage || null, assignee_user_id: body.assignee_user_id || null, appointment: Boolean(body.appointment), outcome: Boolean(body.outcome) },
  })

  if (body.status && String(body.status) !== String(current.status || '') && current.trade_id) {
    await emitLeadStatusChanged(db, {
      business_id: businessId,
      trade_id: String(current.trade_id),
      user_id: req.auth?.user_id || null,
      lead_id: leadId,
      status_from: String(current.status || ''),
      status_to: String(body.status || ''),
    })
  }

  res.status(200).json({ lead_id: leadId, status: body.status || current.status, updated_at: now })
})

router.post('/backoffice/:businessId/leads/:leadId/portal', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return

  const db = await getDb()
  const leadId = req.params.leadId

  const lead = await db.get<any>('SELECT lead_id, assignee_user_id FROM lead WHERE business_id = ? AND lead_id = ?', [businessId, leadId])
  if (!lead) {
    res.status(404).json({ success: false, error: 'Lead not found' })
    return
  }

  if (req.auth?.role === 'staff' && String(lead.assignee_user_id || '') !== String(req.auth.user_id || '')) {
    res.status(403).json({ success: false, error: 'Forbidden' })
    return
  }

  const now = nowIso()
  const tokenPortal = crypto.randomBytes(24).toString('hex')
  const tokenPreview = crypto.randomBytes(24).toString('hex')
  const pin = String(Math.floor(100000 + Math.random() * 900000))

  const portalTokenHash = crypto.createHash('sha256').update(tokenPortal).digest('hex')
  const previewTokenHash = crypto.createHash('sha256').update(tokenPreview).digest('hex')
  const pinHash = crypto.createHash('sha256').update(pin).digest('hex')
  const previewTokenEnc = encryptPortalSecret(tokenPreview)

  const existing = await db.get<any>('SELECT portal_id, preview_enabled FROM lead_portal_access WHERE lead_id = ?', [leadId])
  const portalId = existing?.portal_id ? String(existing.portal_id) : newId()

  if (existing?.portal_id) {
    await db.run(
      `UPDATE lead_portal_access
       SET portal_token_hash = ?, portal_token_set_at = ?, preview_token_hash = ?, preview_token_set_at = ?, preview_token_enc = ?, pin_hash = ?, pin_set_at = ?, updated_at = ?
       WHERE lead_id = ?`,
      [portalTokenHash, now, previewTokenHash, now, previewTokenEnc, pinHash, now, now, leadId],
    )
  } else {
    await db.run(
      `INSERT INTO lead_portal_access (
        portal_id, business_id, lead_id,
        portal_token_hash, portal_token_set_at,
        preview_token_hash, preview_token_set_at, preview_token_enc,
        pin_hash, pin_set_at,
        preview_enabled, preview_enabled_at,
        created_at, updated_at
      ) VALUES (
        ?, ?, ?,
        ?, ?,
        ?, ?, ?,
        ?, ?,
        ?, ?,
        ?, ?
      )`,
      [portalId, businessId, leadId, portalTokenHash, now, previewTokenHash, now, previewTokenEnc, pinHash, now, 0, null, now, now],
    )
  }

  await addAudit(db, req, businessId, { action: 'lead.portal.rotate', target_type: 'lead', target_id: leadId })

  res.status(200).json({
    portal_id: portalId,
    portal_token: tokenPortal,
    preview_token: tokenPreview,
    pin,
    portal_url: `/portal/${portalId}?t=${tokenPortal}`,
    preview_url: `/portal/${portalId}/preview?t=${tokenPreview}`,
  })
})

router.get('/backoffice/:businessId/leads/:leadId/portal/messages', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return

  const db = await getDb()
  const leadId = String(req.params.leadId || '').trim()
  const lead = await db.get<any>('SELECT lead_id, assignee_user_id FROM lead WHERE business_id = ? AND lead_id = ?', [businessId, leadId])
  if (!lead) {
    res.status(404).json({ success: false, error: 'Lead not found' })
    return
  }
  if (req.auth?.role === 'staff' && String(lead.assignee_user_id || '') !== String(req.auth.user_id || '')) {
    res.status(403).json({ success: false, error: 'Forbidden' })
    return
  }

  const portal = await db.get<any>('SELECT portal_id FROM lead_portal_access WHERE lead_id = ?', [leadId])
  const portalId = portal?.portal_id ? String(portal.portal_id) : null
  if (!portalId) {
    res.status(200).json({ portal_id: null, messages: [] })
    return
  }

  const messages = await db.all<any>(
    'SELECT direction, author_label, text, created_at FROM lead_portal_message WHERE portal_id = ? ORDER BY created_at ASC LIMIT 200',
    [portalId],
  )
  res.status(200).json({ portal_id: portalId, messages: Array.isArray(messages) ? messages : [] })
})

router.post('/backoffice/:businessId/leads/:leadId/portal/messages', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return

  const text = String((req.body as any)?.text || '').trim()
  if (!text) {
    res.status(400).json({ success: false, error: 'Invalid payload' })
    return
  }

  const db = await getDb()
  const leadId = String(req.params.leadId || '').trim()
  const lead = await db.get<any>('SELECT lead_id, assignee_user_id FROM lead WHERE business_id = ? AND lead_id = ?', [businessId, leadId])
  if (!lead) {
    res.status(404).json({ success: false, error: 'Lead not found' })
    return
  }
  if (req.auth?.role === 'staff' && String(lead.assignee_user_id || '') !== String(req.auth.user_id || '')) {
    res.status(403).json({ success: false, error: 'Forbidden' })
    return
  }

  const portal = await db.get<any>('SELECT portal_id FROM lead_portal_access WHERE lead_id = ?', [leadId])
  const portalId = portal?.portal_id ? String(portal.portal_id) : null
  if (!portalId) {
    res.status(409).json({ success: false, error: 'Portal not generated' })
    return
  }

  let authorLabel: string | null = null
  if (req.auth?.user_id) {
    const u = await db.get<any>('SELECT username FROM business_user WHERE business_id = ? AND user_id = ?', [businessId, String(req.auth.user_id)])
    if (u?.username) authorLabel = String(u.username)
  }
  if (!authorLabel) authorLabel = 'Équipe'

  const now = nowIso()
  await db.run('INSERT INTO lead_portal_message (message_id, portal_id, direction, author_label, text, created_at) VALUES (?, ?, ?, ?, ?, ?)', [
    newId(),
    portalId,
    'staff',
    authorLabel,
    text,
    now,
  ])

  await addAudit(db, req, businessId, { action: 'lead.portal.message', target_type: 'lead', target_id: leadId, data: { direction: 'staff' } })

  res.status(200).json({ success: true, created_at: now })
})

router.patch('/backoffice/:businessId/leads/:leadId/site', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return

  const db = await getDb()
  const leadId = req.params.leadId
  const body = (req.body || {}) as any

  const lead = await db.get<any>('SELECT lead_id, assignee_user_id FROM lead WHERE business_id = ? AND lead_id = ?', [businessId, leadId])
  if (!lead) {
    res.status(404).json({ success: false, error: 'Lead not found' })
    return
  }

  if (req.auth?.role === 'staff' && String(lead.assignee_user_id || '') !== String(req.auth.user_id || '')) {
    res.status(403).json({ success: false, error: 'Forbidden' })
    return
  }

  const status = body.site_status ? String(body.site_status) : ''
  if (!['todo', 'in_progress', 'delivered'].includes(status)) {
    res.status(400).json({ success: false, error: 'Invalid payload' })
    return
  }

  const now = nowIso()
  const startedAt = status === 'in_progress' ? now : null
  const deliveredAt = status === 'delivered' ? now : null

  await db.run(
    `INSERT INTO lead_site_state (lead_id, site_status, site_started_at, site_delivered_at, updated_by_user_id, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(lead_id) DO UPDATE SET
       site_status = excluded.site_status,
       site_started_at = COALESCE(lead_site_state.site_started_at, excluded.site_started_at),
       site_delivered_at = COALESCE(lead_site_state.site_delivered_at, excluded.site_delivered_at),
       updated_by_user_id = excluded.updated_by_user_id,
       updated_at = excluded.updated_at`,
    [leadId, status, startedAt, deliveredAt, req.auth?.user_id || null, now],
  )

  if (body.preview_enabled !== undefined) {
    const enabled = Boolean(body.preview_enabled) ? 1 : 0
    await db.run(
      `UPDATE lead_portal_access
       SET preview_enabled = ?, preview_enabled_at = CASE WHEN ? = 1 THEN ? ELSE preview_enabled_at END, updated_at = ?
       WHERE lead_id = ?`,
      [enabled, enabled, now, now, leadId],
    )
  }

  await addAudit(db, req, businessId, { action: 'lead.site.update', target_type: 'lead', target_id: leadId, data: { site_status: status } })

  res.status(200).json({ lead_id: leadId, site_status: status, updated_at: now })
})

router.get('/backoffice/:businessId/sites', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return
  const db = await getDb()

  const params: any[] = [businessId]
  let where = 'l.business_id = ?'
  if (req.auth?.role === 'staff' && req.auth.user_id) {
    where += ' AND l.assignee_user_id = ?'
    params.push(String(req.auth.user_id))
  }

  const rows = await db.all<any>(
    `SELECT
      l.lead_id, l.first_name, l.city, l.postal_code, l.status, l.stage, l.assignee_user_id,
      s.site_status, s.site_started_at, s.site_delivered_at,
      p.portal_id, p.preview_enabled
     FROM lead l
     LEFT JOIN lead_site_state s ON s.lead_id = l.lead_id
     LEFT JOIN lead_portal_access p ON p.lead_id = l.lead_id
     WHERE ${where}
     ORDER BY l.created_at DESC
     LIMIT 200`,
    params,
  )

  res.status(200).json({ items: rows })
})

router.get('/backoffice/:businessId/appointments', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return
  const db = await getDb()
  const { from, to, limit = '200', offset = '0' } = req.query as Record<string, string>
  const params: any[] = [businessId]
  let where = 'business_id = ?'
  if (from) {
    where += ' AND start_at >= ?'
    params.push(from)
  }
  if (to) {
    where += ' AND start_at <= ?'
    params.push(to)
  }
  const rows = await db.all<any>(`SELECT * FROM appointment WHERE ${where} ORDER BY start_at ASC LIMIT ? OFFSET ?`, [
    ...params,
    Number(limit),
    Number(offset),
  ])
  res.status(200).json({ items: rows })
})

router.patch('/backoffice/:businessId/appointments/:appointmentId', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return
  const db = await getDb()
  const appointmentId = req.params.appointmentId
  const body = (req.body || {}) as any
  const row = await db.get<any>('SELECT * FROM appointment WHERE business_id = ? AND appointment_id = ?', [businessId, appointmentId])
  if (!row) {
    res.status(404).json({ success: false, error: 'Appointment not found' })
    return
  }
  const status = body.status ? String(body.status) : null
  if (!status) {
    res.status(400).json({ success: false, error: 'Invalid payload' })
    return
  }
  const now = nowIso()
  await db.run('UPDATE appointment SET status = ?, updated_at = ? WHERE business_id = ? AND appointment_id = ?', [status, now, businessId, appointmentId])
  await addAudit(db, req, businessId, { action: 'appointment.update', target_type: 'appointment', target_id: appointmentId, data: { status } })
  res.status(200).json({ appointment_id: appointmentId, status, updated_at: now })
})

router.get('/backoffice/:businessId/appointments/:appointmentId/ics', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return
  const db = await getDb()
  const appointmentId = req.params.appointmentId
  const appt = await db.get<any>('SELECT * FROM appointment WHERE business_id = ? AND appointment_id = ?', [businessId, appointmentId])
  if (!appt) {
    res.status(404).send('Not found')
    return
  }
  const businessRow = await db.get<{ config_json: string }>('SELECT config_json FROM business WHERE business_id = ?', [businessId])
  const cfg = businessRow ? safeJsonParse<any>(businessRow.config_json, {}) : {}
  const lead = await db.get<any>('SELECT first_name FROM lead WHERE business_id = ? AND lead_id = ?', [businessId, appt.lead_id])
  const title = `${String(cfg.company_name || 'Rendez-vous')} — ${lead?.first_name ? String(lead.first_name) : 'Lead'}`
  const dtStart = String(appt.start_at).replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  const dtEnd = String(appt.end_at).replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  const location = appt.location ? String(appt.location) : ''
  const uid = `${appointmentId}@devisexpress`
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DevisExpress//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${nowIso().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${title}`,
    location ? `LOCATION:${location.replace(/\n/g, ' ')}` : null,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean)
  const ics = `${lines.join('\r\n')}\r\n`
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename=\"appointment-${appointmentId}.ics\"`)
  res.status(200).send(ics)
})

router.post('/backoffice/:businessId/leads/:leadId/anonymize', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return
  if (!(await mustHavePermission(req, res, businessId, 'lead_anonymize'))) return

  const db = await getDb()
  const leadId = req.params.leadId
  const row = await db.get<{ lead_id: string; photos_json: string | null }>('SELECT lead_id, photos_json FROM lead WHERE business_id = ? AND lead_id = ?', [
    businessId,
    leadId,
  ])
  if (!row) {
    res.status(404).json({ success: false, error: 'Lead not found' })
    return
  }

  const storage = getFileStorageProvider()
  const photos = safeJsonParse<any[]>(row.photos_json, [])
  const assetIds = photos.map((p) => String(p?.asset_id || '')).filter(Boolean)
  const urls = photos.map((p) => String(p?.url || '')).filter(Boolean)

  for (const assetId of assetIds) {
    const asset = await db.get<{ asset_id: string; url: string; storage_key: string | null }>(
      'SELECT asset_id, url, storage_key FROM asset WHERE business_id = ? AND asset_id = ?',
      [businessId, assetId],
    )
    if (!asset) continue
    const key = asset.storage_key || asset.url
    await storage.delete(key)
    await db.run('DELETE FROM asset WHERE business_id = ? AND asset_id = ?', [businessId, assetId])
  }

  for (const url of urls) {
    if (!url) continue
    const asset = await db.get<{ asset_id: string; url: string; storage_key: string | null }>('SELECT asset_id, url, storage_key FROM asset WHERE business_id = ? AND url = ?', [
      businessId,
      url,
    ])
    if (!asset) continue
    const key = asset.storage_key || asset.url
    await storage.delete(key)
    await db.run('DELETE FROM asset WHERE business_id = ? AND asset_id = ?', [businessId, asset.asset_id])
  }

  const now = nowIso()
  await db.run(
    `UPDATE lead SET
      first_name = ?, phone_e164 = ?, email = ?, address = ?, description = ?,
      photos_json = ?, photos_count = ?, answers_json = ?, attribution_json = ?,
      notes = ?, status = ?, updated_at = ?
     WHERE business_id = ? AND lead_id = ?`,
    ['', 'deleted', null, null, null, '[]', 0, '{}', '{}', null, 'deleted', now, businessId, leadId],
  )

  await db.run('UPDATE message_log SET rendered_text = ? WHERE business_id = ? AND lead_id = ?', ['[redacted]', businessId, leadId])
  await addAudit(db, req, businessId, { action: 'lead.anonymize', target_type: 'lead', target_id: leadId })
  res.status(204).end()
})

router.post('/backoffice/:businessId/leads/:leadId/messages', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return

  const db = await getDb()
  const leadId = req.params.leadId
  const { channel, template_id, variables } = (req.body || {}) as any

  const businessRow = await db.get<{ config_json: string }>('SELECT config_json FROM business WHERE business_id = ?', [businessId])
  const leadRow = await db.get<any>('SELECT * FROM lead WHERE business_id = ? AND lead_id = ?', [businessId, leadId])

  if (!businessRow || !leadRow) {
    res.status(404).json({ success: false, error: 'Not found' })
    return
  }

  const business = safeJsonParse<any>(businessRow.config_json, {})
  const lead = { ...leadRow, address: leadRow.address, first_name: leadRow.first_name, request_type: leadRow.request_type }
  const rendered = renderTemplate(template_id, channel, { business, lead, variables })

  if (!rendered) {
    res.status(400).json({ success: false, error: 'Unknown template' })
    return
  }

  if (leadRow.sms_opt_out_at) {
    res.status(400).json({ success: false, error: 'Opt-out' })
    return
  }
  if (channel === 'sms' && !(leadRow.sms_opt_in === 1 || leadRow.sms_opt_in === true)) {
    res.status(400).json({ success: false, error: 'No SMS consent' })
    return
  }
  if (channel === 'whatsapp' && !(leadRow.whatsapp_opt_in === 1 || leadRow.whatsapp_opt_in === true)) {
    res.status(400).json({ success: false, error: 'No WhatsApp consent' })
    return
  }

  const messageId = newId()
  const now = nowIso()

  const provider = getMessagingProvider()
  const sendResult = await provider.send({ channel, to: String(leadRow.phone_e164), text: rendered })

  await db.run(
    `INSERT INTO message_log (
      message_id, business_id, lead_id, channel, template_id, rendered_text, provider_message_id, status, created_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?
    )`,
    [messageId, businessId, leadId, channel, template_id, rendered, sendResult.provider_message_id, sendResult.status, now],
  )

  await db.run(
    `UPDATE lead
     SET first_human_response_at = COALESCE(first_human_response_at, ?), updated_at = ?
     WHERE business_id = ? AND lead_id = ?`,
    [now, now, businessId, leadId],
  )

  await addAudit(db, req, businessId, {
    action: 'message.send',
    target_type: 'lead',
    target_id: leadId,
    data: { channel, template_id, status: sendResult.status },
  })

  if (leadRow.trade_id) {
    await emitLeadResponseSent(db, {
      business_id: businessId,
      trade_id: String(leadRow.trade_id),
      user_id: req.auth?.user_id || null,
      lead_id: leadId,
      channel,
      template_id,
    })
  }

  res.status(202).json({ message_id: messageId, status: sendResult.status })
})

router.post('/backoffice/:businessId/leads/:leadId/messages/raw', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return

  const db = await getDb()
  const leadId = req.params.leadId
  const { channel, text } = (req.body || {}) as any

  const leadRow = await db.get<any>('SELECT * FROM lead WHERE business_id = ? AND lead_id = ?', [businessId, leadId])
  if (!leadRow) {
    res.status(404).json({ success: false, error: 'Not found' })
    return
  }

  const rawText = String(text || '').trim()
  if (!rawText) {
    res.status(400).json({ success: false, error: 'Missing text' })
    return
  }

  if (leadRow.sms_opt_out_at) {
    res.status(400).json({ success: false, error: 'Opt-out' })
    return
  }
  if (channel === 'sms' && !(leadRow.sms_opt_in === 1 || leadRow.sms_opt_in === true)) {
    res.status(400).json({ success: false, error: 'No SMS consent' })
    return
  }
  if (channel === 'whatsapp' && !(leadRow.whatsapp_opt_in === 1 || leadRow.whatsapp_opt_in === true)) {
    res.status(400).json({ success: false, error: 'No WhatsApp consent' })
    return
  }

  const messageId = newId()
  const now = nowIso()

  const provider = getMessagingProvider()
  const sendResult = await provider.send({ channel, to: String(leadRow.phone_e164), text: rawText })

  await db.run(
    `INSERT INTO message_log (
      message_id, business_id, lead_id, channel, template_id, rendered_text, provider_message_id, status, created_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?
    )`,
    [messageId, businessId, leadId, channel, 'custom', rawText, sendResult.provider_message_id, sendResult.status, now],
  )

  await db.run(
    `UPDATE lead
     SET first_human_response_at = COALESCE(first_human_response_at, ?), updated_at = ?
     WHERE business_id = ? AND lead_id = ?`,
    [now, now, businessId, leadId],
  )

  await addAudit(db, req, businessId, {
    action: 'message.send',
    target_type: 'lead',
    target_id: leadId,
    data: { channel, template_id: 'custom', status: sendResult.status },
  })

  if (leadRow.trade_id) {
    await emitLeadResponseSent(db, {
      business_id: businessId,
      trade_id: String(leadRow.trade_id),
      user_id: req.auth?.user_id || null,
      lead_id: leadId,
      channel,
      template_id: 'custom',
    })
  }

  res.status(202).json({ message_id: messageId, status: sendResult.status })
})

router.get('/backoffice/:businessId/settings', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return
  const db = await getDb()
  const row = await db.get<{ config_json: string }>('SELECT config_json FROM business WHERE business_id = ?', [businessId])
  if (!row) {
    res.status(404).json({ success: false, error: 'Business not found' })
    return
  }
  res.status(200).json({ config: safeJsonParse<any>(row.config_json, {}) })
})

router.get('/backoffice/:businessId/specs_trades', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return
  const specs = loadSpecs()
  const trades = specs?.siteCopy?.trades && typeof specs.siteCopy.trades === 'object' ? specs.siteCopy.trades : {}
  const map = new Map<string, string>()
  for (const [trade_id, v] of Object.entries(trades)) {
    if (trade_id === 'generic') continue
    map.set(trade_id, String((v as any)?.label || tradeLabelFromId(trade_id) || humanizeTradeId(trade_id) || trade_id))
  }
  for (const t of COMMON_TRADES) {
    if (!map.has(t.trade_id)) map.set(t.trade_id, t.label)
  }
  const items = Array.from(map.entries()).map(([trade_id, label]) => ({ trade_id, label }))
  items.sort((a, b) => a.label.localeCompare(b.label, 'fr'))
  res.status(200).json({ trades: items })
})

router.post('/backoffice/:businessId/site_preview_config', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return
  if (!(await mustHavePermission(req, res, businessId, 'settings_write'))) return
  const cfg = (req.body as any)?.config
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) {
    res.status(400).json({ success: false, error: 'Invalid payload' })
    return
  }

  const config = cfg
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

  const db = await getDb()
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
      google_reviews: {
        rating_avg: ratingAvg,
        rating_count: ratingCount,
        reviews,
      },
      photos_real: photosReal,
    },
  })
})

router.get('/backoffice/:businessId/company_profile', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return
  const db = await getDb()
  const row = await db.get<{ business_id: string }>('SELECT business_id FROM business WHERE business_id = ?', [businessId])
  if (!row) {
    res.status(404).json({ success: false, error: 'Business not found' })
    return
  }
  const existing = await db.get<any>('SELECT * FROM company_profile WHERE business_id = ?', [businessId])
  if (existing) {
    res.status(200).json({ profile: existing })
    return
  }

  const cfgRow = await db.get<{ config_json: string }>('SELECT config_json FROM business WHERE business_id = ?', [businessId])
  const cfg = safeJsonParse<any>(cfgRow?.config_json || '{}', {})
  const prefillWebsiteUrl = cfg?.integrations?.google_business_profile_url ? String(cfg.integrations.google_business_profile_url) : null
  const companyProfileId = newId()
  const now = nowIso()
  await db.run(
    `INSERT INTO company_profile (
      company_profile_id, business_id, prospect_id,
      website_url, legal_contact_email, headcount_range, naf_code, sector_label, annual_revenue_eur,
      website_created_at, website_redesign_at,
      created_at, updated_at
    ) VALUES (
      ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?,
      ?, ?
    )`,
    [companyProfileId, businessId, null, prefillWebsiteUrl, null, null, null, null, null, null, null, now, now],
  )
  const profile = {
    company_profile_id: companyProfileId,
    business_id: businessId,
    prospect_id: null,
    website_url: prefillWebsiteUrl,
    legal_contact_email: null,
    headcount_range: null,
    naf_code: null,
    sector_label: null,
    annual_revenue_eur: null,
    website_created_at: null,
    website_redesign_at: null,
    created_at: now,
    updated_at: now,
  }
  res.status(200).json({ profile })
})

router.patch('/backoffice/:businessId/company_profile', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return
  if (!(await mustHavePermission(req, res, businessId, 'settings_write'))) return
  const db = await getDb()
  const row = await db.get<{ business_id: string }>('SELECT business_id FROM business WHERE business_id = ?', [businessId])
  if (!row) {
    res.status(404).json({ success: false, error: 'Business not found' })
    return
  }
  const body = (req.body || {}) as any
  const patch = {
    website_url: body.website_url !== undefined ? (body.website_url ? String(body.website_url) : null) : undefined,
    legal_contact_email: body.legal_contact_email !== undefined ? (body.legal_contact_email ? String(body.legal_contact_email) : null) : undefined,
    headcount_range: body.headcount_range !== undefined ? (body.headcount_range ? String(body.headcount_range) : null) : undefined,
    naf_code: body.naf_code !== undefined ? (body.naf_code ? String(body.naf_code) : null) : undefined,
    sector_label: body.sector_label !== undefined ? (body.sector_label ? String(body.sector_label) : null) : undefined,
    website_created_at: body.website_created_at !== undefined ? (body.website_created_at ? String(body.website_created_at) : null) : undefined,
    website_redesign_at: body.website_redesign_at !== undefined ? (body.website_redesign_at ? String(body.website_redesign_at) : null) : undefined,
  }
  const profile = await upsertCompanyProfile(db, { business_id: businessId }, patch)
  await addAudit(db, req, businessId, { action: 'company_profile.update', target_type: 'business', target_id: businessId })
  res.status(200).json({ profile })
})

router.post('/backoffice/:businessId/ai/recommendations', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return
  if (!(await mustHavePermission(req, res, businessId, 'settings_write'))) return
  const db = await getDb()
  const row = await db.get<{ config_json: string }>('SELECT config_json FROM business WHERE business_id = ?', [businessId])
  if (!row) {
    res.status(404).json({ success: false, error: 'Business not found' })
    return
  }
  const cfg = safeJsonParse<any>(row.config_json, {})
  try {
    const out = await generateRecommendations(cfg)
    res.status(200).json(out)
  } catch (e: any) {
    res.status(400).json({ success: false, error: e?.message || 'AI error' })
  }
})

router.post('/backoffice/:businessId/ai/hero_variant_b', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return
  if (!(await mustHavePermission(req, res, businessId, 'settings_write'))) return
  const db = await getDb()
  const row = await db.get<{ config_json: string }>('SELECT config_json FROM business WHERE business_id = ?', [businessId])
  if (!row) {
    res.status(404).json({ success: false, error: 'Business not found' })
    return
  }
  const cfg = safeJsonParse<any>(row.config_json, {})
  try {
    const out = await generateHeroVariantB(cfg)
    res.status(200).json(out)
  } catch (e: any) {
    res.status(400).json({ success: false, error: e?.message || 'AI error' })
  }
})

router.post('/backoffice/:businessId/leads/:leadId/ai/message_draft', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return

  const db = await getDb()
  const leadId = req.params.leadId
  const channel = String((req.body || {})?.channel || 'sms') as any

  const businessRow = await db.get<{ config_json: string }>('SELECT config_json FROM business WHERE business_id = ?', [businessId])
  const leadRow = await db.get<any>('SELECT * FROM lead WHERE business_id = ? AND lead_id = ?', [businessId, leadId])

  if (!businessRow || !leadRow) {
    res.status(404).json({ success: false, error: 'Not found' })
    return
  }

  const business = safeJsonParse<any>(businessRow.config_json, {})
  const out = await generateMessageDraft({ business, lead: leadRow, channel: channel === 'whatsapp' ? 'whatsapp' : 'sms' })
  res.status(200).json(out)
})

router.patch('/backoffice/:businessId/settings', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return
  if (!(await mustHavePermission(req, res, businessId, 'settings_write'))) return
  const db = await getDb()
  const row = await db.get<{ config_json: string }>('SELECT config_json FROM business WHERE business_id = ?', [businessId])
  if (!row) {
    res.status(404).json({ success: false, error: 'Business not found' })
    return
  }
  const current = safeJsonParse<any>(row.config_json, {})
  const body = (req.body || {}) as any
  const next: any = { ...current, ...body }
  const now = nowIso()

  const prevTrade = String(current?.trade_id || '').trim()
  const nextTrade = String(next?.trade_id || '').trim()
  if (prevTrade && nextTrade && prevTrade !== nextTrade) {
    const mode = next?.settings?.gallery_mode
    if (mode !== 'custom') {
      const existing = await db.all<{ photo_id: string; url: string }>(
        'SELECT photo_id, url FROM business_gallery_photo WHERE business_id = ? ORDER BY created_at DESC LIMIT 50',
        [businessId],
      )
      const urls = existing.map((p) => p.url)
      const isAuto = !urls.length || urls.every((u) => isTextToImageUrl(u))
      if (isAuto) {
        await db.run('DELETE FROM business_gallery_photo WHERE business_id = ?', [businessId])
        for (const url of defaultGalleryUrlsForTrade(nextTrade)) {
          await db.run(`INSERT INTO business_gallery_photo (photo_id, business_id, url, created_at) VALUES (?, ?, ?, ?)`, [newId(), businessId, url, now])
        }
        next.settings = { ...(next.settings || {}), gallery_mode: 'auto' }
      }
    }
  }

  await db.run(
    'UPDATE business SET trade_id = ?, company_name = ?, phone_e164 = ?, whatsapp_e164 = ?, email_notifications = ?, city = ?, zone_label = ?, config_json = ?, updated_at = ? WHERE business_id = ?',
    [
      String(next.trade_id || ''),
      String(next.company_name || ''),
      String(next.phone_e164 || ''),
      next.whatsapp_e164 ? String(next.whatsapp_e164) : null,
      next.email_notifications ? String(next.email_notifications) : null,
      String(next.city || ''),
      String(next.zone_label || ''),
      JSON.stringify(next),
      now,
      businessId,
    ],
  )
  await addAudit(db, req, businessId, { action: 'business.settings.update', target_type: 'business', target_id: businessId })
  res.status(200).json({ config: next })
})

router.get('/backoffice/:businessId/proof', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return
  const db = await getDb()

  const reviews = await db.all<any>(
    'SELECT review_id, author_name, rating, text, created_at FROM business_review WHERE business_id = ? ORDER BY created_at DESC',
    [businessId],
  )
  const photos = await db.all<any>(
    'SELECT photo_id, url, created_at FROM business_gallery_photo WHERE business_id = ? ORDER BY created_at DESC',
    [businessId],
  )

  res.status(200).json({ reviews, photos })
})

router.post('/backoffice/:businessId/reviews', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return
  if (!(await mustHavePermission(req, res, businessId, 'proof_write'))) return
  const db = await getDb()
  const body = (req.body || {}) as any
  const authorName = String(body.author_name || '').trim()
  const rating = Number(body.rating || 0)
  const text = String(body.text || '').trim()

  if (!authorName || !text || !Number.isFinite(rating) || rating < 1 || rating > 5) {
    res.status(400).json({ success: false, error: 'Invalid payload' })
    return
  }

  const reviewId = newId()
  const now = nowIso()
  await db.run(
    `INSERT INTO business_review (review_id, business_id, author_name, rating, text, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [reviewId, businessId, authorName, rating, text, now],
  )
  await addAudit(db, req, businessId, { action: 'review.create', target_type: 'business_review', target_id: reviewId, data: { rating } })

  res.status(201).json({ review_id: reviewId })
})

router.delete('/backoffice/:businessId/reviews/:reviewId', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return
  if (!(await mustHavePermission(req, res, businessId, 'proof_write'))) return
  const db = await getDb()
  const reviewId = req.params.reviewId
  await db.run('DELETE FROM business_review WHERE business_id = ? AND review_id = ?', [businessId, reviewId])
  await addAudit(db, req, businessId, { action: 'review.delete', target_type: 'business_review', target_id: reviewId })
  res.status(204).end()
})

router.post('/backoffice/:businessId/photos', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return
  if (!(await mustHavePermission(req, res, businessId, 'proof_write'))) return
  const db = await getDb()
  const body = (req.body || {}) as any
  const url = String(body.url || '').trim()
  if (!url || !/^https?:\/\//.test(url)) {
    res.status(400).json({ success: false, error: 'Invalid payload' })
    return
  }
  const photoId = newId()
  const now = nowIso()
  await db.run(
    `INSERT INTO business_gallery_photo (photo_id, business_id, url, created_at)
     VALUES (?, ?, ?, ?)`,
    [photoId, businessId, url, now],
  )
  const cfgRow = await db.get<{ config_json: string }>('SELECT config_json FROM business WHERE business_id = ?', [businessId])
  const current = safeJsonParse<any>(cfgRow?.config_json || '{}', {})
  const next = { ...current, settings: { ...(current.settings || {}), gallery_mode: 'custom' } }
  await db.run('UPDATE business SET config_json = ?, updated_at = ? WHERE business_id = ?', [JSON.stringify(next), now, businessId])
  await addAudit(db, req, businessId, { action: 'photo.add_url', target_type: 'business_gallery_photo', target_id: photoId })
  res.status(201).json({ photo_id: photoId })
})

router.post('/backoffice/:businessId/photos/upload', requireAuth, uploadSingle('file'), async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return
  if (!(await mustHavePermission(req, res, businessId, 'proof_write'))) return
  const db = await getDb()
  const file = req.file
  if (!file) {
    res.status(400).json({ success: false, error: 'Missing file' })
    return
  }

  const storage = getFileStorageProvider()
  const stored = await storage.upload({
    business_id: businessId,
    kind: 'gallery_photo',
    content_type: file.mimetype,
    buffer: file.buffer,
  })
  const assetId = newId()
  const now = nowIso()

  await db.run(
    `INSERT INTO asset (asset_id, business_id, kind, content_type, size_bytes, url, storage_key, sha256, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [assetId, businessId, 'gallery_photo', file.mimetype, stored.size_bytes, stored.url, stored.key, null, now],
  )

  const photoId = newId()
  await db.run(
    `INSERT INTO business_gallery_photo (photo_id, business_id, url, created_at)
     VALUES (?, ?, ?, ?)`,
    [photoId, businessId, stored.url, now],
  )

  const cfgRow = await db.get<{ config_json: string }>('SELECT config_json FROM business WHERE business_id = ?', [businessId])
  const current = safeJsonParse<any>(cfgRow?.config_json || '{}', {})
  const next = { ...current, settings: { ...(current.settings || {}), gallery_mode: 'custom' } }
  await db.run('UPDATE business SET config_json = ?, updated_at = ? WHERE business_id = ?', [JSON.stringify(next), now, businessId])

  await addAudit(db, req, businessId, { action: 'photo.upload', target_type: 'business_gallery_photo', target_id: photoId })

  res.status(201).json({ photo_id: photoId, url: stored.url })
})

router.post('/backoffice/:businessId/logo/upload', requireAuth, uploadSingle('file'), async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return
  if (!(await mustHavePermission(req, res, businessId, 'settings_write'))) return
  const db = await getDb()
  const file = req.file
  if (!file) {
    res.status(400).json({ success: false, error: 'Missing file' })
    return
  }

  const storage = getFileStorageProvider()
  const stored = await storage.upload({
    business_id: businessId,
    kind: 'logo',
    content_type: file.mimetype,
    buffer: file.buffer,
  })

  const assetId = newId()
  const now = nowIso()

  await db.run(
    `INSERT INTO asset (asset_id, business_id, kind, content_type, size_bytes, url, storage_key, sha256, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [assetId, businessId, 'logo', file.mimetype, stored.size_bytes, stored.url, stored.key, null, now],
  )

  const row = await db.get<{ config_json: string }>('SELECT config_json FROM business WHERE business_id = ?', [businessId])
  const current = row ? safeJsonParse<any>(row.config_json, {}) : {}
  const next = { ...current, logo_url: stored.url }
  await db.run('UPDATE business SET config_json = ?, updated_at = ? WHERE business_id = ?', [JSON.stringify(next), now, businessId])

  await addAudit(db, req, businessId, { action: 'logo.upload', target_type: 'asset', target_id: assetId })

  res.status(201).json({ url: stored.url })
})

router.delete('/backoffice/:businessId/photos/:photoId', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return
  if (!(await mustHavePermission(req, res, businessId, 'proof_write'))) return
  const db = await getDb()
  const photoId = req.params.photoId
  const photo = await db.get<{ url: string }>('SELECT url FROM business_gallery_photo WHERE business_id = ? AND photo_id = ?', [businessId, photoId])
  if (photo) {
    const asset = await db.get<{ asset_id: string; url: string; storage_key: string | null }>(
      'SELECT asset_id, url, storage_key FROM asset WHERE business_id = ? AND url = ?',
      [businessId, photo.url],
    )
    if (asset) {
      const storage = getFileStorageProvider()
      await storage.delete(asset.storage_key || asset.url)
      await db.run('DELETE FROM asset WHERE business_id = ? AND asset_id = ?', [businessId, asset.asset_id])
    }
  }
  await db.run('DELETE FROM business_gallery_photo WHERE business_id = ? AND photo_id = ?', [businessId, photoId])
  const cfgRow = await db.get<{ config_json: string }>('SELECT config_json FROM business WHERE business_id = ?', [businessId])
  const current = safeJsonParse<any>(cfgRow?.config_json || '{}', {})
  const next = { ...current, settings: { ...(current.settings || {}), gallery_mode: 'custom' } }
  await db.run('UPDATE business SET config_json = ?, updated_at = ? WHERE business_id = ?', [JSON.stringify(next), nowIso(), businessId])
  await addAudit(db, req, businessId, { action: 'photo.delete', target_type: 'business_gallery_photo', target_id: photoId })
  res.status(204).end()
})

router.get('/backoffice/:businessId/dashboard', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return
  const db = await getDb()
  const range = String((req.query as any).range || 'last_7_days')
  const now = Date.now()
  const fromMs = range === 'last_30_days' ? now - 30 * 864e5 : range === 'month_to_date' ? new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime() : now - 7 * 864e5
  const fromIso = new Date(fromMs).toISOString()

  const businessRow = await db.get<{ config_json: string }>('SELECT config_json FROM business WHERE business_id = ?', [businessId])
  const businessConfig = businessRow ? safeJsonParse<any>(businessRow.config_json, {}) : {}
  const expCfg = (businessConfig?.settings?.ab_tests?.experiments || {}) as any
  const expKeys = ['hero', 'services', 'zones', 'tarifs', 'quote_form'] as const
  const expIds: Record<string, string> = {}
  for (const k of expKeys) {
    const d = expCfg?.[k] && typeof expCfg[k] === 'object' ? expCfg[k] : {}
    const version = Number.isFinite(Number(d.version)) ? Number(d.version) : 1
    const id = typeof d.id === 'string' && d.id.trim() ? d.id.trim() : `${k}_v${version}`
    expIds[k] = id
  }

  const leads = await db.all<any>('SELECT * FROM lead WHERE business_id = ? AND created_at >= ?', [businessId, fromIso])

  const leadsTotal = leads.length
  const qualified = leads.filter((l) => l.decision === 'qualified').length
  const needsFollowup = leads.filter((l) => l.decision === 'needs_followup').length
  const won = leads.filter((l) => l.status === 'won').length
  const lost = leads.filter((l) => l.status === 'lost').length
  const quotesSent = leads.filter((l) => ['quote_sent', 'won', 'lost'].includes(l.status)).length
  const appointments = leads.filter((l) => ['appointment', 'quote_sent', 'won', 'lost'].includes(l.status)).length

  const months: string[] = []
  const monthBuckets = new Map<string, number>()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(new Date().getFullYear(), new Date().getMonth() - i, 1)
    const key = d.toISOString().slice(0, 7)
    months.push(key)
    monthBuckets.set(key, 0)
  }
  const monthStartIso = new Date(new Date().getFullYear(), new Date().getMonth() - 11, 1).toISOString()

  const wonRows = await db.all<any>(
    "SELECT outcome_json FROM lead WHERE business_id = ? AND status = 'won' AND outcome_json IS NOT NULL AND updated_at >= ?",
    [businessId, monthStartIso],
  )
  let revenueCents = 0
  for (const r of wonRows) {
    const outcome = safeJsonParse<any>(r.outcome_json, null)
    const amount = Number(outcome?.amount_cents || 0)
    const wonAt = typeof outcome?.won_at === 'string' ? String(outcome.won_at) : null
    if (!wonAt || !Number.isFinite(amount) || amount <= 0) continue
    const wonAtMs = Date.parse(wonAt)
    if (!Number.isFinite(wonAtMs)) continue
    if (wonAtMs >= fromMs && wonAtMs <= now) revenueCents += amount
    const mk = wonAt.slice(0, 7)
    if (monthBuckets.has(mk)) monthBuckets.set(mk, (monthBuckets.get(mk) || 0) + amount)
  }

  const responseTimes = leads
    .filter((l) => l.first_human_response_at)
    .map((l) => (new Date(l.first_human_response_at).getTime() - new Date(l.created_at).getTime()) / 60000)
    .filter((v) => Number.isFinite(v))
  const responseAvg = responseTimes.length ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : null
  const respondedUnder10 = responseTimes.filter((v) => v < 10).length

  const events = await db.all<any>(
    'SELECT name, page_type, session_id, properties_json, utm_json, referrer FROM analytics_event WHERE business_id = ? AND created_at >= ?',
    [businessId, fromIso],
  )

  const sourceBuckets: Record<string, number> = { Google: 0, Facebook: 0, Instagram: 0, Direct: 0, Autre: 0 }
  const variantBuckets: Record<string, number> = { A: 0, B: 0, Unknown: 0 }
  const heroEvents: Record<string, Record<string, number>> = {
    A: { view_hero: 0, click_call: 0, click_whatsapp: 0, open_quote_form: 0, submit_quote_form: 0 },
    B: { view_hero: 0, click_call: 0, click_whatsapp: 0, open_quote_form: 0, submit_quote_form: 0 },
    Unknown: { view_hero: 0, click_call: 0, click_whatsapp: 0, open_quote_form: 0, submit_quote_form: 0 },
  }
  const uniqueSessions: Record<string, Record<string, Set<string>>> = {
    A: { view_hero: new Set(), click_call: new Set(), click_whatsapp: new Set(), open_quote_form: new Set(), submit_quote_form: new Set() },
    B: { view_hero: new Set(), click_call: new Set(), click_whatsapp: new Set(), open_quote_form: new Set(), submit_quote_form: new Set() },
    Unknown: { view_hero: new Set(), click_call: new Set(), click_whatsapp: new Set(), open_quote_form: new Set(), submit_quote_form: new Set() },
  }
  const sourceKeys = ['Google', 'Facebook', 'Instagram', 'Direct', 'Autre'] as const
  const uniqueBySource: Record<string, Record<string, { view: Set<string>; submit: Set<string> }>> = {
    A: Object.fromEntries(sourceKeys.map((k) => [k, { view: new Set<string>(), submit: new Set<string>() }])) as any,
    B: Object.fromEntries(sourceKeys.map((k) => [k, { view: new Set<string>(), submit: new Set<string>() }])) as any,
    Unknown: Object.fromEntries(sourceKeys.map((k) => [k, { view: new Set<string>(), submit: new Set<string>() }])) as any,
  }
  const submitBySource: Record<string, Record<string, number>> = {
    A: { Google: 0, Facebook: 0, Instagram: 0, Direct: 0, Autre: 0 },
    B: { Google: 0, Facebook: 0, Instagram: 0, Direct: 0, Autre: 0 },
    Unknown: { Google: 0, Facebook: 0, Instagram: 0, Direct: 0, Autre: 0 },
  }
  const submitByDevice: Record<string, Record<string, number>> = {
    A: { mobile: 0, desktop: 0, unknown: 0 },
    B: { mobile: 0, desktop: 0, unknown: 0 },
    Unknown: { mobile: 0, desktop: 0, unknown: 0 },
  }
  const submitByRequestType: Record<string, Record<string, number>> = {
    A: {},
    B: {},
    Unknown: {},
  }
  let callsClicks = 0
  let whatsappClicks = 0
  let formOpens = 0
  const urgencyBuckets: Record<string, number> = { now: 0, today: 0, week: 0 }
  const leadsByDay = new Map<string, number>()
  const wonLostByWeek = new Map<string, { won: number; lost: number }>()
  const clicksBySource: Record<string, { calls_clicks: number; whatsapp_clicks: number }> = Object.fromEntries(
    sourceKeys.map((k) => [k, { calls_clicks: 0, whatsapp_clicks: 0 }]),
  ) as any

  const experiments: Record<string, any> = Object.fromEntries(
    expKeys.map((k) => [
      k,
      {
        id: expIds[k],
        submits: { A: 0, B: 0, Unknown: 0 },
        views: { A: 0, B: 0, Unknown: 0 },
        unique: { A: { views: new Set<string>(), submits: new Set<string>() }, B: { views: new Set<string>(), submits: new Set<string>() }, Unknown: { views: new Set<string>(), submits: new Set<string>() } },
      },
    ]),
  )

  const pageKeys = ['home', 'services', 'zones', 'tarifs'] as const
  const heroEventsPages: Record<string, any> = Object.fromEntries(
    pageKeys.map((k) => [
      k,
      {
        heroEvents: {
          A: { view_hero: 0, click_call: 0, click_whatsapp: 0, open_quote_form: 0, submit_quote_form: 0 },
          B: { view_hero: 0, click_call: 0, click_whatsapp: 0, open_quote_form: 0, submit_quote_form: 0 },
          Unknown: { view_hero: 0, click_call: 0, click_whatsapp: 0, open_quote_form: 0, submit_quote_form: 0 },
        },
        uniqueSessions: {
          A: { view_hero: new Set(), click_call: new Set(), click_whatsapp: new Set(), open_quote_form: new Set(), submit_quote_form: new Set() },
          B: { view_hero: new Set(), click_call: new Set(), click_whatsapp: new Set(), open_quote_form: new Set(), submit_quote_form: new Set() },
          Unknown: { view_hero: new Set(), click_call: new Set(), click_whatsapp: new Set(), open_quote_form: new Set(), submit_quote_form: new Set() },
        },
      },
    ]),
  )

  function computeHeroStats(hero: any, uniq: any) {
    return {
      by_variant: hero,
      conversion: {
        A: hero.A.view_hero ? hero.A.submit_quote_form / hero.A.view_hero : null,
        B: hero.B.view_hero ? hero.B.submit_quote_form / hero.B.view_hero : null,
      },
      unique: {
        A: { view_hero_sessions: uniq.A.view_hero.size, submit_sessions: uniq.A.submit_quote_form.size, open_form_sessions: uniq.A.open_quote_form.size },
        B: { view_hero_sessions: uniq.B.view_hero.size, submit_sessions: uniq.B.submit_quote_form.size, open_form_sessions: uniq.B.open_quote_form.size },
      },
      unique_conversion: {
        A: uniq.A.view_hero.size ? uniq.A.submit_quote_form.size / uniq.A.view_hero.size : null,
        B: uniq.B.view_hero.size ? uniq.B.submit_quote_form.size / uniq.B.view_hero.size : null,
      },
    }
  }

  function erf(x: number) {
    const sign = x < 0 ? -1 : 1
    const a1 = 0.254829592
    const a2 = -0.284496736
    const a3 = 1.421413741
    const a4 = -1.453152027
    const a5 = 1.061405429
    const p = 0.3275911
    const ax = Math.abs(x)
    const t = 1 / (1 + p * ax)
    const y = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-ax * ax)
    return sign * y
  }

  function normalCdf(x: number) {
    return 0.5 * (1 + erf(x / Math.SQRT2))
  }

  function twoPropPValue(xA: number, nA: number, xB: number, nB: number) {
    if (!nA || !nB) return null
    const p = (xA + xB) / (nA + nB)
    const denom = Math.sqrt(p * (1 - p) * (1 / nA + 1 / nB))
    if (!Number.isFinite(denom) || denom === 0) return null
    const z = (xA / nA - xB / nB) / denom
    const pValue = 2 * (1 - normalCdf(Math.abs(z)))
    if (!Number.isFinite(pValue)) return null
    return Math.max(0, Math.min(1, pValue))
  }

  function decision(xA: number, nA: number, xB: number, nB: number, alpha: number, minViews: number, minSubmits: number) {
    const pValue = twoPropPValue(xA, nA, xB, nB)
    const totalViews = nA + nB
    const totalSubmits = xA + xB
    const eligible = nA >= minViews && nB >= minViews && totalSubmits >= minSubmits
    const significant = eligible && pValue !== null && pValue < alpha
    const rateA = nA ? xA / nA : null
    const rateB = nB ? xB / nB : null
    const winner = rateA !== null && rateB !== null ? (rateA >= rateB ? 'A' : 'B') : null
    return { p_value: pValue, eligible, significant, winner, rateA, rateB, nA, nB, xA, xB }
  }

  const quoteFormEventsPages: Record<string, any> = Object.fromEntries(
    pageKeys.map((k) => [
      k,
      {
        unique: {
          A: { open_quote_form: new Set(), submit_quote_form: new Set() },
          B: { open_quote_form: new Set(), submit_quote_form: new Set() },
          Unknown: { open_quote_form: new Set(), submit_quote_form: new Set() },
        },
      },
    ]),
  )
  const quoteFormOverall = {
    A: { open_quote_form: new Set<string>(), submit_quote_form: new Set<string>() },
    B: { open_quote_form: new Set<string>(), submit_quote_form: new Set<string>() },
    Unknown: { open_quote_form: new Set<string>(), submit_quote_form: new Set<string>() },
  }

  function primarySource(utmJson: string | null, referrer: string | null) {
    const utm = safeJsonParse<any>(utmJson, {})
    const src = String(utm.utm_source || '').toLowerCase()
    const ref = String(referrer || '').toLowerCase()
    if (src.includes('google') || ['gmb', 'gbp'].includes(src) || ref.includes('google.')) return 'Google'
    if (['facebook', 'fb', 'meta'].includes(src) || ref.includes('facebook.')) return 'Facebook'
    if (['instagram', 'ig'].includes(src) || ref.includes('instagram.')) return 'Instagram'
    if (!src && !ref) return 'Direct'
    return 'Autre'
  }

  for (const l of leads) {
    const attrib = safeJsonParse<any>(l.attribution_json, {})
    const s = primarySource(l.attribution_json, attrib?.referrer || null)
    sourceBuckets[s] = (sourceBuckets[s] || 0) + 1
    const u = String(l.urgency || '')
    if (u in urgencyBuckets) urgencyBuckets[u] += 1
    const day = String(l.created_at || '').slice(0, 10)
    if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) leadsByDay.set(day, (leadsByDay.get(day) || 0) + 1)
    const d = new Date(String(l.created_at || ''))
    if (Number.isFinite(d.getTime())) {
      const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
      const dow = (utc.getUTCDay() + 6) % 7
      utc.setUTCDate(utc.getUTCDate() - dow)
      const wk = utc.toISOString().slice(0, 10)
      if (!wonLostByWeek.has(wk)) wonLostByWeek.set(wk, { won: 0, lost: 0 })
      const cur = wonLostByWeek.get(wk)!
      if (l.status === 'won') cur.won += 1
      if (l.status === 'lost') cur.lost += 1
    }
  }

  for (const e of events) {
    const name = String(e.name || '')
    const pageType = String(e.page_type || '')
    const s = primarySource(e.utm_json, e.referrer)
    if (name === 'click_call') callsClicks += 1
    if (name === 'click_whatsapp') whatsappClicks += 1
    if (name === 'open_quote_form' || name === 'view_quote_form') formOpens += 1
    if (name === 'click_call') clicksBySource[s].calls_clicks += 1
    if (name === 'click_whatsapp') clicksBySource[s].whatsapp_clicks += 1

    if (!['view_hero', 'click_call', 'click_whatsapp', 'open_quote_form', 'view_quote_form', 'submit_quote_form'].includes(name))
      continue

    const props = safeJsonParse<any>(e.properties_json, {})
    const v = String(props?.variant || '')
    const bucket = v === 'A' || v === 'B' ? v : 'Unknown'

    const exp = props?.experiments && typeof props.experiments === 'object' ? props.experiments : null
    const expSid = String(e.session_id || '')
    if (exp && expSid) {
      for (const k of expKeys) {
        const cur = exp?.[k]
        const id = String(cur?.id || '')
        if (!id || id !== expIds[k]) continue
        const vb = cur?.variant === 'A' || cur?.variant === 'B' ? cur.variant : 'Unknown'
        const isView = k === 'quote_form' ? name === 'open_quote_form' || name === 'view_quote_form' : name === 'view_hero'
        const isSubmit = name === 'submit_quote_form'
        if (isView) {
          experiments[k].views[vb] = (experiments[k].views[vb] || 0) + 1
          experiments[k].unique[vb].views.add(expSid)
        }
        if (isSubmit) {
          experiments[k].submits[vb] = (experiments[k].submits[vb] || 0) + 1
          experiments[k].unique[vb].submits.add(expSid)
        }
      }
    }
    if (name in heroEvents[bucket]) heroEvents[bucket][name] = (heroEvents[bucket][name] || 0) + 1
    const sid = String(e.session_id || '')
    if (sid) {
      if (name in uniqueSessions[bucket]) uniqueSessions[bucket][name].add(sid)
      if (name === 'view_hero') uniqueBySource[bucket][s].view.add(sid)
      if (name === 'submit_quote_form') uniqueBySource[bucket][s].submit.add(sid)
    }
    if (name === 'submit_quote_form') {
      variantBuckets[bucket] = (variantBuckets[bucket] || 0) + 1
      submitBySource[bucket][s] = (submitBySource[bucket][s] || 0) + 1
      const device = String(props?.device || '')
      const deviceKey = device === 'mobile' || device === 'desktop' ? device : 'unknown'
      submitByDevice[bucket][deviceKey] = (submitByDevice[bucket][deviceKey] || 0) + 1
      const rt = String(props?.request_type || '')
      if (rt) submitByRequestType[bucket][rt] = (submitByRequestType[bucket][rt] || 0) + 1
    }

    if (pageType && pageType in heroEventsPages) {
      if (name in heroEventsPages[pageType].heroEvents[bucket]) heroEventsPages[pageType].heroEvents[bucket][name] = (heroEventsPages[pageType].heroEvents[bucket][name] || 0) + 1
      if (sid && name in heroEventsPages[pageType].uniqueSessions[bucket]) heroEventsPages[pageType].uniqueSessions[bucket][name].add(sid)
    }

    if (pageType && pageType in quoteFormEventsPages && sid) {
      if (name === 'open_quote_form' || name === 'view_quote_form') quoteFormEventsPages[pageType].unique[bucket].open_quote_form.add(sid)
      if (name === 'submit_quote_form') quoteFormEventsPages[pageType].unique[bucket].submit_quote_form.add(sid)
    }

    if (sid) {
      if (name === 'open_quote_form' || name === 'view_quote_form') quoteFormOverall[bucket].open_quote_form.add(sid)
      if (name === 'submit_quote_form') quoteFormOverall[bucket].submit_quote_form.add(sid)
    }
  }

  const winRate = quotesSent ? won / quotesSent : null

  const sigRules = {
    alpha: 0.05,
    hero_min_views: 50,
    hero_min_submits: 10,
    quote_form_min_views: 50,
    quote_form_min_submits: 10,
  }

  const sigHero = decision(
    uniqueSessions.A.submit_quote_form.size,
    uniqueSessions.A.view_hero.size,
    uniqueSessions.B.submit_quote_form.size,
    uniqueSessions.B.view_hero.size,
    sigRules.alpha,
    sigRules.hero_min_views,
    sigRules.hero_min_submits,
  )

  const sigQuoteForm = decision(
    quoteFormOverall.A.submit_quote_form.size,
    quoteFormOverall.A.open_quote_form.size,
    quoteFormOverall.B.submit_quote_form.size,
    quoteFormOverall.B.open_quote_form.size,
    sigRules.alpha,
    sigRules.quote_form_min_views,
    sigRules.quote_form_min_submits,
  )

  const sigHeroPages = Object.fromEntries(
    pageKeys.map((k) => [
      k,
      decision(
        heroEventsPages[k].uniqueSessions.A.submit_quote_form.size,
        heroEventsPages[k].uniqueSessions.A.view_hero.size,
        heroEventsPages[k].uniqueSessions.B.submit_quote_form.size,
        heroEventsPages[k].uniqueSessions.B.view_hero.size,
        sigRules.alpha,
        sigRules.hero_min_views,
        sigRules.hero_min_submits,
      ),
    ]),
  )

  const sigQuoteFormPages = Object.fromEntries(
    pageKeys.map((k) => [
      k,
      decision(
        quoteFormEventsPages[k].unique.A.submit_quote_form.size,
        quoteFormEventsPages[k].unique.A.open_quote_form.size,
        quoteFormEventsPages[k].unique.B.submit_quote_form.size,
        quoteFormEventsPages[k].unique.B.open_quote_form.size,
        sigRules.alpha,
        sigRules.quote_form_min_views,
        sigRules.quote_form_min_submits,
      ),
    ]),
  )

  const payload = {
    range,
    cards: {
      leads_total: leadsTotal,
      leads_qualified: qualified,
      leads_needs_followup: needsFollowup,
      calls_clicks: callsClicks,
      whatsapp_clicks: whatsappClicks,
      form_opens: formOpens,
      response_time_avg_minutes: responseAvg,
      response_under_10min_rate: leadsTotal ? respondedUnder10 / leadsTotal : null,
      leads_responded_under_10min: respondedUnder10,
      appointments,
      quotes_sent: quotesSent,
      won,
      lost,
      win_rate: winRate,
      revenue_cents: revenueCents,
    },
    charts: {
      leads_by_day: Array.from(leadsByDay.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([day, v]) => ({ day, leads_total: v })),
      urgency: urgencyBuckets,
      won_lost_by_week: Array.from(wonLostByWeek.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([week, v]) => ({ week, won: v.won, lost: v.lost })),
      clicks_by_source: clicksBySource,
      funnel: { form_opens: formOpens, leads_total: leadsTotal, leads_qualified: qualified },
      revenue_by_month: months.map((m) => ({ month: m, revenue_cents: monthBuckets.get(m) || 0 })),
    },
    sources: sourceBuckets,
    variants: variantBuckets,
    segments: {
      submits_by_device: submitByDevice,
      submits_by_request_type: submitByRequestType,
    },
    ab_hero: {
      by_variant: heroEvents,
      conversion: {
        A: heroEvents.A.view_hero ? heroEvents.A.submit_quote_form / heroEvents.A.view_hero : null,
        B: heroEvents.B.view_hero ? heroEvents.B.submit_quote_form / heroEvents.B.view_hero : null,
      },
      unique: {
        A: {
          view_hero_sessions: uniqueSessions.A.view_hero.size,
          submit_sessions: uniqueSessions.A.submit_quote_form.size,
          open_form_sessions: uniqueSessions.A.open_quote_form.size,
        },
        B: {
          view_hero_sessions: uniqueSessions.B.view_hero.size,
          submit_sessions: uniqueSessions.B.submit_quote_form.size,
          open_form_sessions: uniqueSessions.B.open_quote_form.size,
        },
      },
      unique_conversion: {
        A: uniqueSessions.A.view_hero.size ? uniqueSessions.A.submit_quote_form.size / uniqueSessions.A.view_hero.size : null,
        B: uniqueSessions.B.view_hero.size ? uniqueSessions.B.submit_quote_form.size / uniqueSessions.B.view_hero.size : null,
      },
      unique_by_source: {
        A: Object.fromEntries(
          sourceKeys.map((k) => [
            k,
            {
              view_sessions: uniqueBySource.A[k].view.size,
              submit_sessions: uniqueBySource.A[k].submit.size,
              conversion: uniqueBySource.A[k].view.size ? uniqueBySource.A[k].submit.size / uniqueBySource.A[k].view.size : null,
            },
          ]),
        ),
        B: Object.fromEntries(
          sourceKeys.map((k) => [
            k,
            {
              view_sessions: uniqueBySource.B[k].view.size,
              submit_sessions: uniqueBySource.B[k].submit.size,
              conversion: uniqueBySource.B[k].view.size ? uniqueBySource.B[k].submit.size / uniqueBySource.B[k].view.size : null,
            },
          ]),
        ),
      },
      rates: {
        A: {
          submit_per_view: heroEvents.A.view_hero ? heroEvents.A.submit_quote_form / heroEvents.A.view_hero : null,
          call_per_view: heroEvents.A.view_hero ? heroEvents.A.click_call / heroEvents.A.view_hero : null,
          whatsapp_per_view: heroEvents.A.view_hero ? heroEvents.A.click_whatsapp / heroEvents.A.view_hero : null,
          open_form_per_view: heroEvents.A.view_hero ? heroEvents.A.open_quote_form / heroEvents.A.view_hero : null,
          submit_per_open_form: heroEvents.A.open_quote_form ? heroEvents.A.submit_quote_form / heroEvents.A.open_quote_form : null,
        },
        B: {
          submit_per_view: heroEvents.B.view_hero ? heroEvents.B.submit_quote_form / heroEvents.B.view_hero : null,
          call_per_view: heroEvents.B.view_hero ? heroEvents.B.click_call / heroEvents.B.view_hero : null,
          whatsapp_per_view: heroEvents.B.view_hero ? heroEvents.B.click_whatsapp / heroEvents.B.view_hero : null,
          open_form_per_view: heroEvents.B.view_hero ? heroEvents.B.open_quote_form / heroEvents.B.view_hero : null,
          submit_per_open_form: heroEvents.B.open_quote_form ? heroEvents.B.submit_quote_form / heroEvents.B.open_quote_form : null,
        },
      },
      submit_by_source: submitBySource,
    },
    ab_hero_pages: Object.fromEntries(pageKeys.map((k) => [k, computeHeroStats(heroEventsPages[k].heroEvents, heroEventsPages[k].uniqueSessions)])),
    ab_quote_form_pages: Object.fromEntries(
      pageKeys.map((k) => [
        k,
        {
          unique: {
            A: { view_sessions: quoteFormEventsPages[k].unique.A.open_quote_form.size, submit_sessions: quoteFormEventsPages[k].unique.A.submit_quote_form.size },
            B: { view_sessions: quoteFormEventsPages[k].unique.B.open_quote_form.size, submit_sessions: quoteFormEventsPages[k].unique.B.submit_quote_form.size },
          },
          unique_conversion: {
            A: quoteFormEventsPages[k].unique.A.open_quote_form.size
              ? quoteFormEventsPages[k].unique.A.submit_quote_form.size / quoteFormEventsPages[k].unique.A.open_quote_form.size
              : null,
            B: quoteFormEventsPages[k].unique.B.open_quote_form.size
              ? quoteFormEventsPages[k].unique.B.submit_quote_form.size / quoteFormEventsPages[k].unique.B.open_quote_form.size
              : null,
          },
        },
      ]),
    ),
    ab_significance: {
      rules: sigRules,
      hero: sigHero,
      quote_form: sigQuoteForm,
      pages: {
        hero: sigHeroPages,
        quote_form: sigQuoteFormPages,
      },
    },
    experiments: Object.fromEntries(
      expKeys.map((k) => [
        k,
        {
          id: experiments[k].id,
          views: experiments[k].views,
          submits: experiments[k].submits,
          unique: {
            A: { view_sessions: experiments[k].unique.A.views.size, submit_sessions: experiments[k].unique.A.submits.size },
            B: { view_sessions: experiments[k].unique.B.views.size, submit_sessions: experiments[k].unique.B.submits.size },
          },
          unique_conversion: {
            A: experiments[k].unique.A.views.size ? experiments[k].unique.A.submits.size / experiments[k].unique.A.views.size : null,
            B: experiments[k].unique.B.views.size ? experiments[k].unique.B.submits.size / experiments[k].unique.B.views.size : null,
          },
          significance: decision(
            experiments[k].unique.A.submits.size,
            experiments[k].unique.A.views.size,
            experiments[k].unique.B.submits.size,
            experiments[k].unique.B.views.size,
            sigRules.alpha,
            k === 'quote_form' ? sigRules.quote_form_min_views : sigRules.hero_min_views,
            k === 'quote_form' ? sigRules.quote_form_min_submits : sigRules.hero_min_submits,
          ),
        },
      ]),
    ),
  } as any

  const format = String((req.query as any).format || '')
  if (format === 'csv') {
    const rows: string[] = []
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
    rows.push(['scope', 'page', 'variant', 'metric', 'value'].map(esc).join(','))

    for (const v of ['A', 'B', 'Unknown'] as const) {
      for (const [metric, value] of Object.entries(payload.ab_hero.by_variant?.[v] || {})) rows.push(['hero', 'all', v, metric, value].map(esc).join(','))
    }
    for (const v of ['A', 'B'] as const) {
      rows.push(['hero', 'all', v, 'unique_conversion', payload.ab_hero.unique_conversion?.[v]].map(esc).join(','))
      for (const [metric, value] of Object.entries(payload.ab_hero.rates?.[v] || {})) rows.push(['hero', 'all', v, metric, value].map(esc).join(','))
    }
    for (const p of pageKeys) {
      for (const v of ['A', 'B'] as const) {
        rows.push(['hero', p, v, 'unique_conversion', payload.ab_hero_pages?.[p]?.unique_conversion?.[v]].map(esc).join(','))
        rows.push(['quote_form', p, v, 'unique_conversion', payload.ab_quote_form_pages?.[p]?.unique_conversion?.[v]].map(esc).join(','))
      }
    }

    if (payload.experiments) {
      for (const [k, exp] of Object.entries<any>(payload.experiments)) {
        for (const v of ['A', 'B'] as const) {
          rows.push(['experiment', k, v, 'unique_conversion', exp?.unique_conversion?.[v]].map(esc).join(','))
        }
        rows.push(['experiment', k, 'all', 'p_value', exp?.significance?.p_value].map(esc).join(','))
        rows.push(['experiment', k, 'all', 'winner', exp?.significance?.winner].map(esc).join(','))
        rows.push(['experiment', k, 'all', 'significant', exp?.significance?.significant].map(esc).join(','))
      }
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="ab_${businessId}_${range}.csv"`)
    res.status(200).send(rows.join('\n'))
    return
  }

  res.status(200).json(payload)
})

router.get('/backoffice/:businessId/reporting/funnel', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return
  const db = await getDb()
  const range = String((req.query as any).range || 'last_7_days')
  const now = Date.now()
  const fromMs = range === 'last_30_days' ? now - 30 * 864e5 : range === 'month_to_date' ? new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime() : now - 7 * 864e5
  const fromIso = new Date(fromMs).toISOString()

  const leads = await db.all<any>('SELECT lead_id, status, first_human_response_at, created_at FROM lead WHERE business_id = ? AND created_at >= ?', [
    businessId,
    fromIso,
  ])
  const leadsTotal = leads.length
  const contacted = leads.filter((l) => l.first_human_response_at).length
  const won = leads.filter((l) => l.status === 'won').length

  const appointments = await db.all<any>('SELECT appointment_id FROM appointment WHERE business_id = ? AND start_at >= ? AND status != ?', [
    businessId,
    fromIso,
    'cancelled',
  ])

  res.status(200).json({
    range,
    funnel: {
      submit_quote_form: leadsTotal,
      leads_created: leadsTotal,
      leads_contacted: contacted,
      appointments_scheduled: appointments.length,
      won,
    },
  })
})

router.post('/backoffice/:businessId/site_audits', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return
  if (!(await mustHavePermission(req, res, businessId, 'audits_write'))) return

  const body = (req.body || {}) as any
  const sourceUrl = String(body.source_url || '').trim()
  if (!/^https?:\/\//i.test(sourceUrl)) {
    res.status(400).json({ success: false, error: 'Invalid source_url' })
    return
  }

  const db = await getDb()
  const auditId = newId()
  const token = crypto.randomBytes(32).toString('hex')
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
  const now = nowIso()

  await db.run(
    `INSERT INTO site_audit (audit_id, business_id, source_url, status, error, public_token_hash, audit_json, html_path, docx_path, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [auditId, businessId, sourceUrl, 'queued', null, tokenHash, null, null, null, now, now],
  )
  try {
    await db.run('UPDATE site_audit SET public_token_set_at = ? WHERE business_id = ? AND audit_id = ?', [now, businessId, auditId])
  } catch {}

  await addAudit(db, req, businessId, { action: 'site_audit.create', target_type: 'site_audit', target_id: auditId, data: { source_url: sourceUrl } })

  void enqueueSiteAudit({ auditId, businessId, sourceUrl, token, tokenHash })

  res.status(201).json({
    audit_id: auditId,
    status: 'queued',
    public_url: `/audit/${auditId}?t=${token}`,
    docx_url: `/api/v1/public/site_audits/${auditId}/docx?t=${token}`,
    pdf_url: `/api/v1/public/site_audits/${auditId}/pdf?t=${token}`,
  })
})

router.get('/backoffice/:businessId/site_audits', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return
  if (!(await mustHavePermission(req, res, businessId, 'audits_read'))) return

  const db = await getDb()
  const limit = Math.min(100, Math.max(1, Number((req.query as any).limit || 20)))
  const offset = Math.max(0, Number((req.query as any).offset || 0))
  const format = String((req.query as any).format || '').toLowerCase()
  const wantsCsv = format === 'csv'
  const includeArchived = String((req.query as any).include_archived || '') === '1'

  const params: any[] = [businessId]
  let where = 'business_id = ?'
  if (!includeArchived) where += ' AND archived_at IS NULL'

  const rows = await db.all<any>(
    `SELECT audit_id, source_url, status, error, audit_json, created_at, updated_at
     FROM site_audit
     WHERE ${where}
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  )

  if (wantsCsv) {
    const esc = (v: any) => {
      const s = String(v ?? '')
      return `"${s.replace(/"/g, '""')}"`
    }
    const header = [
      'audit_id',
      'source_url',
      'status',
      'error',
      'created_at',
      'updated_at',
      'mode',
      'score',
      'pages_present_contact',
      'pages_present_services',
      'pages_present_zones',
      'pages_present_tarifs',
    ].join(',')
    const lines = rows.map((r) => {
      const audit = safeJsonParse<any>(r.audit_json, null)
      const meta = audit?.meta && typeof audit.meta === 'object' ? audit.meta : {}
      const pp = meta?.pages_present && typeof meta.pages_present === 'object' ? meta.pages_present : {}
      return [
        esc(r.audit_id),
        esc(r.source_url),
        esc(r.status),
        esc(r.error || ''),
        esc(r.created_at),
        esc(r.updated_at),
        esc(meta?.mode || ''),
        esc(typeof meta?.score === 'number' ? meta.score : ''),
        esc(pp?.contact === true ? 1 : 0),
        esc(pp?.services === true ? 1 : 0),
        esc(pp?.zones === true ? 1 : 0),
        esc(pp?.tarifs === true ? 1 : 0),
      ].join(',')
    })

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="site_audits_${businessId}.csv"`)
    res.status(200).send([header, ...lines].join('\n'))
    return
  }

  res.status(200).json({
    items: rows.map((r) => ({
      audit_id: r.audit_id,
      source_url: r.source_url,
      status: r.status,
      error: r.error || null,
      created_at: r.created_at,
      updated_at: r.updated_at,
    })),
  })
})

router.post('/backoffice/:businessId/site_audits/:auditId/archive', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return
  if (!(await mustHavePermission(req, res, businessId, 'audits_write'))) return
  const auditId = String(req.params.auditId || '').trim()
  const archived = (req.body as any)?.archived === true
  if (!auditId) {
    res.status(400).json({ success: false, error: 'Invalid payload' })
    return
  }
  const db = await getDb()
  const row = await db.get<any>('SELECT audit_id FROM site_audit WHERE business_id = ? AND audit_id = ?', [businessId, auditId])
  if (!row) {
    res.status(404).json({ success: false, error: 'Not found' })
    return
  }
  const now = nowIso()
  await db.run('UPDATE site_audit SET archived_at = ?, updated_at = ? WHERE business_id = ? AND audit_id = ?', [archived ? now : null, now, businessId, auditId])
  await addAudit(db, req, businessId, { action: archived ? 'site_audit.archive' : 'site_audit.unarchive', target_type: 'site_audit', target_id: auditId })
  res.status(200).json({ success: true, archived })
})

router.get('/backoffice/:businessId/site_audits/:auditId', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return
  if (!(await mustHavePermission(req, res, businessId, 'audits_read'))) return

  const auditId = req.params.auditId
  const db = await getDb()
  const row = await db.get<any>(
    `SELECT audit_id, source_url, status, error, audit_json, html_path, docx_path, created_at, updated_at
     FROM site_audit
     WHERE business_id = ? AND audit_id = ?`,
    [businessId, auditId],
  )
  if (!row) {
    res.status(404).json({ success: false, error: 'Not found' })
    return
  }

  res.status(200).json({
    audit_id: row.audit_id,
    source_url: row.source_url,
    status: row.status,
    error: row.error || null,
    audit: safeJsonParse<any>(row.audit_json, null),
    has_html: Boolean(row.html_path),
    has_docx: Boolean(row.docx_path),
    created_at: row.created_at,
    updated_at: row.updated_at,
  })
})

router.get('/backoffice/:businessId/site_audits/:auditId/json', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return
  if (!(await mustHavePermission(req, res, businessId, 'audits_read'))) return

  const auditId = req.params.auditId
  const db = await getDb()
  const row = await db.get<any>('SELECT audit_id, audit_json FROM site_audit WHERE business_id = ? AND audit_id = ?', [businessId, auditId])
  if (!row) {
    res.status(404).json({ success: false, error: 'Not found' })
    return
  }
  const audit = safeJsonParse<any>(row.audit_json, null)
  if (!audit) {
    res.status(409).json({ success: false, error: 'Not ready' })
    return
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="audit_${row.audit_id}.json"`)
  res.status(200).send(JSON.stringify(audit, null, 2))
})

router.post('/backoffice/:businessId/site_audits/:auditId/public_link', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return
  if (!(await mustHavePermission(req, res, businessId, 'audits_write'))) return

  const auditId = req.params.auditId
  const db = await getDb()
  const existing = await db.get<any>('SELECT audit_id FROM site_audit WHERE business_id = ? AND audit_id = ?', [businessId, auditId])
  if (!existing) {
    res.status(404).json({ success: false, error: 'Not found' })
    return
  }

  const token = crypto.randomBytes(32).toString('hex')
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
  const now = nowIso()
  await db.run('UPDATE site_audit SET public_token_hash = ?, public_token_set_at = ?, updated_at = ? WHERE business_id = ? AND audit_id = ?', [
    tokenHash,
    now,
    now,
    businessId,
    auditId,
  ])

  await addAudit(db, req, businessId, { action: 'site_audit.public_link.rotate', target_type: 'site_audit', target_id: auditId })

  res.status(200).json({
    audit_id: auditId,
    public_url: `/audit/${auditId}?t=${token}`,
    docx_url: `/api/v1/public/site_audits/${auditId}/docx?t=${token}`,
    pdf_url: `/api/v1/public/site_audits/${auditId}/pdf?t=${token}`,
  })
})

router.delete('/backoffice/:businessId/site_audits/:auditId', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return
  if (!(await mustHavePermission(req, res, businessId, 'audits_write'))) return

  const auditId = req.params.auditId
  const db = await getDb()
  const row = await db.get<any>('SELECT audit_id, html_path, docx_path FROM site_audit WHERE business_id = ? AND audit_id = ?', [businessId, auditId])
  if (!row) {
    res.status(404).json({ success: false, error: 'Not found' })
    return
  }

  const htmlPath = String(row.html_path || '')
  const docxPath = String(row.docx_path || '')
  if (htmlPath.startsWith('blob:') || docxPath.startsWith('blob:')) {
    const { del } = await import('@vercel/blob')
    try {
      if (htmlPath.startsWith('blob:')) await del(htmlPath.slice('blob:'.length))
    } catch {}
    try {
      if (docxPath.startsWith('blob:')) await del(docxPath.slice('blob:'.length))
    } catch {}
  } else {
    const baseDir = path.join(process.cwd(), 'server', 'data', 'site_audits', auditId)
    try {
      if (fs.existsSync(baseDir)) fs.rmSync(baseDir, { recursive: true, force: true })
    } catch {}
  }

  await db.run('DELETE FROM site_audit WHERE business_id = ? AND audit_id = ?', [businessId, auditId])
  await addAudit(db, req, businessId, { action: 'site_audit.delete', target_type: 'site_audit', target_id: auditId })
  res.status(204).end()
})

export default router
