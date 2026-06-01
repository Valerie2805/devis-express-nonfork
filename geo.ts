type LatLng = { lat: number; lng: number }

const cache = new Map<string, LatLng | null>()

async function geocodeOne(query: string): Promise<LatLng | null> {
  const q = String(query || '').trim()
  if (!q) return null
  if (cache.has(q)) return cache.get(q) ?? null

  const url = new URL('https://api-adresse.data.gouv.fr/search/')
  url.searchParams.set('q', q)
  url.searchParams.set('limit', '1')

  const res = await fetch(url.toString())
  if (!res.ok) {
    cache.set(q, null)
    return null
  }
  const data = (await res.json()) as any
  const coords = data?.features?.[0]?.geometry?.coordinates
  const lng = Array.isArray(coords) ? coords[0] : null
  const lat = Array.isArray(coords) ? coords[1] : null
  const out = typeof lat === 'number' && typeof lng === 'number' ? { lat, lng } : null
  cache.set(q, out)
  return out
}

export async function getCoordsForPostalCode(postalCode: string) {
  const pc = String(postalCode || '').trim()
  if (!pc) return null
  return geocodeOne(`${pc} France`)
}

export async function getCoordsForCity(city: string) {
  const c = String(city || '').trim()
  if (!c) return null
  return geocodeOne(`${c} France`)
}

export function distanceKm(a: LatLng, b: LatLng) {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const sLat1 = (a.lat * Math.PI) / 180
  const sLat2 = (b.lat * Math.PI) / 180
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(sLat1) * Math.cos(sLat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)))
}

