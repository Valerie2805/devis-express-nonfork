import type { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { getDb } from '../../db.js'
import { newId, nowIso, normalizePhone, safeJsonParse } from '../../utils.js'
import { getFileStorageProvider } from '../../providers/fileStorageProvider.js'
import { buildDefaultAutomationConfig, runDueTasks } from '../../automation.js'
import { enqueueSiteAudit } from '../../siteAudit/runner.js'
import { createRouter } from '../router.js'

const router = createRouter()

function requireAdmin(req: Request, res: Response): boolean {
  const key = req.header('x-admin-key') || ''
  const expected = process.env.ADMIN_KEY || 'dev-admin'
  if (!key || key !== expected) {
    res.status(401).json({ success: false, error: 'Unauthorized' })
    return false
  }
  return true
}

function requireCron(req: Request, res: Response): boolean {
  const auth = req.header('authorization') || ''
  const cronSecret = process.env.CRON_SECRET || ''
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true

  const key = req.header('x-cron-key') || String((req.query as any).key || '')
  const expected = process.env.CRON_KEY || ''
  if (!expected || key !== expected) {
    res.status(401).json({ success: false, error: 'Unauthorized' })
    return false
  }
  return true
}

async function addSystemAudit(db: Awaited<ReturnType<typeof getDb>>, businessId: string, action: string, data?: any) {
  await db.run(
    `INSERT INTO audit_log (
      audit_id, business_id, actor_user_id, actor_role, action, target_type, target_id, data_json, ip, user_agent, created_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )`,
    [newId(), businessId, null, 'system', action, null, null, data ? JSON.stringify(data) : null, null, null, nowIso()],
  )
}

async function deleteLeadAssets(db: Awaited<ReturnType<typeof getDb>>, businessId: string, photosJson: string | null) {
  const photos = safeJsonParse<any[]>(photosJson, [])
  const storage = getFileStorageProvider()
  const assetIds = photos.map((p) => String(p?.asset_id || '')).filter(Boolean)
  const urls = photos.map((p) => String(p?.url || '')).filter(Boolean)

  for (const assetId of assetIds) {
    const asset = await db.get<{ asset_id: string; url: string; storage_key: string | null }>(
      'SELECT asset_id, url, storage_key FROM asset WHERE business_id = ? AND asset_id = ?',
      [businessId, assetId],
    )
    if (!asset) continue
    await storage.delete(asset.storage_key || asset.url)
    await db.run('DELETE FROM asset WHERE business_id = ? AND asset_id = ?', [businessId, assetId])
  }

  for (const url of urls) {
    if (!url) continue
    const asset = await db.get<{ asset_id: string; url: string; storage_key: string | null }>('SELECT asset_id, url, storage_key FROM asset WHERE business_id = ? AND url = ?', [
      businessId,
      url,
    ])
    if (!asset) continue
    await storage.delete(asset.storage_key || asset.url)
    await db.run('DELETE FROM asset WHERE business_id = ? AND asset_id = ?', [businessId, asset.asset_id])
  }
}

router.post('/admin/businesses', async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return

  const db = await getDb()
  const body = (req.body || {}) as any

  const tradeId = String(body.trade_id || '')
  const companyName = String(body.company_name || '')
  const city = String(body.city || '')
  const zoneLabel = String(body.zone_label || '')
  const phoneE164 = normalizePhone(String(body.phone || ''))
  const zones = Array.isArray(body.zone_list) ? body.zone_list.map((s: any) => String(s)) : []
  const travelFee = body.travel_fee ? String(body.travel_fee) : ''
  const diagnosticFee = body.diagnostic_fee ? String(body.diagnostic_fee) : ''
  const currentSiteUrl = body.current_site_url ? String(body.current_site_url).trim() : ''
  const goal = body.goal ? String(body.goal).trim() : ''

  if (!tradeId || !companyName || !city || !zoneLabel || !phoneE164 || zones.length === 0) {
    res.status(400).json({ success: false, error: 'Missing fields' })
    return
  }

  const businessId = newId()
  const now = nowIso()
  const password = String(body.owner_password || Math.random().toString(36).slice(2, 10))
  const passwordHash = bcrypt.hashSync(password, 10)
  const ownerEmail = body.owner_email ? String(body.owner_email).trim().toLowerCase() : null

  const config = {
    trade_id: tradeId,
    company_name: companyName,
    phone_e164: phoneE164,
    whatsapp_e164: body.whatsapp ? normalizePhone(String(body.whatsapp)) : phoneE164,
    email_notifications: body.email_notifications ? String(body.email_notifications) : null,
    city,
    zone_label: zoneLabel,
    zones: { mode: 'list', zone_list: zones, excluded_zones: [] },
    services: { top_services: Array.isArray(body.top_services) ? body.top_services.map(String) : [], all_services: [] },
    pricing: { travel_fee: travelFee, diagnostic_fee: diagnosticFee },
    availability: { mode: 'manual', next_slot_text: body.next_slot_text ? String(body.next_slot_text) : '' },
    branding: { primary_color: body.primary_color ? String(body.primary_color) : '#0f766e', tone: body.tone ? String(body.tone) : 'pro' },
    settings: {
      response_sla_minutes: 10,
      templates_enabled: true,
      tracking_enabled: true,
      onboarding: {
        current_site_url: currentSiteUrl && /^https?:\/\//i.test(currentSiteUrl) ? currentSiteUrl : null,
        goal: goal || null,
      },
      ...buildDefaultAutomationConfig(),
    },
  }

  await db.run(
    `INSERT INTO business (
      business_id, trade_id, company_name, phone_e164, whatsapp_e164, email_notifications,
      city, zone_label, config_json, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?
    )`,
    [
      businessId,
      tradeId,
      companyName,
      phoneE164,
      config.whatsapp_e164,
      config.email_notifications,
      city,
      zoneLabel,
      JSON.stringify(config),
      now,
      now,
    ],
  )

  await db.run(
    `INSERT INTO business_user (user_id, business_id, username, email, password_hash, role, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [newId(), businessId, 'owner', ownerEmail, passwordHash, 'owner', now],
  )

  let audit: { audit_id: string; status: string; public_url: string; docx_url: string } | null = null
  const sourceUrl = config?.settings?.onboarding?.current_site_url ? String(config.settings.onboarding.current_site_url).trim() : ''
  if (sourceUrl && /^https?:\/\//i.test(sourceUrl)) {
    const auditId = newId()
    const token = crypto.randomBytes(32).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    await db.run(
      `INSERT INTO site_audit (audit_id, business_id, source_url, status, error, public_token_hash, audit_json, html_path, docx_path, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [auditId, businessId, sourceUrl, 'queued', null, tokenHash, null, null, null, now, now],
    )
    try {
      await db.run('UPDATE site_audit SET public_token_set_at = ? WHERE business_id = ? AND audit_id = ?', [now, businessId, auditId])
    } catch {}
    await addSystemAudit(db, businessId, 'site_audit.auto_create', { source_url: sourceUrl, audit_id: auditId })
    void enqueueSiteAudit({ auditId, businessId, sourceUrl, token, tokenHash })
    audit = {
      audit_id: auditId,
      status: 'queued',
      public_url: `/audit/${auditId}?t=${token}`,
      docx_url: `/api/v1/public/site_audits/${auditId}/docx?t=${token}`,
    }
  }

  res.status(201).json({ business_id: businessId, owner_username: 'owner', owner_email: ownerEmail, owner_password: password, audit })
})

router.post('/admin/purge_leads', async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return
  const days = Number(((req.body || {}) as any).days || 0)
  if (!Number.isFinite(days) || days <= 0) {
    res.status(400).json({ success: false, error: 'Invalid days' })
    return
  }
  const cutoff = new Date(Date.now() - days * 864e5).toISOString()
  const db = await getDb()
  const leads = await db.all<{ business_id: string; lead_id: string; photos_json: string | null }>('SELECT business_id, lead_id, photos_json FROM lead WHERE created_at < ?', [
    cutoff,
  ])
  for (const l of leads) {
    await deleteLeadAssets(db, l.business_id, l.photos_json)
    await db.run('DELETE FROM message_log WHERE business_id = ? AND lead_id = ?', [l.business_id, l.lead_id])
  }
  await db.run('DELETE FROM lead WHERE created_at < ?', [cutoff])
  res.status(200).json({ deleted: leads.length })
})

router.post('/admin/cron/retention', async (req: Request, res: Response) => {
  if (!requireCron(req, res)) return
  const db = await getDb()

  const defaultDays = Number(process.env.RETENTION_DAYS || '0')
  const mode = (process.env.RETENTION_MODE || 'anonymize') as 'anonymize' | 'delete'

  const businesses = await db.all<{ business_id: string; config_json: string }>('SELECT business_id, config_json FROM business', [])
  let affected = 0

  for (const b of businesses) {
    const cfg = safeJsonParse<any>(b.config_json, {})
    const days = Number(cfg?.settings?.retention_days ?? defaultDays)
    if (!Number.isFinite(days) || days <= 0) continue

    const cutoff = new Date(Date.now() - days * 864e5).toISOString()
    const leads = await db.all<{ lead_id: string; photos_json: string | null }>('SELECT lead_id, photos_json FROM lead WHERE business_id = ? AND created_at < ? AND status != ?', [
      b.business_id,
      cutoff,
      'deleted',
    ])
    if (leads.length === 0) continue

    if (mode === 'delete') {
      for (const l of leads) {
        await deleteLeadAssets(db, b.business_id, l.photos_json)
        await db.run('DELETE FROM message_log WHERE business_id = ? AND lead_id = ?', [b.business_id, l.lead_id])
      }
      await db.run('DELETE FROM lead WHERE business_id = ? AND created_at < ? AND status != ?', [b.business_id, cutoff, 'deleted'])
      affected += leads.length
      await addSystemAudit(db, b.business_id, 'retention.delete', { days, cutoff, count: leads.length })
      continue
    }

    const now = nowIso()
    for (const l of leads) {
      await deleteLeadAssets(db, b.business_id, l.photos_json)
    }
    await db.run(
      `UPDATE lead SET
        first_name = ?, phone_e164 = ?, email = ?, address = ?, description = ?,
        photos_json = ?, photos_count = ?, answers_json = ?, attribution_json = ?,
        status = ?, updated_at = ?
       WHERE business_id = ? AND created_at < ? AND status != ?`,
      ['', 'deleted', null, null, null, '[]', 0, '{}', '{}', 'deleted', now, b.business_id, cutoff, 'deleted'],
    )
    await db.run('UPDATE message_log SET rendered_text = ? WHERE business_id = ? AND lead_id IN (SELECT lead_id FROM lead WHERE business_id = ? AND created_at < ?)', [
      '[redacted]',
      b.business_id,
      b.business_id,
      cutoff,
    ])
    affected += leads.length
    await addSystemAudit(db, b.business_id, 'retention.anonymize', { days, cutoff, count: leads.length })
  }

  res.status(200).json({ affected })
})

router.post('/admin/cron/cleanup_assets', async (req: Request, res: Response) => {
  if (!requireCron(req, res)) return
  const db = await getDb()
  const storage = getFileStorageProvider()

  const businessId = String(((req.body || {}) as any).business_id || String((req.query as any).business_id || '')).trim()
  const dryRun = String(((req.body || {}) as any).dry_run ?? String((req.query as any).dry_run || '')).toLowerCase() === 'true'
  const limitRaw = Number(((req.body || {}) as any).limit ?? Number((req.query as any).limit || 200))
  const limit = Number.isFinite(limitRaw) ? Math.min(10_000, Math.max(1, limitRaw)) : 200
  const onlyOrphans = true

  const businesses = businessId
    ? await db.all<{ business_id: string }>('SELECT business_id FROM business WHERE business_id = ?', [businessId])
    : await db.all<{ business_id: string }>('SELECT business_id FROM business', [])

  let deleted = 0
  const wouldDelete: Array<{ business_id: string; asset_id: string; url: string; storage_key: string | null }> = []

  for (const b of businesses) {
    let perBusinessDeleted = 0
    const referencedAssetIds = new Set<string>()
    const referencedUrls = new Set<string>()

    const leads = await db.all<{ photos_json: string | null }>('SELECT photos_json FROM lead WHERE business_id = ?', [b.business_id])
    for (const l of leads) {
      const photos = safeJsonParse<any[]>(l.photos_json, [])
      for (const p of photos) {
        const aid = String(p?.asset_id || '')
        if (aid) referencedAssetIds.add(aid)
        const url = String(p?.url || '')
        if (url) referencedUrls.add(url)
      }
    }

    const gallery = await db.all<{ url: string }>('SELECT url FROM business_gallery_photo WHERE business_id = ?', [b.business_id])
    for (const g of gallery) referencedUrls.add(String(g.url || ''))

    const assets = await db.all<{ asset_id: string; url: string; storage_key: string | null }>(
      "SELECT asset_id, url, storage_key FROM asset WHERE business_id = ? AND kind IN ('lead_photo','gallery_photo')",
      [b.business_id],
    )

    for (const a of assets) {
      if (dryRun && wouldDelete.length >= limit) break
      if (!dryRun && deleted >= limit) break
      const keep = referencedAssetIds.has(a.asset_id) || referencedUrls.has(a.url)
      if (onlyOrphans && keep) continue
      if (dryRun) {
        wouldDelete.push({ business_id: b.business_id, asset_id: a.asset_id, url: a.url, storage_key: a.storage_key || null })
      } else {
        await storage.delete(a.storage_key || a.url)
        await db.run('DELETE FROM asset WHERE business_id = ? AND asset_id = ?', [b.business_id, a.asset_id])
        deleted += 1
        perBusinessDeleted += 1
      }
    }

    if (!dryRun && perBusinessDeleted) {
      await addSystemAudit(db, b.business_id, 'asset.cleanup', { deleted: perBusinessDeleted })
    }
  }

  if (dryRun) {
    res.status(200).json({ would_delete: wouldDelete, count: wouldDelete.length, limit })
    return
  }
  res.status(200).json({ deleted, limit })
})

router.post('/admin/cron/cleanup_site_audits', async (req: Request, res: Response) => {
  if (!requireCron(req, res)) return
  const db = await getDb()
  const dryRun = String(((req.body || {}) as any).dry_run ?? String((req.query as any).dry_run || '')).toLowerCase() === 'true'
  const daysRaw = Number(((req.body || {}) as any).days ?? Number((req.query as any).days || 45))
  const days = Number.isFinite(daysRaw) && daysRaw > 0 ? Math.min(3650, daysRaw) : 45
  const cutoff = new Date(Date.now() - days * 864e5).toISOString()
  const limitRaw = Number(((req.body || {}) as any).limit ?? Number((req.query as any).limit || 200))
  const limit = Number.isFinite(limitRaw) ? Math.min(10_000, Math.max(1, limitRaw)) : 200

  const rows = await db.all<any>(
    'SELECT audit_id, business_id, created_at, html_path, docx_path FROM site_audit WHERE created_at < ? ORDER BY created_at ASC LIMIT ?',
    [cutoff, limit],
  )

  if (dryRun) {
    res.status(200).json({ cutoff, days, would_delete: rows.map((r) => ({ audit_id: r.audit_id, business_id: r.business_id, created_at: r.created_at })), count: rows.length, limit })
    return
  }

  let deleted = 0
  for (const r of rows) {
    const htmlPath = String(r.html_path || '')
    const docxPath = String(r.docx_path || '')
    if (htmlPath.startsWith('blob:') || docxPath.startsWith('blob:')) {
      const { del } = await import('@vercel/blob')
      try {
        if (htmlPath.startsWith('blob:')) await del(htmlPath.slice('blob:'.length))
      } catch {}
      try {
        if (docxPath.startsWith('blob:')) await del(docxPath.slice('blob:'.length))
      } catch {}
    } else {
      const dir = path.join(process.cwd(), 'server', 'data', 'site_audits', String(r.audit_id))
      try {
        if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
      } catch {}
    }
    await db.run('DELETE FROM site_audit WHERE audit_id = ?', [r.audit_id])
    deleted += 1
    await addSystemAudit(db, r.business_id, 'site_audit.cleanup', { audit_id: r.audit_id, cutoff })
  }

  res.status(200).json({ cutoff, days, deleted, limit })
})

router.post('/admin/cron/automation', async (req: Request, res: Response) => {
  if (!requireCron(req, res)) return
  const db = await getDb()
  const businessId = String(((req.body || {}) as any).business_id || String((req.query as any).business_id || '')).trim()
  const limitRaw = Number(((req.body || {}) as any).limit ?? Number((req.query as any).limit || 200))
  const limit = Number.isFinite(limitRaw) ? Math.min(10_000, Math.max(1, limitRaw)) : 200

  const businesses = businessId
    ? await db.all<{ business_id: string; config_json: string }>('SELECT business_id, config_json FROM business WHERE business_id = ?', [businessId])
    : await db.all<{ business_id: string; config_json: string }>('SELECT business_id, config_json FROM business', [])

  let processed = 0
  let sent = 0
  let skipped = 0
  let failed = 0

  for (const b of businesses) {
    const cfg = safeJsonParse<any>(b.config_json, {})
    const r = await runDueTasks(db, b.business_id, cfg, limit)
    processed += r.processed
    sent += r.sent
    skipped += r.skipped
    failed += r.failed
    if (r.processed) {
      await addSystemAudit(db, b.business_id, 'automation.run', { processed: r.processed, sent: r.sent, skipped: r.skipped, failed: r.failed })
    }
  }

  res.status(200).json({ processed, sent, skipped, failed })
})

export default router
