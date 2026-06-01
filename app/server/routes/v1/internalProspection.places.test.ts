import { describe, expect, it, vi, afterEach } from 'vitest'

function createRes() {
  const out: any = { statusCode: 200, body: null }
  out.status = (code: number) => {
    out.statusCode = code
    return out
  }
  out.json = (body: any) => {
    out.body = body
    return out
  }
  return out
}

describe('internal prospection places', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('search retourne des résultats', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'k'
    vi.doMock('../../prospection/places.js', () => ({
      searchPlaces: async () => [{ place_id: 'pid', name: 'ACME', address: 'Paris', lat: 1, lng: 2, rating: 4.7, reviews_count: 12 }],
    }))
    const { searchPlacesHandler } = await import('./internalProspection')
    const req: any = { body: { query: 'plombier paris' } }
    const res = createRes()
    await searchPlacesHandler(req, res as any)
    expect(res.statusCode).toBe(200)
    expect(res.body?.results?.length).toBe(1)
  }, 20_000)

  it('import insère un prospect à partir d’un place_id', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'k'
    vi.doMock('../../prospection/places.js', () => ({
      getPlaceDetails: async () => ({
        place_id: 'pid',
        name: 'ACME',
        address: 'Paris',
        lat: 1,
        lng: 2,
        rating: 4.7,
        reviews_count: 12,
        phone: '+331234',
        website: 'https://example.com',
      }),
    }))

    const runCalls: any[] = []
    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        run: async (sql: string, params: any[]) => runCalls.push({ sql, params }),
      }),
    }))

    const { importPlacesHandler } = await import('./internalProspection')
    const req: any = { body: { place_ids: ['pid'], trade_id: 'plombier_chauffagiste' } }
    const res = createRes()
    await importPlacesHandler(req, res as any)
    expect(res.statusCode).toBe(200)
    expect(runCalls.some((c) => String(c.sql).includes('INSERT INTO prospect'))).toBe(true)
  }, 20_000)
})
