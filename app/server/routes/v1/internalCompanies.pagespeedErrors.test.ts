import { describe, expect, it, vi, afterEach } from 'vitest'

describe('internal companies pagespeed errors', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('retourne 502 si PSI répond 500', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('oops', { status: 500 })),
    )

    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        get: async (sql: string, params: any[]) => {
          if (sql.includes('FROM company_profile') && params[0] === 'b1') return { business_id: 'b1', website_url: 'https://acme.fr' }
          return null
        },
        run: async () => {},
      }),
    }))

    const { runPagespeedHandler } = await import('./internalCompanies')
    const req: any = { params: { companyKey: 'business:b1' } }
    const res: any = { statusCode: 200, body: null, status: (c: number) => ((res.statusCode = c), res), json: (b: any) => ((res.body = b), res) }
    await runPagespeedHandler(req, res)

    expect(res.statusCode).toBe(502)
  }, 20_000)

  it('retourne 429 si PSI répond 429', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('quota', { status: 429 })),
    )

    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        get: async (sql: string, params: any[]) => {
          if (sql.includes('FROM company_profile') && params[0] === 'b1') return { business_id: 'b1', website_url: 'https://acme.fr' }
          return null
        },
        run: async () => {},
      }),
    }))

    const { runPagespeedHandler } = await import('./internalCompanies')
    const req: any = { params: { companyKey: 'business:b1' } }
    const res: any = { statusCode: 200, body: null, status: (c: number) => ((res.statusCode = c), res), json: (b: any) => ((res.body = b), res) }
    await runPagespeedHandler(req, res)

    expect(res.statusCode).toBe(429)
  }, 20_000)
})
