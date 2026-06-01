import { describe, expect, it, vi, afterEach } from 'vitest'

function createRes() {
  let resolveDone: (() => void) | null = null
  const done = new Promise<void>((r) => {
    resolveDone = r
  })
  const out: any = { statusCode: 200, body: '', done, headers: {} }
  out.status = (code: number) => {
    out.statusCode = code
    return out
  }
  out.setHeader = (k: string, v: any) => {
    out.headers[k] = v
    return out
  }
  out.send = (body: any) => {
    out.body = body
    resolveDone?.()
    return out
  }
  return out
}

function getRouteHandler(router: any, path: string, method: string) {
  const layer = router.stack.find((l: any) => l.route && l.route.path === path && l.route.methods?.[method])
  if (!layer) throw new Error('route not found')
  const stack = layer.route.stack
  return stack[stack.length - 1].handle
}

describe('leads export csv', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('exporte un CSV excel-friendly avec website + dates FR', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-30T12:00:00.000Z'))

    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        all: async (sql: string) => {
          if (sql.includes('FROM lead'))
            return [
              {
                lead_id: 'l1',
                created_at: '2026-04-01T09:10:00.000Z',
                status: 'new',
                trade_id: 't1',
                request_type: 'depannage',
                urgency: 'now',
                channel_preference: 'call',
                first_name: 'Alice',
                phone_e164: '+331',
                email: 'a@b.c',
                city: 'Paris',
                postal_code: '75000',
                address: '1 rue x',
                description: 'test',
                photos_count: 0,
                tags_json: JSON.stringify(['x', 'y']),
                score: 1,
                decision: 'qualified',
              },
            ]
          return []
        },
        get: async (sql: string) => {
          if (sql.includes('FROM company_profile')) return { website_url: 'https://example.com', created_at: '2026-01-02T03:04:00.000Z' }
          return { config_json: '{}' }
        },
        run: async () => {},
      }),
    }))

    const router = (await import('./backoffice')).default as any
    const handler = getRouteHandler(router, '/backoffice/:businessId/leads/export', 'get')
    const req: any = {
      params: { businessId: 'b1' },
      query: {},
      auth: { business_id: 'b1', role: 'owner', user_id: 'u1' },
      header: () => '',
      ip: '127.0.0.1',
    }
    const res = createRes()
    await handler(req, res as any, () => {})
    await res.done

    expect(res.statusCode).toBe(200)
    expect(String(res.headers['Content-Type'])).toContain('text/csv')
    const text = String(res.body)
    expect(text.startsWith('\ufeff')).toBe(true)
    expect(text).toContain('business_website_url')
    expect(text).toContain('business_profile_created_at_fr')
    expect(text).toContain('created_at_fr')
    expect(text).toContain('https://example.com')
    expect(text).toContain('x|y')
    expect(text).toContain(';')
  })
})

