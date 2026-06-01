import { describe, expect, it, vi, afterEach } from 'vitest'

describe('internal companies legal email scrape', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('scrape une adresse email depuis une page mentions légales', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: any) => {
        const url = String(input)
        if (url === 'https://acme.fr/') {
          return new Response('<a href="/mentions-legales">Mentions légales</a>', { status: 200, headers: { 'content-type': 'text/html' } })
        }
        if (url === 'https://acme.fr/mentions-legales') {
          return new Response('Contact: contact@acme.fr', { status: 200, headers: { 'content-type': 'text/html' } })
        }
        return new Response('not found', { status: 404 })
      }),
    )

    const runCalls: any[] = []
    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        get: async (sql: string, params: any[]) => {
          if (sql.includes('FROM company_profile') && params[0] === 'b1') return { business_id: 'b1', website_url: 'https://acme.fr/' }
          if (sql.includes('SELECT * FROM company_profile')) return { business_id: 'b1', website_url: 'https://acme.fr/' }
          return null
        },
        run: async (sql: string, params: any[]) => {
          runCalls.push({ sql, params })
        },
        all: async () => [],
      }),
    }))

    const { scrapeLegalEmailHandler } = await import('./internalCompanies')
    const req: any = { params: { companyKey: 'business:b1' } }
    const res: any = { statusCode: 200, body: null, status: (c: number) => ((res.statusCode = c), res), json: (b: any) => ((res.body = b), res) }
    await scrapeLegalEmailHandler(req, res)

    expect(res.statusCode).toBe(200)
    expect(res.body?.found).toBe(true)
    expect(res.body?.email).toBe('contact@acme.fr')
    expect(runCalls.some((c) => String(c.sql).includes('UPDATE company_profile'))).toBe(true)
  })
})

