import { describe, expect, it, vi, afterEach } from 'vitest'

function createRes() {
  let resolveDone: (() => void) | null = null
  const done = new Promise<void>((r) => {
    resolveDone = r
  })
  const out: any = { statusCode: 200, body: null, done }
  out.status = (code: number) => {
    out.statusCode = code
    return out
  }
  out.json = (body: any) => {
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

describe('backoffice company profile', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it(
    'GET crée le profil si absent',
    async () => {
    const runCalls: any[] = []
    let getCount = 0
    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        get: async (sql: string) => {
          if (sql.includes('SELECT config_json FROM business')) return { config_json: '{}' }
          if (sql.includes('SELECT business_id FROM business')) return { business_id: 'b1' }
          if (sql.includes('SELECT * FROM company_profile')) {
            getCount += 1
            if (getCount === 1) return null
            return { business_id: 'b1', headcount_range: null }
          }
          return null
        },
        run: async (sql: string, params: any[]) => {
          runCalls.push({ sql, params })
        },
        all: async () => [],
        exec: async () => {},
      }),
    }))
    const router = (await import('./backoffice')).default as any
    const handler = getRouteHandler(router, '/backoffice/:businessId/company_profile', 'get')
    const req: any = { params: { businessId: 'b1' }, auth: { business_id: 'b1', role: 'owner', user_id: 'u1' } }
    const res = createRes()
    await handler(req, res as any, () => {})
    await res.done
    expect(res.statusCode).toBe(200)
    expect(res.body?.profile?.business_id).toBe('b1')
    expect(runCalls.some((c) => String(c.sql).includes('INSERT INTO company_profile'))).toBe(true)
    },
    20_000,
  )
})
