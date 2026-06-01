type Utm = {
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_term?: string
  utm_content?: string
  landing_path?: string
  referrer?: string
}

const KEY = 'mad_utms_v1'
const SESSION_KEY = 'mad_session_v1'
const VIEW_DEDUPE_KEY = 'mad_view_dedupe_v1'

function safeGet(key: string) {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
  } catch {}
}

function safeSessionGet(key: string) {
  try {
    return window.sessionStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSessionSet(key: string, value: string) {
  try {
    window.sessionStorage.setItem(key, value)
  } catch {}
}

function getSessionId() {
  const existing = safeGet(SESSION_KEY)
  if (existing) return existing
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Math.random()).slice(2)
  safeSet(SESSION_KEY, id)
  return id
}

export function captureUtm() {
  const url = new URL(window.location.href)
  const utm: Utm = {}
  const keys: (keyof Utm)[] = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']
  let hasNew = false
  for (const k of keys) {
    const v = url.searchParams.get(k as string)
    if (v) {
      ;(utm as any)[k] = v
      hasNew = true
    }
  }
  const referrer = document.referrer || ''
  if (referrer) utm.referrer = referrer
  utm.landing_path = url.pathname

  if (hasNew) {
    safeSet(KEY, JSON.stringify({ ...utm, ts: Date.now() }))
    return utm
  }
  const saved = safeGet(KEY)
  if (!saved) return utm
  try {
    const parsed = JSON.parse(saved) as any
    const age = Date.now() - Number(parsed.ts || 0)
    if (age > 30 * 864e5) return utm
    return parsed as Utm
  } catch {
    return utm
  }
}

export async function track(businessId: string, tradeId: string, name: string, payload: Record<string, any>) {
  if ((window as any).__mad_tracking_enabled === false) return
  const utm = captureUtm()
  const session_id = getSessionId()
  const props = { ...(payload.properties || {}) }
  if (props.device === undefined) {
    const w = typeof window !== 'undefined' ? window.innerWidth : 1024
    props.device = w < 768 ? 'mobile' : 'desktop'
  }
  if (props.experiments === undefined) {
    const exp = (window as any).__mad_experiments
    if (exp && typeof exp === 'object') props.experiments = exp
  }
  if (props.variant === undefined) {
    const v = (window as any).__mad_hero_variant
    if (v === 'A' || v === 'B') props.variant = v
  }
  const page_type = payload.page_type || 'other'
  const page_path = payload.page_path || window.location.pathname

  if (name === 'view_hero') {
    const expVariant = props.experiments?.hero?.variant as any
    const variant = expVariant === 'A' || expVariant === 'B' ? expVariant : typeof props.variant === 'string' ? props.variant : ''
    const raw = safeSessionGet(VIEW_DEDUPE_KEY)
    const seen = raw ? safeJsonParse(raw) : {}
    const k = `${businessId}:${name}:${page_type}:${page_path}:${variant}`
    if (seen[k]) return
    seen[k] = 1
    safeSessionSet(VIEW_DEDUPE_KEY, JSON.stringify(seen))
  }

  if (name === 'open_quote_form') {
    const raw = safeSessionGet(VIEW_DEDUPE_KEY)
    const seen = raw ? safeJsonParse(raw) : {}
    const autoKey = `${businessId}:${name}:auto:${page_type}:${page_path}`
    if (props.trigger === 'cta_click') {
      seen[autoKey] = 1
      safeSessionSet(VIEW_DEDUPE_KEY, JSON.stringify(seen))
    } else {
      if (seen[autoKey]) return
      seen[autoKey] = 1
      safeSessionSet(VIEW_DEDUPE_KEY, JSON.stringify(seen))
    }
  }
  const body = {
    session_id,
    trade_id: tradeId,
    name,
    page_type,
    page_path,
    properties: props,
    utm: {
      utm_source: utm.utm_source,
      utm_medium: utm.utm_medium,
      utm_campaign: utm.utm_campaign,
      utm_term: utm.utm_term,
      utm_content: utm.utm_content,
    },
    referrer: utm.referrer,
  }
  await fetch(`/api/v1/analytics/${businessId}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function getLeadAttribution() {
  const utm = captureUtm()
  return {
    utm_source: utm.utm_source || null,
    utm_medium: utm.utm_medium || null,
    utm_campaign: utm.utm_campaign || null,
    utm_term: utm.utm_term || null,
    utm_content: utm.utm_content || null,
    referrer: utm.referrer || null,
    landing_path: utm.landing_path || null,
  }
}

function safeJsonParse(s: string) {
  try {
    return JSON.parse(s)
  } catch {
    return {}
  }
}
