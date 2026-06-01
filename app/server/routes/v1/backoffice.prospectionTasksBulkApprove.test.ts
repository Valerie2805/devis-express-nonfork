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

describe('backoffice prospection tasks bulk approve', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('approve en masse (sans envoi) met en approved', async () => {
    const runCalls: any[] = []
    vi.resetModules()
    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        get: async (sql: string) => {
          if (sql.includes('FROM business')) return { config_json: JSON.stringify({ settings: { staff_permissions: { prospection_validate: true } } }) }
          if (sql.includes('FROM prospect_task')) return { task_id: 't1', status: 'pending_review' }
          return null
        },
        all: async () => [],
        run: async (sql: string, params: any[]) => runCalls.push({ sql, params }),
      }),
    }))

    const router = (await import('./backoffice')).default as any
    const handler = getRouteHandler(router, '/backoffice/:businessId/prospection/tasks/bulk_approve', 'post')
    const req: any = {
      params: { businessId: 'b1' },
      auth: { business_id: 'b1', role: 'staff', user_id: 'u_staff' },
      body: { task_ids: ['t1'], channel: 'sms', send: false },
      header: () => '',
      ip: '127.0.0.1',
    }
    const res = createRes()
    await handler(req, res as any, (e: any) => {
      if (e) throw e
    })
    await res.done
    expect(res.statusCode).toBe(200)
    expect(runCalls.some((c) => String(c.sql).includes('UPDATE prospect_task SET status'))).toBe(true)
  }, 20_000)
})

