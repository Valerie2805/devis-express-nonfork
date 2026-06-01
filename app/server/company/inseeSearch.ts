type SearchResult = {
  results?: Array<{
    siren?: string
    nom_complet?: string
    code_postal?: string
    siege?: boolean
    tranche_effectif_salarie?: string | null
  }>
}

function normalize(s: string) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function mapEffectifCodeToRange(code: string | null | undefined) {
  const c = String(code || '').trim().toUpperCase()
  if (!c || c === 'NN' || c === '00') return null
  if (c === '01' || c === '02' || c === '03') return '1_9'
  if (c === '11') return '10_19'
  if (c === '12') return '20_49'
  if (c === '21') return '50_99'
  if (['22', '31', '32', '41', '42', '51', '52', '53'].includes(c)) return '100_plus'
  return null
}

function extractPostalCode(address: string) {
  const m = String(address || '').match(/\b(\d{5})\b/)
  return m ? m[1] : ''
}

function scoreCandidate(input: { name: string; postalCode: string }, row: any) {
  const inName = normalize(input.name)
  const outName = normalize(String(row?.nom_complet || ''))
  const inPostal = String(input.postalCode || '').trim()
  const outPostal = String(row?.code_postal || '').trim()
  let score = 0
  if (inPostal && outPostal && inPostal === outPostal) score += 6
  if (inName && outName) {
    if (outName === inName) score += 8
    else if (outName.includes(inName) || inName.includes(outName)) score += 5
    else {
      const parts = inName.split(' ').filter(Boolean)
      const hit = parts.filter((p) => p.length >= 3 && outName.includes(p)).length
      score += Math.min(4, hit)
    }
  }
  if (row?.siege === true) score += 1
  return score
}

export async function lookupEffectifsFromInsee(input: { name: string; address?: string | null; postalCode?: string | null }) {
  if (String(process.env.NODE_ENV || '').trim() === 'test') return null
  const name = String(input.name || '').trim()
  if (!name) return null
  const postalCode = String(input.postalCode || '').trim() || extractPostalCode(String(input.address || ''))
  const url = new URL('https://recherche-entreprises.api.gouv.fr/search')
  url.searchParams.set('q', name)
  if (postalCode) url.searchParams.set('code_postal', postalCode)
  url.searchParams.set('per_page', '10')

  let data: SearchResult | null = null
  try {
    const timeoutMs = Math.min(10_000, Math.max(1_000, Number(process.env.INSEE_TIMEOUT_MS || 4_000)))
    const ac = new AbortController()
    const t = setTimeout(() => ac.abort(), timeoutMs)
    let res: Response
    try {
      res = await fetch(url.toString(), { headers: { 'User-Agent': 'devisexpress/1.0' }, signal: ac.signal })
    } finally {
      clearTimeout(t)
    }
    if (!res.ok) return null
    data = (await res.json()) as SearchResult
  } catch {
    return null
  }
  const rows = Array.isArray(data?.results) ? data.results : []
  if (!rows.length) return null

  let best: any = null
  let bestScore = -1
  for (const r of rows) {
    const sc = scoreCandidate({ name, postalCode }, r)
    if (sc > bestScore) {
      bestScore = sc
      best = r
    }
  }
  if (!best || bestScore < 6) return null
  const headcount_range = mapEffectifCodeToRange(best.tranche_effectif_salarie)
  if (!headcount_range) return null
  return { headcount_range, siren: best.siren ? String(best.siren) : null, source: 'insee' as const }
}
