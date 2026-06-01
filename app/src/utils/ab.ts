const KEY = 'mad_ab_v1'

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

function pickRandom() {
  return Math.random() < 0.5 ? 'A' : 'B'
}

export function getHeroVariant(): 'A' | 'B' {
  const url = new URL(window.location.href)
  const forced = url.searchParams.get('hero')
  if (forced === 'A' || forced === 'B') {
    safeSet(KEY, forced)
    return forced
  }
  const saved = safeGet(KEY)
  if (saved === 'A' || saved === 'B') return saved
  const v = pickRandom()
  safeSet(KEY, v)
  return v
}

