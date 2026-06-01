import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx'

function heading(text: string, level: any) {
  return new Paragraph({ text, heading: level })
}

function p(text: string) {
  return new Paragraph({ children: [new TextRun({ text: text || '' })] })
}

function bullet(text: string) {
  return new Paragraph({ text, bullet: { level: 0 } })
}

export async function buildAuditDocx(audit: any) {
  const meta = audit?.meta || {}
  const summary = Array.isArray(audit?.executive_summary) ? audit.executive_summary : []
  const findings = Array.isArray(audit?.findings) ? audit.findings : []
  const plan = audit?.site_plan || {}
  const standardPages = Array.isArray(plan?.standard_pages) ? plan.standard_pages : []
  const customPages = Array.isArray(plan?.custom_pages) ? plan.custom_pages : []
  const commercial = audit?.commercial?.before_after ? String(audit.commercial.before_after) : ''
  const profile = audit?.profile || {}
  const pp = meta?.pages_present && typeof meta.pages_present === 'object' ? meta.pages_present : {}

  const children: Paragraph[] = []
  children.push(heading('Audit de présence en ligne', HeadingLevel.TITLE))
  if (meta?.current_site_url) children.push(p(String(meta.current_site_url)))
  if (meta?.generated_at) children.push(p(`Généré le ${new Date(String(meta.generated_at)).toLocaleString('fr-FR')}`))
  if (typeof meta?.score === 'number') children.push(p(`Score : ${meta.score}/100`))
  children.push(new Paragraph({}))

  children.push(heading('Résumé exécutif', HeadingLevel.HEADING_1))
  if (summary.length) {
    for (const s of summary.slice(0, 5)) children.push(bullet(String(s)))
  } else {
    children.push(p('Aucun résumé.'))
  }
  children.push(new Paragraph({}))

  children.push(heading('Données récupérées', HeadingLevel.HEADING_1))
  children.push(p('Ces informations sont extraites automatiquement et peuvent nécessiter validation.'))
  const conf = typeof profile?.confidence === 'number' ? Math.round(profile.confidence * 100) : 0
  children.push(p(`Complétude des données détectées : ${conf}%`))
  const a11y = meta?.pagespeed && typeof (meta as any).pagespeed?.accessibility_score === 'number' ? (meta as any).pagespeed.accessibility_score : null
  children.push(p(`Accessibilité (Lighthouse / mobile) : ${typeof a11y === 'number' ? String(a11y) + '/100' : '—'}`))
  const checks = (meta as any)?.accessibility_checks || null
  if (checks) {
    children.push(
      p(
        `Vérifications (best-effort) : ${[
          checks.has_html_lang ? 'Lang(html) ✓' : 'Lang(html) ✗',
          checks.has_title ? 'Title ✓' : 'Title ✗',
          checks.has_meta_viewport ? 'Viewport ✓' : 'Viewport ✗',
          checks.has_h1 ? 'H1 ✓' : 'H1 ✗',
          typeof checks.images_total === 'number' ? `Images alt ${String(checks.images_with_alt || 0)}/${String(checks.images_total || 0)}` : null,
        ]
          .filter(Boolean)
          .join(' • ')}`,
      ),
    )
  }
  children.push(p(`Nom : ${String(profile.company_name || '—')}`))
  children.push(p(`Téléphone : ${String(profile.phone || '—')}`))
  children.push(p(`Email : ${String(profile.email || '—')}`))
  children.push(p(`Site externe : ${String(profile.website || '—')}`))
  children.push(p(`Zone : ${String(profile.service_area || '—')}`))
  children.push(p(`Codes postaux : ${Array.isArray(profile.postal_codes) && profile.postal_codes.length ? profile.postal_codes.join(', ') : '—'}`))
  children.push(p(`Services : ${Array.isArray(profile.services) && profile.services.length ? profile.services.join(' • ') : '—'}`))
  children.push(p(`Horaires : ${String(profile.opening_hours || '—')}`))
  const ctas = profile?.ctas || {}
  const ctaList = [ctas.call ? 'Appeler' : null, ctas.whatsapp ? 'WhatsApp' : null, ctas.form ? 'Formulaire' : null, ctas.devis ? 'Devis' : null]
    .filter(Boolean)
    .join(' • ')
  children.push(p(`CTA détectés : ${ctaList || '—'}`))
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
  children.push(p(`Pages détectées : ${pagesPresent || '—'}`))
  children.push(new Paragraph({}))

  children.push(heading('Pourquoi notre solution est mieux adaptée', HeadingLevel.HEADING_1))
  if (commercial) {
    for (const line of commercial.split('\n')) children.push(p(line))
  } else {
    children.push(p('—'))
  }
  children.push(new Paragraph({}))

  children.push(heading('Diagnostic', HeadingLevel.HEADING_1))
  for (const f of findings.slice(0, 8)) {
    const title = String(f?.title || '')
    const sev = String(f?.severity || '').toUpperCase()
    const category = String(f?.category || '')
    children.push(heading(`${title}`, HeadingLevel.HEADING_2))
    children.push(p(`Catégorie : ${category} • Sévérité : ${sev || '—'}`))
    const recs = Array.isArray(f?.recommendations) ? f.recommendations : []
    if (recs.length) {
      children.push(p('Recommandations :'))
      for (const r of recs.slice(0, 6)) children.push(bullet(String(r)))
    }
    const ev = Array.isArray(f?.evidence) ? f.evidence[0] : null
    if (ev?.url || ev?.excerpt) {
      children.push(p('Preuve :'))
      if (ev?.url) children.push(p(String(ev.url)))
      if (ev?.excerpt) children.push(p(String(ev.excerpt)))
    }
    children.push(new Paragraph({}))
  }

  children.push(heading('Plan de site recommandé', HeadingLevel.HEADING_1))
  children.push(p('Pages standard :'))
  if (standardPages.length) for (const s of standardPages) children.push(bullet(String(s)))
  else children.push(p('—'))
  children.push(new Paragraph({}))
  children.push(p('Pages custom (si besoin) :'))
  if (customPages.length) {
    for (const c of customPages.slice(0, 4)) {
      const sections = Array.isArray(c?.sections) ? c.sections : []
      children.push(heading(String(c?.title || c?.slug_suggestion || ''), HeadingLevel.HEADING_2))
      if (c?.goal) children.push(p(String(c.goal)))
      if (sections.length) children.push(p(sections.map((x: any) => String(x)).join(' • ')))
      children.push(new Paragraph({}))
    }
  } else {
    children.push(p('—'))
  }

  const doc = new Document({ sections: [{ properties: {}, children }] })
  return Packer.toBuffer(doc)
}
