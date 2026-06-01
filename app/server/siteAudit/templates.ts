function esc(v: any) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('fr-FR')
  } catch {
    return iso
  }
}

function badge(sev: string) {
  const s = String(sev || '').toLowerCase()
  const label = s === 'high' ? 'HIGH' : s === 'medium' ? 'MEDIUM' : 'LOW'
  const cls = s === 'high' ? 'sev-high' : s === 'medium' ? 'sev-med' : 'sev-low'
  return `<span class="sev ${cls}">${label}</span>`
}

export function buildAuditHtml(audit: any) {
  const meta = audit?.meta || {}
  const summary = Array.isArray(audit?.executive_summary) ? audit.executive_summary : []
  const findings = Array.isArray(audit?.findings) ? audit.findings : []
  const plan = audit?.site_plan || {}
  const standardPages = Array.isArray(plan?.standard_pages) ? plan.standard_pages : []
  const customPages = Array.isArray(plan?.custom_pages) ? plan.custom_pages : []
  const commercial = audit?.commercial?.before_after ? String(audit.commercial.before_after) : ''
  const limitations = Array.isArray(audit?.limitations) ? audit.limitations : []
  const urls = Array.isArray(meta?.analyzed_urls) ? meta.analyzed_urls : []
  const score = typeof meta?.score === 'number' ? meta.score : null
  const profile = audit?.profile || {}
  const pp = meta?.pages_present && typeof meta.pages_present === 'object' ? meta.pages_present : {}
  const createSiteUrl =
    meta?.business_id && meta?.audit_id
      ? `/backoffice/${encodeURIComponent(String(meta.business_id))}/create-site?from_audit=${encodeURIComponent(String(meta.audit_id))}&open_preview=1`
      : ''

  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Audit de présence en ligne</title>
    <style>
      :root { color-scheme: light; }
      body { font-family: Arial, Helvetica, sans-serif; margin: 0; background: #f6f7fb; color: #0f172a; }
      .wrap { max-width: 880px; margin: 0 auto; padding: 24px; }
      .card { background: white; border: 1px solid #e5e7eb; border-radius: 16px; padding: 18px; }
      h1 { font-size: 22px; margin: 0; }
      h2 { font-size: 16px; margin: 0 0 10px 0; }
      h3 { font-size: 14px; margin: 0; }
      .muted { color: #475569; font-size: 12px; }
      .grid { display: grid; gap: 14px; }
      .sev { display:inline-flex; align-items:center; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; letter-spacing: .04em; }
      .sev-high { background:#fee2e2; color:#991b1b; }
      .sev-med { background:#ffedd5; color:#9a3412; }
      .sev-low { background:#e0f2fe; color:#075985; }
      .finding { border: 1px solid #e5e7eb; border-radius: 14px; padding: 14px; }
      .finding-head { display:flex; justify-content:space-between; gap: 10px; align-items:flex-start; }
      .finding p { margin: 8px 0 0 0; font-size: 13px; color: #0f172a; }
      ul { margin: 8px 0 0 18px; padding: 0; }
      li { margin: 4px 0; }
      code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size: 12px; }
      .evidence { margin-top: 10px; padding: 10px; border-radius: 12px; background: #f8fafc; border: 1px solid #e2e8f0; }
      .evidence a { color: #0f172a; text-decoration: underline; word-break: break-all; }
      .hr { height: 1px; background: #e5e7eb; margin: 14px 0; }
      .pill { display:inline-flex; padding: 4px 10px; border-radius: 999px; background:#f1f5f9; font-size: 12px; color:#0f172a; margin: 4px 6px 0 0; }
      .pre { white-space: pre-wrap; }
      @media print {
        body { background: white; }
        .wrap { padding: 0; }
        .card { border: none; border-radius: 0; padding: 0; }
        a { color: black; text-decoration: none; }
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="card">
        <div style="display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; align-items:flex-end;">
          <div>
            <h1>Audit de présence en ligne</h1>
            <div class="muted">${esc(meta.current_site_url || '')}</div>
            <div class="muted">Généré le ${esc(formatDate(meta.generated_at || ''))}</div>
          </div>
          <div class="muted" style="text-align:right;">
            ${score !== null ? `<div><strong>Score</strong> : ${esc(String(score))}/100</div>` : ''}
            <div>Mode: <code>${esc(meta.mode || '')}</code></div>
            ${
              createSiteUrl
                ? `<div style="margin-top:8px;"><a href="${esc(createSiteUrl)}" target="_self" rel="noopener noreferrer" style="display:inline-block; padding:8px 12px; border-radius:12px; background:#0f172a; color:white; text-decoration:none; font-weight:700; font-size:12px;">Créer un site internet</a></div>`
                : ''
            }
          </div>
        </div>

        <div class="hr"></div>

        <div class="grid">
          <div>
            <h2>Résumé exécutif</h2>
            ${summary.length ? `<ul>${summary.map((s: any) => `<li>${esc(s)}</li>`).join('')}</ul>` : `<div class="muted">Aucun résumé.</div>`}
          </div>

          <div>
            <h2>Données récupérées</h2>
            <div class="muted">Ces informations sont extraites automatiquement et peuvent nécessiter validation.</div>
            <div class="evidence" style="margin-top:10px;">
              <div class="muted">Complétude des données détectées</div>
              <div><strong>${esc(String(typeof profile.confidence === 'number' ? Math.round(profile.confidence * 100) : 0))}%</strong></div>
              <div class="hr"></div>
              <div class="muted">Accessibilité (Lighthouse / mobile)</div>
              <div><strong>${
                meta.pagespeed && typeof meta.pagespeed.accessibility_score === 'number' ? esc(String(meta.pagespeed.accessibility_score)) + '/100' : '—'
              }</strong></div>
              <div class="muted" style="margin-top:6px;">Vérifications (best-effort)</div>
              <div>${
                meta.accessibility_checks
                  ? [
                      meta.accessibility_checks.has_html_lang ? 'Lang (html) ✓' : 'Lang (html) ✗',
                      meta.accessibility_checks.has_title ? 'Title ✓' : 'Title ✗',
                      meta.accessibility_checks.has_meta_viewport ? 'Viewport ✓' : 'Viewport ✗',
                      meta.accessibility_checks.has_h1 ? 'H1 ✓' : 'H1 ✗',
                      typeof meta.accessibility_checks.images_total === 'number'
                        ? `Images alt : ${String(meta.accessibility_checks.images_with_alt || 0)}/${String(meta.accessibility_checks.images_total || 0)}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' • ')
                  : '—'
              }</div>
              <div class="hr"></div>
              <div class="muted">Nom</div>
              <div>${esc(profile.company_name || '—')}</div>
              <div class="hr"></div>
              <div class="muted">Téléphone</div>
              <div>${esc(profile.phone || '—')}</div>
              <div class="hr"></div>
              <div class="muted">Email</div>
              <div>${esc(profile.email || '—')}</div>
              <div class="hr"></div>
              <div class="muted">Site externe</div>
              ${
                profile.website
                  ? `<div><a href="${esc(profile.website)}" target="_blank" rel="noreferrer">${esc(profile.website)}</a></div>`
                  : `<div>—</div>`
              }
              <div class="hr"></div>
              <div class="muted">Zone (best-effort)</div>
              <div>${esc(profile.service_area || '—')}</div>
              <div class="hr"></div>
              <div class="muted">Codes postaux (best-effort)</div>
              <div>${Array.isArray(profile.postal_codes) && profile.postal_codes.length ? esc(profile.postal_codes.join(', ')) : '—'}</div>
              <div class="hr"></div>
              <div class="muted">Services (best-effort)</div>
              <div>${Array.isArray(profile.services) && profile.services.length ? esc(profile.services.join(' • ')) : '—'}</div>
              <div class="hr"></div>
              <div class="muted">Horaires (best-effort)</div>
              <div class="pre">${esc(profile.opening_hours || '—')}</div>
              <div class="hr"></div>
              <div class="muted">CTA détectés (best-effort)</div>
              <div>${
                profile.ctas
                  ? [
                      profile.ctas.call ? 'Appeler' : null,
                      profile.ctas.whatsapp ? 'WhatsApp' : null,
                      profile.ctas.form ? 'Formulaire' : null,
                      profile.ctas.devis ? 'Devis' : null,
                    ]
                      .filter(Boolean)
                      .join(' • ') || '—'
                  : '—'
              }</div>
              <div class="hr"></div>
              <div class="muted">Pages détectées (best-effort)</div>
              <div>${
                [
                  pp.contact ? 'Contact' : null,
                  pp.services ? 'Services' : null,
                  pp.zones ? 'Zones' : null,
                  pp.tarifs ? 'Tarifs' : null,
                  pp.mentions_legales ? 'Mentions légales' : null,
                  pp.cgv ? 'CGV' : null,
                  pp.rgaa ? 'Accessibilité (RGAA)' : null,
                ]
                  .filter(Boolean)
                  .join(' • ') || '—'
              }</div>
            </div>
          </div>

          <div>
            <h2>Pourquoi notre solution est mieux adaptée</h2>
            <div class="pre">${esc(commercial)}</div>
          </div>

          <div>
            <h2>Diagnostic</h2>
            ${findings
              .slice(0, 8)
              .map((f: any) => {
                const ev = Array.isArray(f?.evidence) ? f.evidence[0] : null
                const recs = Array.isArray(f?.recommendations) ? f.recommendations : []
                return `<div class="finding">
                  <div class="finding-head">
                    <div>
                      <div class="muted">${esc(f.category || '')}</div>
                      <h3>${esc(f.title || '')}</h3>
                    </div>
                    ${badge(f.severity)}
                  </div>
                  ${recs.length ? `<ul>${recs.map((r: any) => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
                  ${
                    ev
                      ? `<div class="evidence">
                          <div class="muted">Preuve</div>
                          <div><a href="${esc(ev.url)}" target="_blank" rel="noreferrer">${esc(ev.url)}</a></div>
                          <div class="muted">${esc(ev.excerpt || '')}</div>
                        </div>`
                      : ''
                  }
                </div>`
              })
              .join('')}
          </div>

          <div>
            <h2>Plan de site recommandé</h2>
            <div class="muted">Pages standard</div>
            <div>${standardPages.map((p: any) => `<span class="pill">${esc(p)}</span>`).join('') || '<span class="muted">—</span>'}</div>
            <div class="hr"></div>
            <div class="muted">Pages custom (si besoin)</div>
            ${
              customPages.length
                ? customPages
                    .slice(0, 4)
                    .map((p: any) => {
                      const sections = Array.isArray(p?.sections) ? p.sections : []
                      return `<div style="margin-top:10px;">
                        <div><strong>${esc(p.title || p.slug_suggestion || '')}</strong> <span class="muted">(${esc(p.goal || '')})</span></div>
                        <div class="muted">${sections.map((s: any) => esc(s)).join(' • ')}</div>
                      </div>`
                    })
                    .join('')
                : `<div class="muted">Aucune page custom détectée.</div>`
            }
          </div>

          <div>
            <h2>Périmètre</h2>
            ${urls.length ? `<ul>${urls.map((u: any) => `<li><a href="${esc(u)}" target="_blank" rel="noreferrer">${esc(u)}</a></li>`).join('')}</ul>` : `<div class="muted">URLs non disponibles.</div>`}
            ${limitations.length ? `<div class="hr"></div><div class="muted">Limites</div><ul>${limitations.map((l: any) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
          </div>
        </div>
      </div>
    </div>
  </body>
</html>`
}
