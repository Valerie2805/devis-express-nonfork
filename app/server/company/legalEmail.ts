import dns from 'dns/promises'
import net from 'net'

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

async function safeFetchHtml(url: string) {
  const u = new URL(url)
  await assertPublicHost(u)
  const res = await fetch(u.toString(), { method: 'GET', headers: { 'user-agent': 'DevisExpressAuditBot/1.0' } })
  if (!res.ok) throw new Error(`Fetch failed (${res.status})`)
  return await res.text()
}

function extractFirstEmail(text: string): string | null {
  const re = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
  const m = String(text || '').match(re) || []
  const email = m.find((e) => !/no-?reply/i.test(e)) || null
  return email ? email.toLowerCase() : null
}

function findLegalUrl(baseUrl: string, html: string): string | null {
  const base = new URL(baseUrl)
  const re = /href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]{0,80})/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(html))) {
    const href = String(match[1] || '').trim()
    const label = String(match[2] || '').toLowerCase()
    const hrefLc = href.toLowerCase()
    const looksLegal =
      hrefLc.includes('mentions-legales') ||
      hrefLc.includes('mentions_legales') ||
      hrefLc.includes('impressum') ||
      hrefLc.includes('legal') ||
      label.includes('mentions') ||
      label.includes('impressum')
    if (!looksLegal) continue
    try {
      const u = new URL(href, base.toString())
      if (u.origin !== base.origin) continue
      return u.toString()
    } catch {}
  }
  return null
}

export async function scrapeLegalEmail(websiteUrl: string): Promise<{ email: string | null; legal_url: string | null }> {
  const home = await safeFetchHtml(websiteUrl)
  const emailHome = extractFirstEmail(home)
  const legalUrl = findLegalUrl(websiteUrl, home)
  if (emailHome) return { email: emailHome, legal_url: legalUrl }
  if (!legalUrl) return { email: null, legal_url: null }
  const legal = await safeFetchHtml(legalUrl)
  const email = extractFirstEmail(legal)
  return { email, legal_url: legalUrl }
}

