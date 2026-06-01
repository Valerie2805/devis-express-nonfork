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
  return out
}

function getRouteHandler(router: any, path: string, method: string) {
  const layer = router.stack.find((l: any) => l.route && l.route.path === path && l.route.methods?.[method])
  if (!layer) throw new Error('route not found')
  const stack = layer.route.stack
  return stack[stack.length - 1].handle
}

describe('backoffice lead won_at', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('ajoute won_at dans outcome quand status passe à won', async () => {
    const runCalls: any[] = []
    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        get: async (sql: string) => {
          if (sql.includes('SELECT status')) return { status: 'new', stage: null, first_human_response_at: null, trade_id: 't1', outcome_json: null }
          return null
        },
        run: async (sql: string, params: any[]) => void runCalls.push({ sql, params }),
      }),
    }))

    const router = (await import('./backoffice')).default as any
    const handler = getRouteHandler(router, '/backoffice/:businessId/leads/:leadId', 'patch')
    const req: any = {
      params: { businessId: 'b1', leadId: 'l1' },
      body: { status: 'won', outcome: { amount_cents: 19900, currency: 'EUR' } },
      auth: { business_id: 'b1', role: 'owner', user_id: 'u1' },
      header: () => '',
      ip: '127.0.0.1',
    }
    const res = createRes()
    await handler(req, res as any, () => {})
    await res.done

    expect(res.statusCode).toBe(200)
    const updateCall = runCalls.find((c) => String(c.sql).includes('UPDATE lead'))
    expect(updateCall).toBeTruthy()
    expect(updateCall.sql).toContain('outcome_json')
    const outStr = updateCall.params.find((p: any) => typeof p === 'string' && p.includes('"won_at"'))
    expect(outStr).toContain('"amount_cents":19900')
  }, 20000)
})
