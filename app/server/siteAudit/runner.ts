import fs from 'fs'
import path from 'path'
import { put } from '@vercel/blob'
import { getDb } from '../db.js'
import { nowIso } from '../utils.js'
import { buildAuditHtml } from './templates.js'
import { generateSiteAudit } from './siteAudit.js'
import { buildAuditDocx } from './docx.js'

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

export async function enqueueSiteAudit(input: { auditId: string; businessId: string; sourceUrl: string; token: string; tokenHash: string }) {
  const { auditId, businessId, sourceUrl, tokenHash } = input
  const db = await getDb()
  const now = nowIso()
  await db.run('UPDATE site_audit SET status = ?, error = ?, updated_at = ? WHERE business_id = ? AND audit_id = ?', ['running', null, now, businessId, auditId])

  try {
    const audit = await generateSiteAudit({ auditId, businessId, sourceUrl })
    const html = buildAuditHtml(audit)
    const docx = await buildAuditDocx(audit)

    let htmlPath: string | null = null
    let docxPath: string | null = null
    if (String(process.env.VERCEL || '').trim()) {
      const htmlBlob = await put(`site_audits/${auditId}/audit.html`, Buffer.from(html, 'utf8'), {
        access: 'private',
        contentType: 'text/html; charset=utf-8',
        addRandomSuffix: false,
      })
      const docxBlob = await put(`site_audits/${auditId}/audit.docx`, docx, {
        access: 'private',
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        addRandomSuffix: false,
      })
      htmlPath = `blob:${htmlBlob.pathname}`
      docxPath = `blob:${docxBlob.pathname}`
    } else {
      const baseDir = path.join(process.cwd(), 'server', 'data', 'site_audits', auditId)
      ensureDir(baseDir)
      htmlPath = path.join(baseDir, 'audit.html')
      docxPath = path.join(baseDir, 'audit.docx')
      fs.writeFileSync(htmlPath, html, 'utf8')
      fs.writeFileSync(docxPath, docx)
    }

    const auditJson = JSON.stringify(audit)
    const updatedAt = nowIso()
    await db.run(
      'UPDATE site_audit SET status = ?, error = ?, audit_json = ?, html_path = ?, docx_path = ?, updated_at = ? WHERE business_id = ? AND audit_id = ? AND public_token_hash = ?',
      ['done', null, auditJson, htmlPath, docxPath, updatedAt, businessId, auditId, tokenHash],
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Audit generation failed'
    await db.run('UPDATE site_audit SET status = ?, error = ?, updated_at = ? WHERE business_id = ? AND audit_id = ?', ['failed', msg, nowIso(), businessId, auditId])
  }
}
