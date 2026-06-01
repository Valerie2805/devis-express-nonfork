import type { Request, Response } from 'express'
import { createRouter } from '../router.js'
import crypto from 'crypto'
import twilio from 'twilio'
import { getDb } from '../../db.js'
import { safeJsonParse } from '../../utils.js'

const router = createRouter()

function requireTwilio(req: Request, res: Response): boolean {
  const sig = req.header('x-twilio-signature')
  if (!sig) {
    res.status(401).json({ success: false, error: 'Unauthorized' })
    return false
  }
  if (process.env.TWILIO_SKIP_SIGNATURE === 'true') return true
  const authToken = process.env.TWILIO_AUTH_TOKEN || ''
  if (!authToken) {
    res.status(500).json({ success: false, error: 'Missing TWILIO_AUTH_TOKEN' })
    return false
  }

  const proto = String(req.header('x-forwarded-proto') || req.protocol || 'https').split(',')[0].trim()
  const host = String(req.header('x-forwarded-host') || req.header('host') || '').split(',')[0].trim()
  const url = `${proto}://${host}${req.originalUrl}`

  const params = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, any>
  const ok = twilio.validateRequest(authToken, String(sig), url, params)
  if (!ok) {
    res.status(401).json({ success: false, error: 'Unauthorized' })
    return false
  }

  return true
}

router.post('/twilio/status', async (req: Request, res: Response) => {
  if (!requireTwilio(req, res)) return

  const db = await getDb()
  const body = req.body as any
  const sid = String(body.MessageSid || body.SmsSid || '')
  const status = String(body.MessageStatus || body.SmsStatus || '')

  if (!sid) {
    res.status(400).json({ success: false, error: 'Missing MessageSid' })
    return
  }

  const mapped = status === 'failed' || status === 'undelivered' ? 'failed' : status === 'delivered' ? 'sent' : 'sent'
  await db.run('UPDATE message_log SET status = ? WHERE provider_message_id = ?', [mapped, sid])

  res.status(204).end()
})

router.post('/twilio/inbound', async (req: Request, res: Response) => {
  if (!requireTwilio(req, res)) return

  const db = await getDb()
  const body = req.body as any
  const from = String(body.From || '')
  const to = String(body.To || '')
  const text = String(body.Body || '')

  if (!from || !to) {
    res.status(400).json({ success: false, error: 'Missing From/To' })
    return
  }

  const business = await db.get<{ business_id: string; config_json: any }>('SELECT business_id, config_json FROM business WHERE phone_e164 = ? OR whatsapp_e164 = ? LIMIT 1', [
    to.replace('whatsapp:', ''),
    to.replace('whatsapp:', ''),
  ])

  if (!business) {
    res.status(204).end()
    return
  }

  const cfg = safeJsonParse<any>(business.config_json, {})
  const lead = await db.get<{ lead_id: string }>(
    'SELECT lead_id FROM lead WHERE business_id = ? AND phone_e164 = ? ORDER BY created_at DESC LIMIT 1',
    [business.business_id, from.replace('whatsapp:', '')],
  )

  const now = new Date().toISOString()
  const normalized = text.trim().toUpperCase()
  const isStop = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'ARRET', 'ARRÊT'].includes(normalized.split(/\s+/)[0] || '')

  if (lead?.lead_id) {
    if (isStop) {
      await db.run(
        'UPDATE lead SET sms_opt_in = ?, whatsapp_opt_in = ?, sms_opt_out_at = ?, last_inbound_at = ?, updated_at = ? WHERE business_id = ? AND lead_id = ?',
        [0, 0, now, now, now, business.business_id, lead.lead_id],
      )
    } else {
      await db.run('UPDATE lead SET last_inbound_at = ?, updated_at = ? WHERE business_id = ? AND lead_id = ?', [
        now,
        now,
        business.business_id,
        lead.lead_id,
      ])
    }
  }

  await db.run(
    `INSERT INTO analytics_event (
      event_id, business_id, session_id, trade_id, name, page_type, page_path,
      properties_json, utm_json, referrer, created_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?
    )`,
    [
      crypto.randomUUID(),
      business.business_id,
      `twilio:${from}`,
      String(cfg.trade_id || ''),
      isStop ? 'opt_out' : 'inbound_message',
      'backoffice',
      '/twilio/inbound',
      JSON.stringify({ lead_id: lead?.lead_id || null, from, to, text_length: text.length }),
      JSON.stringify({}),
      null,
      now,
    ],
  )

  res.status(204).end()
})

export default router
