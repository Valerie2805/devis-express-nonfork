import { describe, expect, it, vi, afterEach } from 'vitest'
import { searchPlaces, getPlaceDetails } from './places'

describe('places', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('searchPlaces appelle textsearch et mappe les champs essentiels', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'k'
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            status: 'OK',
            results: [
              {
                place_id: 'pid',
                name: 'ACME',
                formatted_address: 'Paris',
                geometry: { location: { lat: 1, lng: 2 } },
                rating: 4.7,
                user_ratings_total: 12,
              },
            ],
          }),
          { status: 200 },
        )
      }),
    )

    const out = await searchPlaces({ query: 'plombier paris' })
    expect(out.length).toBe(1)
    expect(out[0].place_id).toBe('pid')
    expect(out[0].name).toBe('ACME')
    expect(out[0].address).toBe('Paris')
    expect(out[0].lat).toBe(1)
    expect(out[0].lng).toBe(2)
  })

  it('getPlaceDetails appelle details et renvoie phone + website', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'k'
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            status: 'OK',
            result: {
              place_id: 'pid',
              name: 'ACME',
              formatted_address: 'Paris',
              formatted_phone_number: '+331234',
              website: 'https://example.com',
              geometry: { location: { lat: 1, lng: 2 } },
              rating: 4.7,
              user_ratings_total: 12,
            },
          }),
          { status: 200 },
        )
      }),
    )

    const out = await getPlaceDetails({ place_id: 'pid' })
    expect(out.place_id).toBe('pid')
    expect(out.phone).toBe('+331234')
    expect(out.website).toBe('https://example.com')
  })
})

