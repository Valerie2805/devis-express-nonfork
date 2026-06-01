import type { Request, Response } from 'express'
import { getDb } from '../../db.js'
import { nowIso, newId } from '../../utils.js'
import { sendResendEmail } from '../../prospection/resend.js'
import { verifyMailgunSignature } from '../../prospection/mailgun.js'
import { parseInboundAlias } from '../../prospection/utils.js'
import { getPlaceDetails, searchPlaces } from '../../prospection/places.js'
import { upsertCompanyProfile } from '../../company/companyProfile.js'
import { lookupEffectifsFromInsee } from '../../company/inseeSearch.js'
import { requireInternalAuth } from '../../internal/middleware.js'
import { createRouter } from '../router.js'

const router = createRouter()

export async function sendProspectEmailHandler(req: Request, res: Response) {
  const prospectId = String(req.params.prospectId || '').trim()
  const { to_email, subject, text, html } = (req.body || {}) as { to_email?: string; subject?: string; text?: string; html?: string }
  if (!prospectId || !to_email || !subject || !text) {
    res.status(400).json({ success: false, error: 'Invalid payload' })
    return
  }

  const providerMessageId = await sendResendEmail({ prospectId, to: to_email, subject, text, html })

  const db = await getDb()
  const now = nowIso()
  await db.run(
    `INSERT INTO prospect_message (
      message_id, prospect_id, direction, provider, provider_message_id,
      from_email, to_email, subject, text, html, headers_json, created_at
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?
    )`,
    [
      newId(),
      prospectId,
      'outbound',
      'resend',
      providerMessageId,
      process.env.RESEND_FROM_EMAIL || null,
      to_email,
      subject,
      text,
      html || null,
      null,
      now,
    ],
  )

  res.status(200).json({ provider_message_id: providerMessageId })
}

export async function inboundEmailHandler(req: Request, res: Response) {
  const signingKey = String(process.env.MAILGUN_SIGNING_KEY || '').trim()
  if (!signingKey) {
    res.status(500).json({ success: false, error: 'Missing MAILGUN_SIGNING_KEY' })
    return
  }

  const b = (req.body || {}) as any
  const ok = verifyMailgunSignature({ timestamp: b.timestamp, token: b.token, signature: b.signature }, signingKey)
  if (!ok) {
    res.status(401).json({ success: false, error: 'Unauthorized' })
    return
  }

  const inboundDomain = String(process.env.MAILGUN_INBOUND_DOMAIN || '').trim()
  const recipientRaw = String(b.recipient || b.to || b.To || '')
  const recipients = recipientRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const prospectId = recipients.map((r) => parseInboundAlias(r, inboundDomain)).find(Boolean) || null
  if (!prospectId) {
    res.sendStatus(204)
    return
  }

  const fromEmail = String(b.sender || b.from || '')
  const subject = String(b.subject || '')
  const text = String(b['stripped-text'] || b['body-plain'] || b['body_plain'] || '')
  const html = b['body-html'] || b['body_html'] || null
  const providerMessageId = String(b['Message-Id'] || b['message-id'] || b['message_id'] || '').trim() || null

  const db = await getDb()
  const now = nowIso()

  await db.run(
    `INSERT INTO prospect_message (
      message_id, prospect_id, direction, provider, provider_message_id,
      from_email, to_email, subject, text, html, headers_json, created_at
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?
    )`,
    [newId(), prospectId, 'inbound', 'mailgun', providerMessageId, fromEmail || null, recipientRaw || null, subject || null, text || null, html, null, now],
  )

  await db.run(
    `UPDATE prospect
     SET status = CASE WHEN status IN ('won', 'lost', 'do_not_contact') THEN status ELSE 'replied' END,
         updated_at = ?
     WHERE prospect_id = ?`,
    [now, prospectId],
  )

  await db.run(`UPDATE prospect_task SET status = 'canceled', updated_at = ? WHERE prospect_id = ? AND status = 'queued'`, [now, prospectId])

  res.sendStatus(204)
}

export async function searchPlacesHandler(req: Request, res: Response) {
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
}

function prospectIdFromPlaceId(placeId: string) {
  return `gp_${placeId}`
}

export async function importPlacesHandler(req: Request, res: Response) {
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
      let inferredHc = hc
      if (!inferredHc) {
        const inferred = await lookupEffectifsFromInsee({ name: d.name, address: d.address })
        if (inferred?.headcount_range) inferredHc = inferred.headcount_range
      }
      if (inferredHc || revenueEur !== null) {
        await upsertCompanyProfile(db, { prospect_id: prospectId }, { headcount_range: inferredHc || undefined, annual_revenue_eur: revenueEur ?? undefined })
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
}

export async function listProspectsHandler(req: Request, res: Response) {
  const status = String((req.query as any)?.status || '').trim()
  const limitRaw = Number((req.query as any)?.limit || 50)
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, Math.floor(limitRaw))) : 50

  const db = await getDb()
  const items = await db.all<any>(
    `SELECT prospect_id, place_id, name, trade_id, phone, website, address, city, lat, lng, rating, reviews_count, status, updated_at
     FROM prospect
     WHERE (? = '' OR status = ?)
     ORDER BY updated_at DESC
     LIMIT ?`,
    [status, status, limit],
  )
  res.status(200).json({ items })
}

export async function listInboxThreadsHandler(req: Request, res: Response) {
  const limitRaw = Number((req.query as any)?.limit || 100)
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, Math.floor(limitRaw))) : 100
  const db = await getDb()
  const items = await db.all<any>(
    `SELECT
       p.prospect_id as prospect_id,
       p.name as name,
       m.created_at as last_at,
       m.direction as last_direction,
       m.subject as last_subject
     FROM prospect p
     JOIN (
       SELECT prospect_id, MAX(created_at) AS last_at
       FROM prospect_message
       GROUP BY prospect_id
     ) lm ON lm.prospect_id = p.prospect_id
     JOIN prospect_message m ON m.prospect_id = lm.prospect_id AND m.created_at = lm.last_at
     ORDER BY m.created_at DESC
     LIMIT ?`,
    [limit],
  )
  res.status(200).json({ items })
}

export async function listInboxMessagesHandler(req: Request, res: Response) {
  const prospectId = String(req.params.prospectId || '').trim()
  if (!prospectId) {
    res.status(400).json({ success: false, error: 'Invalid payload' })
    return
  }
  const db = await getDb()
  const items = await db.all<any>(
    `SELECT
       message_id, direction, provider, from_email, to_email, subject, text, html, created_at
     FROM prospect_message
     WHERE prospect_id = ?
     ORDER BY created_at ASC`,
    [prospectId],
  )
  res.status(200).json({ items })
}

router.post('/internal/prospection/prospects/:prospectId/send', requireInternalAuth, sendProspectEmailHandler)
router.post('/internal/prospection/inbound-email', inboundEmailHandler)
router.post('/internal/prospection/search_places', requireInternalAuth, searchPlacesHandler)
router.post('/internal/prospection/import_places', requireInternalAuth, importPlacesHandler)
router.get('/internal/prospection/prospects', requireInternalAuth, listProspectsHandler)
router.get('/internal/prospection/inbox', requireInternalAuth, listInboxThreadsHandler)
router.get('/internal/prospection/inbox/:prospectId', requireInternalAuth, listInboxMessagesHandler)

export default router
