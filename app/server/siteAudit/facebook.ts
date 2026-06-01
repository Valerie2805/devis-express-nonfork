function extractTitle(html: string) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return m ? String(m[1] || '').replace(/\s+/g, ' ').trim() : ''
}

function extractMeta(html: string, key: string) {
  const k = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const reProp = new RegExp(`<meta\\s+[^>]*property\\s*=\\s*["']${k}["'][^>]*content\\s*=\\s*["']([^"']*)["'][^>]*>`, 'i')
  const reName = new RegExp(`<meta\\s+[^>]*name\\s*=\\s*["']${k}["'][^>]*content\\s*=\\s*["']([^"']*)["'][^>]*>`, 'i')
  const m1 = html.match(reProp)
  if (m1) return String(m1[1] || '').trim()
  const m2 = html.match(reName)
  if (m2) return String(m2[1] || '').trim()
  return ''
}

function extractFirstExternalUrl(html: string, ignoreHosts: string[]) {
  const re = /<a\s+[^>]*href\s*=\s*["']([^"']+)["']/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const href = String(m[1] || '').trim()
    if (!href) continue
    if (!/^https?:\/\//i.test(href)) continue
    try {
      const u = new URL(href)
      const host = u.hostname.toLowerCase()
      if (ignoreHosts.some((h) => host === h || host.endsWith(`.${h}`))) continue
      return u.toString()
    } catch {}
  }
  return ''
}

function extractPhone(html: string) {
  const tel = html.match(/href=["']tel:([^"']+)["']/i)
  if (tel) return String(tel[1] || '').trim()
  const m = html.match(/(\+\d{8,15})|(\b0\d{9}\b)/)
  return m ? String(m[0] || '').trim() : ''
}

function extractEmail(html: string) {
  const m1 = html.match(/href=["']mailto:([^"']+)["']/i)
  if (m1) return String(m1[1] || '').trim()
  const m2 = html.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
  return m2 ? String(m2[0] || '').trim() : ''
}

export function parseFacebookPublic(html: string, url: string) {
  const title = extractTitle(html)
  const ogTitle = extractMeta(html, 'og:title')
  const ogDesc = extractMeta(html, 'og:description')
  const desc = ogDesc || extractMeta(html, 'description')
  const phone = extractPhone(html)
  const email = extractEmail(html)
  const website = extractFirstExternalUrl(html, ['facebook.com', 'm.facebook.com', 'mbasic.facebook.com', 'fb.com', 'fb.me'])
  const company = (ogTitle || title).replace(/\s*\|\s*Facebook\s*$/i, '').trim()
  const excerpt = [company, desc].filter(Boolean).join(' — ').slice(0, 240)

  return {
    url,
    title: ogTitle || title,
    text: excerpt,
    profile: {
      company_name: company || null,
      phone: phone || null,
      email: email || null,
      website: website || null,
    },
    limitations: [
      'Facebook : extraction best-effort sans authentification (contenu parfois incomplet car chargé dynamiquement).',
      'Les informations manquantes (horaires, zone, services) doivent être confirmées manuellement.',
    ],
  }
}

