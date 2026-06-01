import { safeJsonParse } from '../utils.js'

export type PageSpeedStrategy = 'mobile' | 'desktop'

export type PageSpeedScores = {
  performance_score: number | null
  accessibility_score: number | null
  seo_score: number | null
  best_practices_score: number | null
  raw_json: string
}

function score01To100(v: any): number | null {
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  return Math.max(0, Math.min(100, Math.round(n * 100)))
}

export async function runPageSpeed(url: string, strategy: PageSpeedStrategy): Promise<PageSpeedScores> {
  const qs = new URLSearchParams({ url, strategy })
  const key = String(process.env.PAGESPEED_API_KEY || '').trim()
  if (key) qs.set('key', key)
  const endpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${qs.toString()}`
  const timeoutMs = Math.min(30_000, Math.max(2_000, Number(process.env.PAGESPEED_TIMEOUT_MS || 15_000)))
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), timeoutMs)
  let r: Response
  let raw = ''
  try {
    r = await fetch(endpoint, { method: 'GET', signal: ac.signal })
    raw = await r.text()
  } finally {
    clearTimeout(t)
  }
  if (!r.ok) {
    const err: any = new Error(`PageSpeed error (${r.status})`)
    err.status = r.status
    err.body = raw
    throw err
  }
  const data = safeJsonParse<any>(raw, null)
  const cats = data?.lighthouseResult?.categories || {}
  return {
    performance_score: score01To100(cats?.performance?.score),
    accessibility_score: score01To100(cats?.accessibility?.score),
    seo_score: score01To100(cats?.seo?.score),
    best_practices_score: score01To100(cats?.['best-practices']?.score),
    raw_json: raw,
  }
}
