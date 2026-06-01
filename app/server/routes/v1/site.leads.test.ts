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

describe('site leads', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it(
    'refuse un payload incomplet (first_name requis)',
    async () => {
    vi.resetModules()
    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        get: async () => ({ config_json: JSON.stringify({ trade_id: 'x', zones: { mode: 'list', zone_list: ['75001'] } }) }),
        run: async () => {},
      }),
    }))
    vi.doMock('../../specs.js', () => ({
      loadSpecs: () => ({ scoring: { common: { points: {} }, thresholds: {} } }),
    }))
    const mod = await import('./site')
    const req: any = {
      params: { businessId: 'b1' },
      body: {
        trade_id: 'x',
        request_type: 'foo',
        urgency: 'now',
        channel_preference: 'call',
        first_name: '',
        phone: '+33123456789',
        city: 'Paris',
        postal_code: '75001',
        answers: {},
        photos: [],
        consent: {},
      },
    }
    const res = createRes()
    await mod.submitLeadHandler(req, res as any)
    expect(res.statusCode).toBe(400)
    },
    20_000,
  )

  it('normalise urgency=plan en urgency=week', async () => {
    vi.resetModules()
    const scoringCalls: any[] = []
    vi.doMock('../../scoring.js', () => ({
      computeScore: (_spec: any, input: any) => {
        scoringCalls.push(input)
        return { score: 0, decision: 'needs_followup', tags: [] }
      },
    }))
    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        get: async () => ({ config_json: JSON.stringify({ trade_id: 'x', zones: { mode: 'list', zone_list: ['75001'] } }) }),
        run: async () => {},
      }),
    }))
    vi.doMock('../../specs.js', () => ({
      loadSpecs: () => ({ scoring: { common: { points: {} }, thresholds: {} } }),
    }))
    const mod = await import('./site')
    const req: any = {
      params: { businessId: 'b1' },
      body: {
        trade_id: 'x',
        request_type: 'foo',
        urgency: 'plan',
        channel_preference: 'call',
        first_name: 'A',
        phone: '+33123456789',
        city: 'Paris',
        postal_code: '75001',
        answers: {},
        photos: [],
        consent: {},
      },
    }
    const res = createRes()
    await mod.submitLeadHandler(req, res as any)
    expect(res.statusCode).toBe(201)
    expect(scoringCalls[0]?.urgency).toBe('week')
  })

  it('calcule in_zone=false si excluded_zones contient le code postal', async () => {
    vi.resetModules()
    const scoringCalls: any[] = []
    vi.doMock('../../scoring.js', () => ({
      computeScore: (_spec: any, input: any) => {
        scoringCalls.push(input)
        return { score: 0, decision: 'needs_followup', tags: [] }
      },
    }))
    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        get: async () => ({
          config_json: JSON.stringify({
            trade_id: 'x',
            zones: { mode: 'list', zone_list: ['75001'], excluded_zones: ['75001'] },
          }),
        }),
        run: async () => {},
      }),
    }))
    vi.doMock('../../specs.js', () => ({
      loadSpecs: () => ({ scoring: { common: { points: {} }, thresholds: {} } }),
    }))
    const mod = await import('./site')
    const req: any = {
      params: { businessId: 'b1' },
      body: {
        trade_id: 'x',
        request_type: 'foo',
        urgency: 'now',
        channel_preference: 'call',
        first_name: 'A',
        phone: '+33123456789',
        city: 'Paris',
        postal_code: '75001',
        answers: {},
        photos: [],
        consent: {},
      },
    }
    const res = createRes()
    await mod.submitLeadHandler(req, res as any)
    expect(scoringCalls[0]?.in_zone).toBe(false)
  })

  it('supporte zones.mode=radius via géocodage (api-adresse)', async () => {
    vi.resetModules()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: any) => {
        const url = String(input)
        if (url.includes('q=Paris')) {
          return new Response(
            JSON.stringify({ features: [{ geometry: { coordinates: [2.3522, 48.8566] } }] }),
            { status: 200 },
          )
        }
        if (url.includes('q=69001')) {
          return new Response(
            JSON.stringify({ features: [{ geometry: { coordinates: [4.8357, 45.764] } }] }),
            { status: 200 },
          )
        }
        return new Response(JSON.stringify({ features: [] }), { status: 200 })
      }),
    )

    const scoringCalls: any[] = []
    vi.doMock('../../scoring.js', () => ({
      computeScore: (_spec: any, input: any) => {
        scoringCalls.push(input)
        return { score: 0, decision: 'needs_followup', tags: [] }
      },
    }))
    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        get: async () => ({
          config_json: JSON.stringify({
            trade_id: 'x',
            city: 'Paris',
            zones: { mode: 'radius', radius_km: 10, excluded_zones: [] },
          }),
        }),
        run: async () => {},
      }),
    }))
    vi.doMock('../../specs.js', () => ({
      loadSpecs: () => ({ scoring: { common: { points: {} }, thresholds: {} } }),
    }))
    const mod = await import('./site')
    const req: any = {
      params: { businessId: 'b1' },
      body: {
        trade_id: 'x',
        request_type: 'foo',
        urgency: 'now',
        channel_preference: 'call',
        first_name: 'A',
        phone: '+33123456789',
        city: 'Paris',
        postal_code: '69001',
        answers: {},
        photos: [],
        consent: {},
      },
    }
    const res = createRes()
    await mod.submitLeadHandler(req, res as any)
    expect(scoringCalls[0]?.in_zone).toBe(false)
  })
})
