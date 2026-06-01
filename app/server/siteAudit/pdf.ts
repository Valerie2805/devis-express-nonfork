import { PDFDocument, StandardFonts } from 'pdf-lib'

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('fr-FR')
  } catch {
    return iso
  }
}

function wrapText(input: string, maxWidth: number, font: any, fontSize: number) {
  const text = String(input || '').replace(/\s+/g, ' ').trim()
  if (!text) return ['—']
  const words = text.split(' ')
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w
    const width = font.widthOfTextAtSize(next, fontSize)
    if (width <= maxWidth) {
      cur = next
      continue
    }
    if (cur) lines.push(cur)
    cur = w
  }
  if (cur) lines.push(cur)
  return lines.length ? lines : ['—']
}

export async function buildAuditPdf(audit: any) {
  const meta = audit?.meta || {}
  const profile = audit?.profile || {}
  const summary = Array.isArray(audit?.executive_summary) ? audit.executive_summary : []
  const findings = Array.isArray(audit?.findings) ? audit.findings : []
  const commercial = audit?.commercial?.before_after ? String(audit.commercial.before_after) : ''
  const pp = meta?.pages_present && typeof meta.pages_present === 'object' ? meta.pages_present : {}

  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  const page = doc.addPage([595.28, 841.89])
  const margin = 48
  const width = page.getWidth() - margin * 2
  let y = page.getHeight() - margin

  const drawHeading = (t: string) => {
    y -= 18
    page.drawText(String(t), { x: margin, y, size: 14, font: bold })
    y -= 10
  }

  const drawTextLines = (text: string, size = 10) => {
    const lines = String(text || '').split('\n')
    for (const l of lines) {
      for (const wl of wrapText(l, width, font, size)) {
        y -= size + 3
        page.drawText(wl, { x: margin, y, size, font })
      }
    }
  }

  const drawBulletLines = (arr: any[]) => {
    if (!arr.length) {
      drawTextLines('—')
      return
    }
    for (const it of arr) {
      const lines = wrapText(String(it || ''), width - 14, font, 10)
      for (let i = 0; i < lines.length; i++) {
        y -= 13
        page.drawText(i === 0 ? `• ${lines[i]}` : `  ${lines[i]}`, { x: margin, y, size: 10, font })
      }
    }
  }

  page.drawText('Audit de présence en ligne', { x: margin, y, size: 18, font: bold })
  y -= 24
  drawTextLines(String(meta.current_site_url || '—'), 10)
  y -= 4
  drawTextLines(`Généré le ${fmtDate(String(meta.generated_at || ''))}`, 10)
  if (typeof meta.score === 'number') {
    y -= 4
    drawTextLines(`Score : ${String(meta.score)}/100`, 10)
  }

  drawHeading('Résumé exécutif')
  drawBulletLines(summary.slice(0, 6))

  drawHeading('Données récupérées')
  const conf = typeof profile?.confidence === 'number' ? Math.round(profile.confidence * 100) : 0
  drawTextLines(`Complétude des données détectées : ${String(conf)}%`)
  const a11y = meta?.pagespeed && typeof (meta as any).pagespeed?.accessibility_score === 'number' ? (meta as any).pagespeed.accessibility_score : null
  drawTextLines(`Accessibilité (Lighthouse / mobile) : ${typeof a11y === 'number' ? String(a11y) + '/100' : '—'}`)
  const checks = (meta as any)?.accessibility_checks || null
  if (checks) {
    const line = [
      checks.has_html_lang ? 'Lang(html) ✓' : 'Lang(html) ✗',
      checks.has_title ? 'Title ✓' : 'Title ✗',
      checks.has_meta_viewport ? 'Viewport ✓' : 'Viewport ✗',
      checks.has_h1 ? 'H1 ✓' : 'H1 ✗',
      typeof checks.images_total === 'number' ? `Images alt ${String(checks.images_with_alt || 0)}/${String(checks.images_total || 0)}` : null,
    ]
      .filter(Boolean)
      .join(' • ')
    drawTextLines(`Vérifications (best-effort) : ${line || '—'}`)
  }
  drawTextLines(`Nom : ${String(profile.company_name || '—')}`)
  drawTextLines(`Téléphone : ${String(profile.phone || '—')}`)
  drawTextLines(`Email : ${String(profile.email || '—')}`)
  const pagesPresent = [
    pp.contact ? 'Contact' : null,
    pp.services ? 'Services' : null,
    pp.zones ? 'Zones' : null,
    pp.tarifs ? 'Tarifs' : null,
    pp.mentions_legales ? 'Mentions légales' : null,
    pp.cgv ? 'CGV' : null,
    pp.rgaa ? 'Accessibilité (RGAA)' : null,
  ]
    .filter(Boolean)
    .join(' • ')
  drawTextLines(`Pages détectées : ${pagesPresent || '—'}`)

  drawHeading('Diagnostic')
  const maxFindings = Math.min(8, findings.length)
  if (!maxFindings) {
    drawTextLines('—')
  } else {
    for (const f of findings.slice(0, maxFindings)) {
      const title = String(f?.title || '')
      const sev = String(f?.severity || '').toUpperCase()
      const cat = String(f?.category || '')
      y -= 12
      page.drawText(title || '—', { x: margin, y, size: 11, font: bold })
      y -= 13
      page.drawText(`Catégorie : ${cat || '—'} • Sévérité : ${sev || '—'}`, { x: margin, y, size: 9, font })
      const recs = Array.isArray(f?.recommendations) ? f.recommendations : []
      if (recs.length) drawBulletLines(recs.slice(0, 4))
      y -= 6
    }
  }

  drawHeading('Pourquoi notre solution est mieux adaptée')
  drawTextLines(commercial || '—')

  return Buffer.from(await doc.save())
}
