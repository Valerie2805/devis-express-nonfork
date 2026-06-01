import { describe, expect, it, vi, afterEach } from 'vitest'

function createRes() {
  let resolveDone: (() => void) | null = null
  const done = new Promise<void>((r) => {
    resolveDone = r
  })
  const out: any = { statusCode: 200, body: null }
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
  out.done = done
  return out
}

function getRouteHandler(router: any, path: string, method: string) {
  const layer = router.stack.find((l: any) => l.route && l.route.path === path && l.route.methods?.[method])
  if (!layer) throw new Error('route not found')
  const stack = layer.route.stack
  return stack[stack.length - 1].handle
}

describe('backoffice company_profile prefill', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('pré-remplit website_url depuis config_json.integrations.google_business_profile_url si profil absent', async () => {
    const runCalls: any[] = []
    let profile: any = null
    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        get: async (sql: string, params: any[]) => {
          if (sql.includes('FROM business') && params[0] === 'b1')
            return { business_id: 'b1', config_json: JSON.stringify({ integrations: { google_business_profile_url: 'https://acme.fr' } }) }
          if (sql.includes('FROM company_profile')) return profile
          return null
        },
        run: async (sql: string, params: any[]) => {
          runCalls.push({ sql, params })
          if (sql.includes('INSERT INTO company_profile')) {
            profile = { business_id: 'b1', website_url: null }
          }
          if (sql.includes('UPDATE company_profile') && profile) {
            profile = { ...profile, website_url: params[0] }
          }
        },
      }),
    }))

    const router = (await import('./backoffice')).default as any
    const handler = getRouteHandler(router, '/backoffice/:businessId/company_profile', 'get')
    const req: any = { params: { businessId: 'b1' }, query: {}, auth: { business_id: 'b1', role: 'owner', user_id: 'u1' } }
    const res = createRes()
    await handler(req, res as any, () => {})
    await res.done
    expect(res.statusCode).toBe(200)
    expect(res.body?.profile?.website_url).toBe('https://acme.fr')
    expect(runCalls.some((c) => String(c.sql).includes('INSERT INTO company_profile'))).toBe(true)
  }, 20_000)
})
