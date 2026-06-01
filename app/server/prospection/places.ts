type TextSearchResult = {
  place_id?: string
  name?: string
  formatted_address?: string
  geometry?: { location?: { lat?: number; lng?: number } }
  rating?: number
  user_ratings_total?: number
}

type DetailsResult = {
  place_id?: string
  name?: string
  formatted_address?: string
  formatted_phone_number?: string
  website?: string
  geometry?: { location?: { lat?: number; lng?: number } }
  rating?: number
  user_ratings_total?: number
  reviews?: Array<{
    author_name?: string
    rating?: number
    text?: string
    time?: number
  }>
}

export type PlaceSearchItem = {
  place_id: string
  name: string
  address: string
  lat: number | null
  lng: number | null
  rating: number | null
  reviews_count: number | null
}

export type PlaceDetails = PlaceSearchItem & {
  phone: string | null
  website: string | null
  reviews: Array<{
    author_name: string
    rating: number | null
    text: string
    time: number | null
  }>
}

function mustApiKey() {
  const key = String(process.env.GOOGLE_PLACES_API_KEY || '').trim()
  if (!key) throw new Error('Missing GOOGLE_PLACES_API_KEY')
  return key
}

export async function searchPlaces(input: { query: string }) {
  const key = mustApiKey()
  const q = String(input.query || '').trim()
  if (!q) return []

  const url = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json')
  url.searchParams.set('query', q)
  url.searchParams.set('key', key)

  const res = await fetch(url.toString())
  const data = (await res.json()) as { status?: string; error_message?: string; results?: TextSearchResult[] }
  if (!res.ok || data.status !== 'OK') {
    throw new Error(data.error_message || data.status || `HTTP ${res.status}`)
  }

  return (data.results || [])
    .map((r): PlaceSearchItem | null => {
      const place_id = String(r.place_id || '').trim()
      const name = String(r.name || '').trim()
      if (!place_id || !name) return null
      const loc = r.geometry?.location
      const lat = typeof loc?.lat === 'number' ? loc.lat : null
      const lng = typeof loc?.lng === 'number' ? loc.lng : null
      const rating = Number.isFinite(Number(r.rating)) ? Number(r.rating) : null
      const reviews_count = Number.isFinite(Number(r.user_ratings_total)) ? Number(r.user_ratings_total) : null
      return {
        place_id,
        name,
        address: String(r.formatted_address || ''),
        lat,
        lng,
        rating,
        reviews_count,
      }
    })
    .filter(Boolean) as PlaceSearchItem[]
}

export async function getPlaceDetails(input: { place_id: string }): Promise<PlaceDetails> {
  const key = mustApiKey()
  const pid = String(input.place_id || '').trim()
  if (!pid) throw new Error('Missing place_id')

  const url = new URL('https://maps.googleapis.com/maps/api/place/details/json')
  url.searchParams.set('place_id', pid)
  url.searchParams.set(
    'fields',
    [
      'place_id',
      'name',
      'formatted_address',
      'formatted_phone_number',
      'website',
      'geometry/location',
      'rating',
      'user_ratings_total',
      'reviews',
    ].join(','),
  )
  url.searchParams.set('key', key)

  const res = await fetch(url.toString())
  const data = (await res.json()) as { status?: string; error_message?: string; result?: DetailsResult }
  if (!res.ok || data.status !== 'OK' || !data.result) {
    throw new Error(data.error_message || data.status || `HTTP ${res.status}`)
  }

  const r = data.result
  const place_id = String(r.place_id || '').trim()
  const name = String(r.name || '').trim()
  const loc = r.geometry?.location
  const lat = typeof loc?.lat === 'number' ? loc.lat : null
  const lng = typeof loc?.lng === 'number' ? loc.lng : null
  const rating = Number.isFinite(Number(r.rating)) ? Number(r.rating) : null
  const reviews_count = Number.isFinite(Number(r.user_ratings_total)) ? Number(r.user_ratings_total) : null
  const reviews = Array.isArray(r.reviews)
    ? r.reviews
        .map((rv) => ({
          author_name: String(rv?.author_name || '').trim(),
          rating: Number.isFinite(Number(rv?.rating)) ? Number(rv.rating) : null,
          text: String(rv?.text || ''),
          time: Number.isFinite(Number(rv?.time)) ? Number(rv.time) : null,
        }))
        .filter((rv) => Boolean(rv.author_name || rv.text))
    : []

  return {
    place_id,
    name,
    address: String(r.formatted_address || ''),
    lat,
    lng,
    rating,
    reviews_count,
    phone: r.formatted_phone_number ? String(r.formatted_phone_number) : null,
    website: r.website ? String(r.website) : null,
    reviews,
  }
}
