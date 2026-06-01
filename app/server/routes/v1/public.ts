import type { Request, Response } from 'express'
import crypto from 'crypto'
import { get as blobGet } from '@vercel/blob'
import { Readable } from 'stream'
import { getDb } from '../../db.js'
import { safeJsonParse } from '../../utils.js'
import { buildAuditHtml } from '../../siteAudit/templates.js'
import { buildAuditPdf } from '../../siteAudit/pdf.js'
import { createRouter } from '../router.js'
import publicPortalRoutes from './public.portal.js'

const router = createRouter()
router.use(publicPortalRoutes)

function tokenOk(storedHash: string, provided: string) {
  const computed = crypto.createHash('sha256').update(provided).digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(storedHash, 'hex'), Buffer.from(computed, 'hex'))
  } catch {
    return false
  }
}

function isExpired(row: any) {
  const ttlDaysRaw = Number(process.env.PUBLIC_AUDIT_TTL_DAYS || '30')
  const ttlDays = Number.isFinite(ttlDaysRaw) && ttlDaysRaw > 0 ? ttlDaysRaw : 30
  const base = String(row.public_token_set_at || row.updated_at || row.created_at || '')
  if (!base) return false
  const ts = new Date(base).getTime()
  if (!Number.isFinite(ts)) return false
  return Date.now() > ts + ttlDays * 864e5
}

async function mustGetAudit(req: Request, res: Response) {
  const auditId = String(req.params.auditId || '').trim()
  const token = String((req.query as any).t || '').trim()
  if (!auditId || !token) {
    res.status(404).json({ success: false, error: 'Not found' })
    return null
  }

  const db = await getDb()
  const row = await db.get<any>(
    'SELECT audit_id, business_id, status, public_token_hash, public_token_set_at, audit_json, html_path, docx_path, source_url, created_at, updated_at FROM site_audit WHERE audit_id = ?',
    [auditId],
  )
  if (!row) {
    res.status(404).json({ success: false, error: 'Not found' })
    return null
  }

  if (!tokenOk(String(row.public_token_hash || ''), token)) {
    res.status(404).json({ success: false, error: 'Not found' })
    return null
  }

  if (isExpired(row)) {
    res.status(404).json({ success: false, error: 'Not found' })
    return null
  }

  return row
}

async function sendBlob(res: Response, blobRef: string, contentType: string, contentDisposition?: string) {
  const pathname = blobRef.startsWith('blob:') ? blobRef.slice('blob:'.length) : blobRef
  const out = await blobGet(pathname, { access: 'private' })
  if (!out || out.statusCode !== 200 || !out.stream) {
    res.status(409).json({ success: false, error: 'Not ready' })
    return
  }
  res.setHeader('Content-Type', contentType)
  if (contentDisposition) res.setHeader('Content-Disposition', contentDisposition)
  const s = Readable.fromWeb(out.stream as any)
  s.pipe(res)
}

router.get('/public/site_audits/:auditId', async (req: Request, res: Response) => {
  const row = await mustGetAudit(req, res)
  if (!row) return
  res.status(200).json({
    audit_id: row.audit_id,
    status: row.status,
    source_url: row.source_url,
    audit: safeJsonParse<any>(row.audit_json, null),
    created_at: row.created_at,
    updated_at: row.updated_at,
  })
})

router.get('/public/site_audits/:auditId/html', async (req: Request, res: Response) => {
  const row = await mustGetAudit(req, res)
  if (!row) return

  if (row.html_path) {
    if (String(row.html_path).startsWith('blob:')) {
      await sendBlob(res, String(row.html_path), 'text/html; charset=utf-8')
      return
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.sendFile(row.html_path)
    return
  }

  const audit = safeJsonParse<any>(row.audit_json, null)
  if (!audit) {
    res.status(409).json({ success: false, error: 'Not ready' })
    return
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.status(200).send(buildAuditHtml(audit))
})

router.get('/public/site_audits/:auditId/docx', async (req: Request, res: Response) => {
  const row = await mustGetAudit(req, res)
  if (!row) return
  if (!row.docx_path) {
    res.status(409).json({ success: false, error: 'Not ready' })
    return
  }
  if (String(row.docx_path).startsWith('blob:')) {
    await sendBlob(
      res,
      String(row.docx_path),
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      `attachment; filename="audit_${row.audit_id}.docx"`,
    )
    return
  }
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  res.setHeader('Content-Disposition', `attachment; filename="audit_${row.audit_id}.docx"`)
  res.sendFile(row.docx_path)
})

router.get('/public/site_audits/:auditId/json', async (req: Request, res: Response) => {
  const row = await mustGetAudit(req, res)
  if (!row) return
  const audit = safeJsonParse<any>(row.audit_json, null)
  if (!audit) {
    res.status(409).json({ success: false, error: 'Not ready' })
    return
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="audit_${row.audit_id}.json"`)
  res.status(200).send(JSON.stringify(audit, null, 2))
})

router.get('/public/site_audits/:auditId/pdf', async (req: Request, res: Response) => {
  const row = await mustGetAudit(req, res)
  if (!row) return
  const audit = safeJsonParse<any>(row.audit_json, null)
  if (!audit) {
    res.status(409).json({ success: false, error: 'Not ready' })
    return
  }
  const pdf = await buildAuditPdf(audit)
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="audit_${row.audit_id}.pdf"`)
  res.status(200).send(pdf)
})

export default router
