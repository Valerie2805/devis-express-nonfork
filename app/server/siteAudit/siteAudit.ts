import { chatJson } from '../ai/openaiCompatible.js'
import dns from 'dns/promises'
import net from 'net'
import { parseFacebookPublic } from './facebook.js'
import { extractOpeningHours } from './openingHours.js'
import { runPageSpeed } from '../company/pagespeed.js'

function normalizeUrl(input: string) {
  try {
    return new URL(input).toString()
  } catch {
    return ''
  }
}

function decodeXmlEntities(s: string) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function cleanInlineHtml(s: string) {
  return decodeXmlEntities(String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
}

function isPrivateIp(ip: string) {
  const v = net.isIP(ip)
  if (v === 4) {
    const parts = ip.split('.').map((x) => Number(x))
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return true
    const [a, b] = parts
    if (a === 0) return true
    if (a === 10) return true
    if (a === 127) return true
    if (a === 169 && b === 254) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 100 && b >= 64 && b <= 127) return true
    return false
  }
  if (v === 6) {
    const norm = ip.toLowerCase()
    if (norm === '::1' || norm === '::') return true
    if (norm.startsWith('fe80:')) return true
    if (norm.startsWith('fc') || norm.startsWith('fd')) return true
    return false
  }
  return true
}

async function assertPublicHost(u: URL) {
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('Invalid protocol')
  const host = u.hostname.toLowerCase()
  if (!host) throw new Error('Invalid host')
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) throw new Error('Forbidden host')
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error('Forbidden host')
    return
  }
  const addrs = await dns.lookup(host, { all: true })
  for (const a of addrs) {
    if (isPrivateIp(a.address)) throw new Error('Forbidden host')
  }
}

async function readBodyLimited(res: Response, maxBytes: number) {
  const reader = (res.body as any)?.getReader?.()
  if (!reader) {
    const buf = Buffer.from(await res.arrayBuffer())
    return buf.length > maxBytes ? buf.subarray(0, maxBytes).toString('utf8') : buf.toString('utf8')
  }
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    if (!value) continue
    total += value.byteLength
    if (total > maxBytes) throw new Error('Response too large')
    chunks.push(value)
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8')
}

async function safeFetchText(
  inputUrl: string,
  opts?: { timeoutMs?: number; maxBytes?: number; maxRedirects?: number; accept?: 'html' | 'text' },
) {
  const timeoutMs = Math.min(20_000, Math.max(2_000, Number(opts?.timeoutMs || process.env.AUDIT_FETCH_TIMEOUT_MS || 8000)))
  const maxBytes = Math.min(2_000_000, Math.max(50_000, Number(opts?.maxBytes || process.env.AUDIT_FETCH_MAX_BYTES || 500_000)))
  const maxRedirects = Math.min(8, Math.max(0, Number(opts?.maxRedirects || 5)))
  let current = new URL(inputUrl)
  for (let i = 0; i <= maxRedirects; i++) {
    await assertPublicHost(current)
    const ac = new AbortController()
    const t = setTimeout(() => ac.abort(), timeoutMs)
    let res: Response
    try {
      res = await fetch(current.toString(), {
        redirect: 'manual',
        signal: ac.signal,
        headers: { 'user-agent': 'DevisExpressAuditBot/1.0' },
      })
    } finally {
      clearTimeout(t)
    }

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location') || ''
      if (!loc) throw new Error('Redirect without location')
      current = new URL(loc, current.toString())
      continue
    }

    if (!res.ok) throw new Error(`Fetch failed (${res.status})`)
    const ct = String(res.headers.get('content-type') || '')
    const accept = opts?.accept || 'html'
    const ctLc = ct.toLowerCase()
    if (accept === 'html') {
      if (!ctLc.includes('text/html') && !ctLc.includes('application/xhtml+xml')) throw new Error('Unsupported content-type')
    } else {
      if (!ctLc.includes('text/') && !ctLc.includes('application/xml') && !ctLc.includes('application/xhtml+xml')) throw new Error('Unsupported content-type')
    }
    const len = Number(res.headers.get('content-length') || '0')
    if (Number.isFinite(len) && len > maxBytes) throw new Error('Response too large')
    return await readBodyLimited(res, maxBytes)
  }
  throw new Error('Too many redirects')
}

async function safeFetchHtml(inputUrl: string, opts?: { timeoutMs?: number; maxBytes?: number; maxRedirects?: number }) {
  return safeFetchText(inputUrl, { ...opts, accept: 'html' })
}

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

function resolveHttpUrl(baseUrl: string, candidate: string) {
  const c = String(candidate || '').trim()
  if (!c) return ''
  try {
    const u = new URL(c, baseUrl)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return ''
    return u.toString()
  } catch {
    return ''
  }
}

function extractLogoUrl(html: string, baseUrl: string) {
  const og = extractMeta(html, 'og:image') || extractMeta(html, 'twitter:image')
  const cand = og || ''
  const fromMeta = resolveHttpUrl(baseUrl, cand)
  if (fromMeta) return fromMeta

  const mApple = String(html || '').match(/<link\s+[^>]*rel\s*=\s*["']apple-touch-icon["'][^>]*href\s*=\s*["']([^"']+)["'][^>]*>/i)
  if (mApple) {
    const u = resolveHttpUrl(baseUrl, String(mApple[1] || ''))
    if (u) return u
  }

  const mIcon = String(html || '').match(/<link\s+[^>]*rel\s*=\s*["']icon["'][^>]*href\s*=\s*["']([^"']+)["'][^>]*>/i)
  if (mIcon) {
    const u = resolveHttpUrl(baseUrl, String(mIcon[1] || ''))
    if (u) return u
  }
  return ''
}

function normalizePhone(raw: string) {
  const r = String(raw || '').trim()
  if (!r) return ''
  const digits = r.replace(/[^\d+]/g, '')
  if (digits.startsWith('+')) {
    const d = digits.replace(/[^\d]/g, '')
    if (d.startsWith('33') && d.length >= 11) return `+33${d.slice(2, 11)}`
    if (d.length >= 8 && d.length <= 15) return `+${d}`
    return ''
  }
  const d = digits.replace(/[^\d]/g, '')
  if (d.startsWith('0033') && d.length >= 13) return `+33${d.slice(4, 13)}`
  if (d.startsWith('33') && d.length >= 11) return `+33${d.slice(2, 11)}`
  if (/^0[1-9]\d{8}$/.test(d)) return d
  return ''
}

function extractTelNumbersFromHtml(html: string) {
  const out: string[] = []
  const re = /href=["']tel:([^"']+)["']/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(String(html || '')))) {
    const v = decodeURIComponent(String(m[1] || '')).replace(/\s+/g, ' ').trim()
    const n = normalizePhone(v)
    if (n) out.push(n)
  }
  return uniq(out).slice(0, 5)
}

function extractPhonesFromText(t: string) {
  const out: string[] = []
  const s = String(t || '')
  const re = /(?:\+33|0033|0)\s*[1-9](?:[\s.\-]?\d{2}){4}\b/g
  let m: RegExpExecArray | null
  while ((m = re.exec(s))) {
    const n = normalizePhone(m[0])
    if (n) out.push(n)
  }
  const compact = s.match(/\b0[1-9]\d{8}\b/g) || []
  for (const c of compact) {
    const n = normalizePhone(c)
    if (n) out.push(n)
  }
  return uniq(out).slice(0, 5)
}

function extractPhoneFromText(t: string) {
  const phones = extractPhonesFromText(t)
  return phones[0] || ''
}

function extractEmailFromText(t: string) {
  const m = String(t || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
  return m ? String(m[0] || '').trim() : ''
}

export function hasPricingSignals(t: string) {
  const s = String(t || '')
  const lower = s.toLowerCase()
  const hasMoney = /(€|&euro;|&#8364;|\beuros?\b|\beur\b)/i.test(s)
  const hasAmount =
    /(?:€|&euro;|&#8364;)\s*\d{1,3}(?:[ .]\d{3})*(?:[,.]\d{2})?\b/i.test(s) ||
    /\b\d{1,3}(?:[ .]\d{3})*(?:[,.]\d{2})?\s*(?:€|&euro;|&#8364;|\beuros?\b|\beur\b)\b/i.test(s) ||
    /\b\d{1,3}\s*(?:€|&euro;|&#8364;)\b/i.test(s)
  const hasWords = /(tarifs?|prix|forfaits?|taux\s+horaire|a\s+partir|à\s+partir|devis\s+gratuit)/i.test(lower)
  const hasTax = /\b(ttc|ht)\b/i.test(lower)
  if (hasMoney && hasAmount) return true
  if (hasWords && (hasMoney || hasTax)) return true
  if (hasWords && hasAmount) return true
  return false
}

function computeAccessibilityChecksFromHtml(html: string) {
  const h = String(html || '')
  const checks: any = {}
  checks.has_html_lang = /<html\b[^>]*\blang\s*=\s*["'][^"']+["']/i.test(h)
  checks.has_title = /<title\b[^>]*>[\s\S]*?<\/title>/i.test(h) && extractTitle(h).length > 0
  checks.has_meta_viewport = /<meta\b[^>]*\bname\s*=\s*["']viewport["']/i.test(h)

  const imgTags = h.match(/<img\b[^>]*>/gi) || []
  const imgWithAlt = imgTags.filter((t) => /\balt\s*=\s*["'][^"']*["']/i.test(t)).length
  checks.images_total = imgTags.length
  checks.images_with_alt = imgWithAlt
  checks.images_alt_ok = imgTags.length === 0 ? true : imgWithAlt === imgTags.length

  const hasH1 = /<h1\b[^>]*>[\s\S]*?<\/h1>/i.test(h)
  checks.has_h1 = hasH1

  return checks
}

function extractCtasFromHtml(html: string, text: string) {
  const telNumbers = extractTelNumbersFromHtml(html)
  const hasTelLink = telNumbers.length > 0
  const hasWhatsappLink = /(wa\.me\/|api\.whatsapp\.com\/send|web\.whatsapp\.com\/send)/i.test(html)
  const hasForm = /<form\b/i.test(html)
  const lc = String(text || '').toLowerCase()
  const hasDevisCta = /(devis|demande de devis|estimation|rappel)/i.test(lc)
  return { hasTelLink, telNumbers, hasWhatsappLink, hasForm, hasDevisCta }
}

function mergeCtas(all: Array<{ hasTelLink: boolean; telNumbers?: string[]; hasWhatsappLink: boolean; hasForm: boolean; hasDevisCta: boolean }>) {
  const telNumbers = uniq(all.flatMap((c) => c.telNumbers || [])).slice(0, 5)
  return {
    call: all.some((c) => c.hasTelLink),
    tel_numbers: telNumbers,
    whatsapp: all.some((c) => c.hasWhatsappLink),
    form: all.some((c) => c.hasForm),
    devis: all.some((c) => c.hasDevisCta),
  }
}

function extractTextHints(html: string) {
  const headings: string[] = []
  const items: string[] = []
  const reH = /<h[2-3][^>]*>([\s\S]*?)<\/h[2-3]>/gi
  const reLi = /<li[^>]*>([\s\S]*?)<\/li>/gi
  let m: RegExpExecArray | null
  while ((m = reH.exec(html))) {
    const v = cleanInlineHtml(m[1] || '')
    if (v && v.length <= 90) headings.push(v)
  }
  while ((m = reLi.exec(html))) {
    const v = cleanInlineHtml(m[1] || '')
    if (v && v.length <= 90) items.push(v)
  }
  return { headings: uniq(headings).slice(0, 40), items: uniq(items).slice(0, 80) }
}

function extractPostalCodesFromText(t: string) {
  const out: string[] = []
  const re = /\b\d{5}\b/g
  let m: RegExpExecArray | null
  while ((m = re.exec(t))) out.push(String(m[0]))
  return uniq(out).slice(0, 15)
}

function extractServiceCandidates(pages: Array<{ url: string; headings?: string[]; items?: string[] }>) {
  const bad = /^(accueil|home|contact|mentions|legal|tarifs?|prix|devis|zones?|secteur|blog|actualit[eé]s?)$/i
  const blacklistContains = /(politique|confidentialit[eé]|cookies|cgv|cgu|sitemap)/i
  const out: string[] = []
  for (const p of pages) {
    const candidates = [...(p.headings || []), ...(p.items || [])]
    for (const raw of candidates) {
      const v = String(raw || '').replace(/\s+/g, ' ').trim()
      if (!v) continue
      if (v.length < 3 || v.length > 60) continue
      if (bad.test(v)) continue
      if (blacklistContains.test(v)) continue
      if (!/[A-Za-zÀ-ÿ]/.test(v)) continue
      out.push(v)
    }
  }
  return uniq(out).slice(0, 10)
}

function computeProfileFromPages(
  pages: Array<{
    url: string
    title: string
    text: string
    headings?: string[]
    items?: string[]
    ctas?: { hasTelLink: boolean; telNumbers?: string[]; hasWhatsappLink: boolean; hasForm: boolean; hasDevisCta: boolean }
  }>,
  seedHtml: string,
) {
  const t = pages.map((p) => p.text).join('\n')
  const title = extractMeta(seedHtml, 'og:site_name') || extractMeta(seedHtml, 'og:title') || extractTitle(seedHtml)
  const ctas = mergeCtas(pages.map((p) => p.ctas).filter(Boolean) as any)
  const phone = extractPhoneFromText(t) || String(ctas.tel_numbers?.[0] || '')
  const email = extractEmailFromText(t)
  const company = title ? title.replace(/\s*\|\s*.*$/, '').trim() : ''
  const postalCodes = extractPostalCodesFromText(t)
  const services = extractServiceCandidates(pages).filter((s) => s.toLowerCase() !== company.toLowerCase())
  const serviceArea = postalCodes.length ? `Codes postaux : ${postalCodes.join(', ')}` : null
  const openingHours = extractOpeningHours({ html: seedHtml, text: t }) || null
  const confidence =
    (company ? 0.4 : 0) +
    (phone ? 0.3 : 0) +
    (email ? 0.2 : 0) +
    (services.length ? 0.1 : 0) +
    (postalCodes.length ? 0.1 : 0) +
    (openingHours ? 0.1 : 0)
  return {
    profile: {
      company_name: company || null,
      phone: phone || null,
      email: email || null,
      website: null,
      services,
      postal_codes: postalCodes,
      service_area: serviceArea,
      opening_hours: openingHours,
      ctas,
    },
    confidence: Math.max(0, Math.min(1, Number(confidence.toFixed(2)))),
  }
}

function normalizeCandidateUrl(u: string) {
  try {
    const url = new URL(u)
    url.hash = ''
    const drop = new Set(['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid', 'yclid', 'mc_cid', 'mc_eid'])
    const keep = new URLSearchParams()
    for (const [k, v] of url.searchParams.entries()) {
      if (!k) continue
      if (drop.has(k.toLowerCase())) continue
      if (v === '') continue
      keep.append(k, v)
    }
    const qs = keep.toString()
    url.search = qs ? `?${qs}` : ''
    return url.toString()
  } catch {
    return ''
  }
}

function isAssetPath(pathname: string) {
  return /\.(pdf|jpg|jpeg|png|webp|gif|svg|zip|rar|7z|mp4|mov|avi|webm|mp3|wav|json|xml)$/i.test(pathname)
}

function stripTags(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractLinks(html: string, baseUrl: string) {
  const out: string[] = []
  const re = /<a\s+[^>]*href\s*=\s*["']([^"']+)["']/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const href = String(m[1] || '').trim()
    if (!href) continue
    if (href.startsWith('#')) continue
    if (href.startsWith('mailto:') || href.startsWith('tel:')) continue
    try {
      const u = new URL(href, baseUrl)
      if (isAssetPath(u.pathname)) continue
      const nu = normalizeCandidateUrl(u.toString())
      if (nu) out.push(nu)
    } catch {}
  }
  return out
}

function uniq<T>(arr: T[]) {
  const seen = new Set<any>()
  const out: T[] = []
  for (const it of arr) {
    const k = String(it)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(it)
  }
  return out
}

function rankUrl(u: string) {
  const p = new URL(u).pathname.toLowerCase()
  const depth = p.split('/').filter(Boolean).length
  const k = (re: RegExp, w: number) => (re.test(p) ? w : 0)
  const score =
    k(/(^|\/)(contact|contacts)(\/|$)/, 50) +
    k(/(^|\/)(devis|demande|estimate)(\/|$)/, 45) +
    k(/(^|\/)(tarif|tarifs|prix)(\/|$)/, 40) +
    k(/(^|\/)(zone|zones|secteur|intervention)(\/|$)/, 38) +
    k(/(^|\/)(service|services|prestation|prestations)(\/|$)/, 35) +
    k(/(^|\/)(a-propos|apropos|about|equipe|team)(\/|$)/, 20) +
    k(/(^|\/)(realisations|portfolio|gallery|galerie|photos)(\/|$)/, 18) +
    k(/(^|\/)(menu|carte)(\/|$)/, 18) +
    k(/(^|\/)(mentions|legal|privacy|politique)(\/|$)/, 10) -
    depth * 2
  return score
}

function pickUrls(seed: string, candidates: string[], max: number) {
  let origin = ''
  try {
    origin = new URL(seed).origin
  } catch {}

  const filtered = uniq(candidates)
    .map((u) => normalizeCandidateUrl(u))
    .filter(Boolean)
    .filter((u) => {
      try {
        const url = new URL(u)
        if (!origin) return false
        if (url.origin !== origin) return false
        if (isAssetPath(url.pathname)) return false
        return true
      } catch {
        return false
      }
    })

  const ranked = filtered.sort((a, b) => {
    const sa = rankUrl(a)
    const sb = rankUrl(b)
    if (sa !== sb) return sb - sa
    return new URL(a).pathname.length - new URL(b).pathname.length
  })

  return uniq([normalizeCandidateUrl(seed) || seed, ...ranked]).slice(0, max)
}

async function findSitemaps(seedUrl: string) {
  const u = new URL(seedUrl)
  const robotsUrl = `${u.origin}/robots.txt`
  const out: string[] = []

  try {
    const txt = await safeFetchText(robotsUrl, { accept: 'text', maxBytes: 250_000 })
    const lines = txt.split('\n')
    for (const line of lines) {
      const m = line.match(/^\s*sitemap\s*:\s*(\S+)\s*$/i)
      if (!m) continue
      const raw = String(m[1] || '').trim()
      try {
        out.push(new URL(raw, u.origin).toString())
      } catch {}
    }
  } catch {}

  out.push(`${u.origin}/sitemap.xml`)
  return uniq(out).slice(0, 3)
}

function parseSitemapLocs(xml: string) {
  const out: string[] = []
  const re = /<loc>\s*([^<]+)\s*<\/loc>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) {
    const loc = decodeXmlEntities(String(m[1] || '').trim())
    if (!loc) continue
    out.push(loc)
  }
  return out
}

async function loadSitemapUrls(seedUrl: string) {
  const u = new URL(seedUrl)
  const origin = u.origin
  const sitemaps = await findSitemaps(seedUrl)
  const urls: string[] = []

  for (const sm of sitemaps) {
    try {
      const xml = await safeFetchText(sm, { accept: 'text', maxBytes: 1_000_000 })
      for (const loc of parseSitemapLocs(xml)) {
        try {
          const lu = new URL(loc, origin)
          if (lu.origin !== origin) continue
          if (isAssetPath(lu.pathname)) continue
          const nu = normalizeCandidateUrl(lu.toString())
          if (nu) urls.push(nu)
        } catch {}
      }
      if (urls.length >= 60) break
    } catch {}
  }

  return uniq(urls).slice(0, 60)
}

function detectCustomPages(urls: string[]) {
  const out: Array<{ slug_suggestion: string; title: string; goal: string; sections: string[] }> = []
  const seen = new Set<string>()

  const defs: Array<{ re: RegExp; title: string; slug: string; goal: string; sections: string[] }> = [
    { re: /(^|\/)(menu|carte)(\/|$)/i, title: 'Menu', slug: 'menu', goal: 'Présenter l’offre', sections: ['hero', 'categories', 'items', 'contact_cta'] },
    { re: /(^|\/)(galerie|gallery|photos)(\/|$)/i, title: 'Galerie', slug: 'galerie', goal: 'Rassurer', sections: ['hero', 'gallery', 'proof', 'contact_cta'] },
    { re: /(^|\/)(realisations|portfolio)(\/|$)/i, title: 'Réalisations', slug: 'realisations', goal: 'Rassurer', sections: ['hero', 'gallery', 'testimonials', 'contact_cta'] },
    { re: /(^|\/)(equipe|team)(\/|$)/i, title: 'Équipe', slug: 'equipe', goal: 'Confiance', sections: ['hero', 'team', 'proof', 'contact_cta'] },
    { re: /(^|\/)(a-propos|apropos|about)(\/|$)/i, title: 'À propos', slug: 'a-propos', goal: 'Confiance', sections: ['hero', 'story', 'proof', 'contact_cta'] },
    { re: /(^|\/)(blog|actualites|news)(\/|$)/i, title: 'Actualités', slug: 'actualites', goal: 'Informer', sections: ['hero', 'posts', 'contact_cta'] },
  ]

  for (const u of urls) {
    let path = ''
    try {
      path = new URL(u).pathname
    } catch {
      continue
    }
    for (const d of defs) {
      if (!d.re.test(path)) continue
      if (seen.has(d.slug)) continue
      seen.add(d.slug)
      out.push({ slug_suggestion: d.slug, title: d.title, goal: d.goal, sections: d.sections })
    }
  }
  return out.slice(0, 3)
}

function excerpt(text: string, maxLen: number) {
  const t = String(text || '').replace(/\s+/g, ' ').trim()
  if (!t) return ''
  if (t.length <= maxLen) return t
  return `${t.slice(0, maxLen - 1)}…`
}

function snippetAround(text: string, re: RegExp, maxLen: number) {
  const t = String(text || '').replace(/\s+/g, ' ').trim()
  if (!t) return ''
  const m = t.match(re)
  if (!m || m.index === undefined) return excerpt(t, maxLen)
  const idx = m.index
  const start = Math.max(0, idx - Math.floor(maxLen / 2))
  const end = Math.min(t.length, start + maxLen)
  const s = t.slice(start, end)
  return `${start > 0 ? '…' : ''}${s}${end < t.length ? '…' : ''}`
}

function findEvidence(
  pages: Array<{ url: string; text: string }>,
  re: RegExp,
  fallbackUrl: string,
): { url: string; excerpt: string } {
  for (const p of pages) {
    if (!p?.text) continue
    if (!re.test(p.text)) continue
    return { url: p.url || fallbackUrl, excerpt: snippetAround(p.text, re, 240) }
  }
  const main = pages[0]
  return { url: main?.url || fallbackUrl, excerpt: excerpt(main?.text || '', 240) }
}

export function detectStandardPresence(urls: string[]) {
  const out = { contact: false, services: false, zones: false, tarifs: false, cgv: false, mentions_legales: false, rgaa: false }
  for (const u of urls) {
    let p = ''
    try {
      p = new URL(u).pathname.toLowerCase()
    } catch {
      continue
    }
    if (/(^|\/)(contact|contacts)(\/|$)/.test(p)) out.contact = true
    if (/(^|\/)(service|services|prestation|prestations)(\/|$)/.test(p)) out.services = true
    if (/(^|\/)(zone|zones|secteur|intervention)(\/|$)/.test(p)) out.zones = true
    if (/(^|\/)(tarif|tarifs|prix)(\/|$)/.test(p)) out.tarifs = true
    if (/(^|\/)(cgv|conditions-generales-de-vente|conditions-generales)(\/|$)/.test(p)) out.cgv = true
    if (/(^|\/)(mentions-legales|mentions_legales|mentions|legal|legal-notice)(\/|$)/.test(p)) out.mentions_legales = true
    if (/(^|\/)(accessibilite|accessibility|declaration-accessibilite|declaration_accessibilite|rgaa)(\/|$)/.test(p)) out.rgaa = true
  }
  return out
}

function computeScore(findings: any[]) {
  const weight = (sev: string) => (sev === 'high' ? 22 : sev === 'medium' ? 11 : 6)
  const breakdown: Record<string, { count: number; penalty: number }> = {}
  let penalty = 0
  for (const f of findings || []) {
    const cat = String(f?.category || 'other')
    const sev = String(f?.severity || 'low').toLowerCase()
    const w = weight(sev)
    penalty += w
    if (!breakdown[cat]) breakdown[cat] = { count: 0, penalty: 0 }
    breakdown[cat].count += 1
    breakdown[cat].penalty += w
  }
  const score = Math.max(0, Math.min(100, 100 - penalty))
  return { score, breakdown }
}

function computeScoreV2(findings: any[], profile: any, presence: { contact: boolean; services: boolean; zones: boolean; tarifs: boolean; cgv?: boolean }) {
  const base = computeScore(findings)
  let bonus = 0
  if (profile?.phone) bonus += 4
  if (profile?.email) bonus += 2
  if (profile?.opening_hours) bonus += 2
  if (Array.isArray(profile?.services) && profile.services.length) bonus += 2
  if (Array.isArray(profile?.postal_codes) && profile.postal_codes.length) bonus += 2
  if (profile?.ctas?.call) bonus += 3
  if (profile?.ctas?.form) bonus += 2
  if (profile?.ctas?.whatsapp) bonus += 1
  if (profile?.ctas?.devis) bonus += 1

  let extraPenalty = 0
  if (!presence.contact) extraPenalty += 6
  if (!presence.services) extraPenalty += 5
  if (!presence.zones) extraPenalty += 4
  if (!presence.tarifs) extraPenalty += 3

  const score = Math.max(0, Math.min(100, base.score + bonus - extraPenalty))
  return { score, breakdown: base.breakdown }
}

function buildRulesAudit(input: {
  sourceUrl: string
  urls: {
    url: string
    title: string
    text: string
    headings?: string[]
    items?: string[]
    ctas?: { hasTelLink: boolean; telNumbers?: string[]; hasWhatsappLink: boolean; hasForm: boolean; hasDevisCta: boolean }
  }[]
}) {
  const now = new Date().toISOString()
  const main = input.urls[0]
  const text = input.urls.map((u) => u.text).join('\n')
  const lower = text.toLowerCase()
  const hasPhone = extractPhonesFromText(text).length > 0 || input.urls.some((u) => (u.ctas as any)?.hasTelLink)
  const hasContact = /(contact|devis|rappel|appelez|téléphone|tel\b)/i.test(lower)
  const findings: any[] = []
  const extracted = computeProfileFromPages(input.urls, '')
  const presence = detectStandardPresence(input.urls.map((u) => u.url))
  if (!presence.tarifs) {
    if (hasPricingSignals(text)) presence.tarifs = true
  }
  const lowerAll = input.urls.map((u) => String(u.text || '')).join('\n').toLowerCase()
  if (!presence.mentions_legales) {
    if (/(mentions\s+l[eé]gales|mentions\s+legales|legal\s+notice|impressum|r[ée]daction|éditeur|editeur|responsable\s+de\s+publication)/i.test(lowerAll)) {
      presence.mentions_legales = true
    }
  }
  if (!presence.cgv) {
    if (/(conditions\s+g[ée]n[ée]rales\s+de\s+vente|\bcgv\b)/i.test(lowerAll)) {
      presence.cgv = true
    }
  }
  if (!presence.rgaa) {
    if (/(d[ée]claration\s+d['’]accessibilit[ée]|accessibilit[ée]\s+(rgaa)?|\brgaa\b)/i.test(lowerAll)) {
      presence.rgaa = true
    }
  }
  if (!hasPhone) {
    findings.push({
      category: 'conversion',
      title: 'Numéro de téléphone difficile à trouver',
      severity: 'high',
      evidence: [findEvidence(input.urls as any, /(contact|appel|téléphone|tel\b|devis)/i, main?.url || input.sourceUrl)],
      recommendations: ['Afficher un numéro cliquable dès l’en-tête (mobile-first).', 'Répéter le CTA “Appeler” sur les pages clés.'],
    })
  } else if (!extracted.profile.ctas?.call) {
    findings.push({
      category: 'conversion',
      title: 'Numéro présent mais non cliquable',
      severity: 'medium',
      evidence: [findEvidence(input.urls as any, /(?:\+33|0033|0)\s*[1-9](?:[\s.\-]?\d{2}){4}\b|(\b0[1-9]\d{8}\b)/i, main?.url || input.sourceUrl)],
      recommendations: ['Ajouter un lien tel: sur le numéro (mobile-first).', 'Rendre le CTA “Appeler” visible dès l’en-tête.'],
    })
  }
  if (!hasContact) {
    findings.push({
      category: 'conversion',
      title: 'Parcours de demande peu explicite',
      severity: 'medium',
      evidence: [findEvidence(input.urls as any, /(contact|devis|rappel|demande)/i, main?.url || input.sourceUrl)],
      recommendations: ['Mettre en avant une action principale (Appeler / Devis) dès la première section.', 'Réduire la friction (formulaire court, promesse claire).'],
    })
  }
  if (!presence.services) {
    findings.push({
      category: 'content',
      title: 'Pas de page Services dédiée détectée',
      severity: 'medium',
      evidence: [{ url: main?.url || input.sourceUrl, excerpt: excerpt(main?.text || '', 240) }],
      recommendations: ['Créer une page Services avec une section par prestation.', 'Ajouter des preuves (avis, garanties) sur les services les plus demandés.'],
    })
  }
  if (!presence.zones) {
    findings.push({
      category: 'seo_local',
      title: 'Pas de page Zones/secteur d’intervention détectée',
      severity: 'medium',
      evidence: [{ url: main?.url || input.sourceUrl, excerpt: excerpt(main?.text || '', 240) }],
      recommendations: ['Créer une page Zones listant les villes/codes postaux couverts.', 'Ajouter une phrase de zone sur la home + dans le CTA.'],
    })
  }
  if (!presence.tarifs) {
    findings.push({
      category: 'trust',
      title: 'Pas de page Tarifs/prix détectée',
      severity: 'low',
      evidence: [{ url: main?.url || input.sourceUrl, excerpt: excerpt(main?.text || '', 240) }],
      recommendations: ['Publier une grille de tarifs indicative (ou “à partir de”).', 'Répondre aux questions fréquentes sur les coûts (déplacement, diagnostic, etc.).'],
    })
  }
  if (!presence.mentions_legales) {
    findings.push({
      category: 'trust',
      title: 'Mentions légales non détectées',
      severity: 'medium',
      evidence: [{ url: main?.url || input.sourceUrl, excerpt: excerpt(main?.text || '', 240) }],
      recommendations: ['Ajouter une page “Mentions légales” accessible depuis le footer.', 'Indiquer l’éditeur, l’hébergeur, et un moyen de contact.'],
    })
  }
  if (!presence.cgv) {
    findings.push({
      category: 'trust',
      title: 'CGV non détectées',
      severity: 'low',
      evidence: [{ url: main?.url || input.sourceUrl, excerpt: excerpt(main?.text || '', 240) }],
      recommendations: ['Publier des CGV (si vente/prestation en ligne).', 'Ajouter un lien “CGV” depuis le footer.'],
    })
  }
  if (!presence.rgaa) {
    findings.push({
      category: 'trust',
      title: 'Déclaration d’accessibilité (RGAA) non détectée',
      severity: 'low',
      evidence: [{ url: main?.url || input.sourceUrl, excerpt: excerpt(main?.text || '', 240) }],
      recommendations: ['Publier une déclaration d’accessibilité (RGAA) et un contact accessibilité.', 'Ajouter un lien “Accessibilité” depuis le footer.'],
    })
  }
  if (findings.length === 0) {
    findings.push({
      category: 'conversion',
      title: 'Opportunités d’optimisation',
      severity: 'low',
      evidence: [{ url: main?.url || input.sourceUrl, excerpt: excerpt(main?.text || '', 240) }],
      recommendations: ['Renforcer la preuve (avis, garanties) près du CTA.', 'Clarifier zone et délais d’intervention sur la home.'],
    })
  }

  const customPages = detectCustomPages(input.urls.map((u) => u.url))
  const scoring = computeScoreV2(findings, extracted.profile, presence)

  return {
    meta: {
      audit_version: 1,
      generated_at: now,
      current_site_url: input.sourceUrl,
      analyzed_urls: input.urls.map((u) => u.url),
      mode: 'rules',
      confidence: 0.55,
      score: scoring.score,
      score_breakdown: scoring.breakdown,
      pages_present: presence,
    },
    profile: {
      company_name: extracted.profile.company_name,
      phone: extracted.profile.phone,
      email: extracted.profile.email,
      website: null,
      services: extracted.profile.services || [],
      postal_codes: extracted.profile.postal_codes || [],
      city: null,
      service_area: extracted.profile.service_area || null,
      opening_hours: extracted.profile.opening_hours || null,
      ctas: extracted.profile.ctas || { call: false, whatsapp: false, form: false, devis: false },
      confidence: 0.55,
    },
    executive_summary: findings.slice(0, 5).map((f) => f.title),
    findings,
    site_plan: {
      standard_pages: ['home', 'services', 'zones', 'tarifs', 'contact', 'mentions_legales', 'cgv', 'accessibilite'],
      custom_pages: customPages,
    },
    commercial: {
      before_after:
        'Avant : un site vitrine difficile à faire évoluer, qui présente l’activité mais transforme mal les visites en demandes, et sans mesure claire de ce qui fonctionne.\nAprès : un site pensé pour convertir (appel / devis), avec un suivi simple et des améliorations continues basées sur la donnée.\n\nConcrètement, ce qu’on met en place :\n- Un message clair dès l’arrivée (métier + zone + promesse) et un CTA visible immédiatement.\n- Un parcours “demande” mobile-first : appel / WhatsApp / devis en quelques secondes.\n- Des preuves au bon endroit : avis, garanties, éléments rassurants là où le client hésite.\n- Des pages adaptées aux intentions (services, zones, tarifs) pour répondre vite aux questions clés.\n- Un pilotage par les chiffres : suivi des clics et des demandes, et optimisation progressive.\n\nCe que vous gagnez :\n- Plus de demandes, plus rapidement, avec moins de pertes.\n- Un site qui s’améliore au fil du temps au lieu de rester figé.',
    },
    limitations: [],
  }
}

export async function generateSiteAudit(input: { auditId: string; businessId: string; sourceUrl: string }) {
  const auditId = input.auditId
  const businessId = input.businessId
  const sourceUrl = normalizeUrl(input.sourceUrl)
  if (!sourceUrl) throw new Error('Invalid url')

  const urlObj = new URL(sourceUrl)
  const isFacebook = ['facebook.com', 'm.facebook.com', 'mbasic.facebook.com'].some((h) => urlObj.hostname === h || urlObj.hostname.endsWith(`.${h}`))

  const html = await safeFetchHtml(sourceUrl, isFacebook ? { maxBytes: 800_000 } : undefined)
  const facebook = isFacebook ? parseFacebookPublic(html, sourceUrl) : null
  const logo_url = extractLogoUrl(html, sourceUrl) || null
  const accessibility_checks = computeAccessibilityChecksFromHtml(html)
  const links = isFacebook ? [] : extractLinks(html, sourceUrl)
  const sitemapUrls = isFacebook ? [] : await loadSitemapUrls(sourceUrl)
  const picked = isFacebook ? [sourceUrl] : pickUrls(sourceUrl, [...sitemapUrls, ...links], 15)

  const pages: {
    url: string
    title: string
    text: string
    headings?: string[]
    items?: string[]
    ctas?: { hasTelLink: boolean; hasWhatsappLink: boolean; hasForm: boolean; hasDevisCta: boolean }
  }[] = []
  for (const url of picked) {
    try {
      const h = url === sourceUrl ? html : await safeFetchHtml(url)
      const title = extractTitle(h)
      const text = stripTags(h).slice(0, 12_000)
      const hints = extractTextHints(h)
      const ctas = extractCtasFromHtml(h, text)
      pages.push({ url, title, text, headings: hints.headings, items: hints.items, ctas })
    } catch {}
  }

  const baseProfile = computeProfileFromPages(pages, html)
  ;(baseProfile.profile as any).logo_url = (baseProfile.profile as any).logo_url || logo_url
  const presence = detectStandardPresence(pages.map((p) => p.url))
  if (!presence.tarifs) {
    const allText = pages.map((p) => String(p.text || '')).join('\n')
    if (hasPricingSignals(allText)) presence.tarifs = true
  }
  const lowerAll = pages.map((p) => String(p.text || '')).join('\n').toLowerCase()
  if (!presence.mentions_legales) {
    if (/(mentions\s+l[eé]gales|mentions\s+legales|legal\s+notice|impressum|r[ée]daction|éditeur|editeur|responsable\s+de\s+publication)/i.test(lowerAll)) {
      presence.mentions_legales = true
    }
  }
  if (!presence.cgv) {
    if (/(conditions\s+g[ée]n[ée]rales\s+de\s+vente|\bcgv\b)/i.test(lowerAll)) {
      presence.cgv = true
    }
  }
  if (!presence.rgaa) {
    if (/(d[ée]claration\s+d['’]accessibilit[ée]|accessibilit[ée]\s+(rgaa)?|\brgaa\b)/i.test(lowerAll)) {
      presence.rgaa = true
    }
  }

  let pagespeed: any = null
  try {
    const ps = await runPageSpeed(sourceUrl, 'mobile')
    pagespeed = {
      strategy: 'mobile',
      performance_score: ps.performance_score,
      accessibility_score: ps.accessibility_score,
      seo_score: ps.seo_score,
      best_practices_score: ps.best_practices_score,
    }
  } catch {
    pagespeed = null
  }

  const provider = String(process.env.AI_PROVIDER || '').trim()
  if (!provider || provider !== 'openai_compatible') {
    const base = buildRulesAudit({ sourceUrl, urls: pages })
    base.profile = { ...(base as any).profile, ...baseProfile.profile, confidence: baseProfile.confidence }
    if (facebook?.profile) {
      base.profile = { ...(base as any).profile, ...facebook.profile }
      base.limitations = Array.isArray((base as any).limitations) ? [...(base as any).limitations, ...(facebook.limitations || [])] : facebook.limitations || []
      base.meta.mode = isFacebook ? 'rules_facebook' : 'rules'
    }
    const scoring = computeScoreV2(base.findings || [], base.profile || {}, presence)
    base.meta.score = scoring.score
    base.meta.score_breakdown = scoring.breakdown
    base.meta.pages_present = presence
    ;(base.meta as any).audit_id = auditId
    ;(base.meta as any).business_id = businessId
    ;(base.meta as any).accessibility_checks = accessibility_checks
    ;(base.meta as any).pagespeed = pagespeed
    return base
  }

  const payload = {
    source_url: sourceUrl,
    analyzed_urls: pages.map((p) => ({ url: p.url, title: p.title })),
    pages: pages.map((p) => ({ url: p.url, title: p.title, text: p.text.slice(0, 5000) })),
    constraints: { language: 'fr-FR', max_findings: 8, max_summary_points: 5, small_sites_only: true },
    commercial_tone: 'assumé',
    prefill: { ...(baseProfile.profile || {}), ...(facebook?.profile || {}) },
    limitations: facebook?.limitations || null,
    discovered: { sitemap_urls: sitemapUrls.slice(0, 20), custom_pages: detectCustomPages(picked) },
  }

  const schema = {
    meta: { audit_version: 'number', generated_at: 'string', current_site_url: 'string', analyzed_urls: ['string'], mode: 'string', confidence: 'number' },
    profile: {
      company_name: 'string|null',
      phone: 'string|null',
      email: 'string|null',
      website: 'string|null',
      services: ['string'],
      postal_codes: ['string'],
      city: 'string|null',
      service_area: 'string|null',
      opening_hours: 'string|null',
      ctas: { call: 'boolean', whatsapp: 'boolean', form: 'boolean', devis: 'boolean' },
      confidence: 'number',
    },
    executive_summary: ['string'],
    findings: [
      {
        category: 'conversion|seo_local|trust|content|technical',
        title: 'string',
        severity: 'low|medium|high',
        evidence: [{ url: 'string', excerpt: 'string' }],
        recommendations: ['string'],
      },
    ],
    site_plan: {
      standard_pages: ['string'],
      custom_pages: [{ slug_suggestion: 'string', title: 'string', goal: 'string', sections: ['string'] }],
    },
    commercial: { before_after: 'string' },
    limitations: ['string'],
  }

  const out = await chatJson([
    {
      role: 'system',
      content:
        'Tu es un expert web conversion/SEO local pour très petites entreprises. Tu produis un audit court, actionnable, orienté résultats. Réponds uniquement en JSON valide, sans markdown, sans texte autour. Chaque constat doit inclure au moins 1 preuve (url + extrait).',
    },
    {
      role: 'user',
      content: JSON.stringify({
        task: 'Générer un audit générique + plan de site recommandé (pages standard + pages custom si besoin). Inclure une section commerciale AVANT/APRÈS assumée.',
        schema,
        input: payload,
        before_after_copy:
          'Avant : un site vitrine difficile à faire évoluer, qui présente l’activité mais transforme mal les visites en demandes, et sans mesure claire de ce qui fonctionne.\nAprès : un site pensé pour convertir (appel / devis), avec un suivi simple et des améliorations continues basées sur la donnée.\n\nConcrètement, ce qu’on met en place :\n- Un message clair dès l’arrivée (métier + zone + promesse) et un CTA visible immédiatement.\n- Un parcours “demande” mobile-first : appel / WhatsApp / devis en quelques secondes.\n- Des preuves au bon endroit : avis, garanties, éléments rassurants là où le client hésite.\n- Des pages adaptées aux intentions (services, zones, tarifs) pour répondre vite aux questions clés.\n- Un pilotage par les chiffres : suivi des clics et des demandes, et optimisation progressive.\n\nCe que vous gagnez :\n- Plus de demandes, plus rapidement, avec moins de pertes.\n- Un site qui s’améliore au fil du temps au lieu de rester figé.',
      }),
    },
  ])

  const now = new Date().toISOString()
  const meta = out?.meta && typeof out.meta === 'object' ? out.meta : {}
  meta.audit_version = 1
  meta.generated_at = now
  meta.current_site_url = sourceUrl
  meta.analyzed_urls = pages.map((p) => p.url)
  meta.mode = isFacebook ? 'ai_facebook' : 'ai'
  const scoring = computeScoreV2(Array.isArray(out?.findings) ? out.findings : [], out?.profile || {}, presence)
  meta.score = scoring.score
  meta.score_breakdown = scoring.breakdown
  meta.pages_present = presence
  ;(meta as any).audit_id = auditId
  ;(meta as any).business_id = businessId
  ;(meta as any).accessibility_checks = accessibility_checks
  ;(meta as any).pagespeed = pagespeed

  const profile = out?.profile && typeof out.profile === 'object' ? out.profile : {}
  ;(profile as any).confidence = typeof (profile as any).confidence === 'number' ? (profile as any).confidence : baseProfile.confidence
  ;(profile as any).company_name = (profile as any).company_name ?? baseProfile.profile.company_name
  ;(profile as any).phone = (profile as any).phone ?? baseProfile.profile.phone
  ;(profile as any).email = (profile as any).email ?? baseProfile.profile.email
  ;(profile as any).website = (profile as any).website ?? baseProfile.profile.website
  ;(profile as any).logo_url = (profile as any).logo_url ?? (baseProfile.profile as any).logo_url ?? null
  ;(profile as any).services =
    Array.isArray((profile as any).services) && (profile as any).services.length ? (profile as any).services : baseProfile.profile.services || []
  ;(profile as any).postal_codes =
    Array.isArray((profile as any).postal_codes) && (profile as any).postal_codes.length ? (profile as any).postal_codes : baseProfile.profile.postal_codes || []
  ;(profile as any).service_area = (profile as any).service_area ?? baseProfile.profile.service_area
  ;(profile as any).opening_hours = (profile as any).opening_hours ?? baseProfile.profile.opening_hours
  ;(profile as any).ctas =
    (profile as any).ctas && typeof (profile as any).ctas === 'object'
      ? (profile as any).ctas
      : (baseProfile.profile as any).ctas || { call: false, whatsapp: false, form: false, devis: false }

  return { ...out, meta, profile }
}
