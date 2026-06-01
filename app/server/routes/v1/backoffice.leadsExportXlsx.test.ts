import { describe, expect, it, vi, afterEach } from 'vitest'
import ExcelJS from 'exceljs'

function createRes() {
  let resolveDone: (() => void) | null = null
  const done = new Promise<void>((r) => {
    resolveDone = r
  })
  const out: any = { statusCode: 200, body: null, done, headers: {} }
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
  out.end = () => {
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

describe('leads export xlsx', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('exporte un XLSX avec website + dates', async () => {
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
    const handler = getRouteHandler(router, '/backoffice/:businessId/leads/export.xlsx', 'get')
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
    expect(String(res.headers['Content-Type'])).toContain('spreadsheetml')
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(Buffer.isBuffer(res.body) ? res.body : Buffer.from(res.body))
    const ws = wb.worksheets[0]
    expect(ws.getRow(1).values).toContain('business_website_url')
    expect(ws.getRow(2).values).toContain('https://example.com')
  })
})
