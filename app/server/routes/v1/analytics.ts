import type { Request, Response } from 'express'
import { getDb } from '../../db.js'
import { newId, nowIso } from '../../utils.js'
import { createRouter } from '../router.js'

const router = createRouter()

const blockedKeys = new Set(['phone', 'email', 'address', 'first_name', 'firstName', 'phone_e164'])
const WINDOW_MS = 5 * 60 * 1000
const rate = new Map<string, { ts: number; count: number; views: number }>()

function hasBlockedKey(obj: any): boolean {
  if (!obj || typeof obj !== 'object') return false
  for (const k of Object.keys(obj)) {
    if (blockedKeys.has(k)) return true
    const v = obj[k]
    if (typeof v === 'object' && v !== null && hasBlockedKey(v)) return true
  }
  return false
}

function getIp(req: Request) {
  const xf = String(req.headers['x-forwarded-for'] || '')
  if (xf) return xf.split(',')[0].trim()
  return req.ip || ''
}

router.post('/analytics/:businessId/events', async (req: Request, res: Response) => {
  const db = await getDb()
  const businessId = req.params.businessId
  const body = (req.body || {}) as any

  const ua = String(req.headers['user-agent'] || '')
  if (process.env.NODE_ENV === 'production' && /(bot|spider|crawl|lighthouse|headless|prerender|slurp)/i.test(ua)) {
    res.status(204).end()
    return
  }

  const ip = getIp(req)
  if (ip) {
    const k = `${businessId}:${ip}`
    const now = Date.now()
    const cur = rate.get(k)
    const name = String(body.name || '')
    const isView = name.startsWith('view_')
    if (!cur || now - cur.ts > WINDOW_MS) {
      rate.set(k, { ts: now, count: 1, views: isView ? 1 : 0 })
    } else {
      cur.count += 1
      if (isView) cur.views += 1
      if (cur.count > 500 || cur.views > 200) {
        res.status(429).end()
        return
      }
    }
  }

  if (hasBlockedKey(body.properties) || hasBlockedKey(body)) {
    res.status(400).json({ success: false, error: 'PII not allowed' })
    return
  }

  const sessionId = String(body.session_id || '')
  const tradeId = String(body.trade_id || '')
  const name = String(body.name || '')
  const pageType = String(body.page_type || '')
  const pagePath = String(body.page_path || '')
  if (!sessionId || sessionId.length < 6 || sessionId.length > 128) {
    res.status(400).json({ success: false, error: 'Invalid session' })
    return
  }
  if (!tradeId || tradeId.length > 64 || !name || name.length > 64) {
    res.status(400).json({ success: false, error: 'Invalid event' })
    return
  }
  if (pageType.length > 32 || pagePath.length > 512) {
    res.status(400).json({ success: false, error: 'Invalid page' })
    return
  }
  const propsJson = JSON.stringify(body.properties || {})
  if (propsJson.length > 25_000) {
    res.status(400).json({ success: false, error: 'Properties too large' })
    return
  }

  const eventId = newId()
  await db.run(
    `INSERT INTO analytics_event (
      event_id, business_id, session_id, trade_id, name, page_type, page_path,
      properties_json, utm_json, referrer, created_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?
    )`,
    [
      eventId,
      businessId,
      sessionId,
      tradeId,
      name,
      pageType,
      pagePath,
      propsJson,
      JSON.stringify(body.utm || {}),
      body.referrer ? String(body.referrer) : null,
      nowIso(),
    ],
  )

  res.status(204).end()
})

export default router
