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

describe('backoffice lead portal + site state', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('staff assigné peut générer un portail', async () => {
    const runCalls: any[] = []
    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        get: async (sql: string) => {
          if (sql.includes('FROM lead')) return { lead_id: 'l1', business_id: 'b1', assignee_user_id: 'u_staff' }
          if (sql.includes('FROM lead_portal_access')) return null
          return { config_json: '{}' }
        },
        run: async (sql: string, params: any[]) => {
          runCalls.push({ sql, params })
        },
      }),
    }))

    const router = (await import('./backoffice')).default as any
    const handler = getRouteHandler(router, '/backoffice/:businessId/leads/:leadId/portal', 'post')
    const req: any = {
      params: { businessId: 'b1', leadId: 'l1' },
      auth: { business_id: 'b1', role: 'staff', user_id: 'u_staff' },
      body: {},
      header: () => '',
      ip: '127.0.0.1',
    }
    const res = createRes()
    await handler(req, res as any, (e: any) => {
      if (e) throw e
    })
    await res.done
    expect(res.statusCode).toBe(200)
    expect(res.body.portal_id).toBeTruthy()
    expect(res.body.portal_token).toBeTruthy()
    expect(res.body.preview_token).toBeTruthy()
    expect(res.body.pin).toBeTruthy()
    expect(runCalls.some((c) => String(c.sql).includes('INSERT INTO lead_portal_access'))).toBe(true)
  }, 20000)

  it('staff non assigné est refusé', async () => {
    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        get: async (sql: string) => {
          if (sql.includes('FROM lead')) return { lead_id: 'l1', business_id: 'b1', assignee_user_id: null }
          return { config_json: '{}' }
        },
        run: async () => {},
      }),
    }))

    const router = (await import('./backoffice')).default as any
    const handler = getRouteHandler(router, '/backoffice/:businessId/leads/:leadId/portal', 'post')
    const req: any = {
      params: { businessId: 'b1', leadId: 'l1' },
      auth: { business_id: 'b1', role: 'staff', user_id: 'u_staff' },
      body: {},
      header: () => '',
      ip: '127.0.0.1',
    }
    const res = createRes()
    await handler(req, res as any, (e: any) => {
      if (e) throw e
    })
    await res.done
    expect(res.statusCode).toBe(403)
  }, 20000)

  it('staff assigné peut mettre à jour site_status', async () => {
    const runCalls: any[] = []
    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        get: async (sql: string) => {
          if (sql.includes('FROM lead')) return { lead_id: 'l1', business_id: 'b1', assignee_user_id: 'u_staff' }
          return { config_json: '{}' }
        },
        run: async (sql: string, params: any[]) => {
          runCalls.push({ sql, params })
        },
      }),
    }))

    const router = (await import('./backoffice')).default as any
    const handler = getRouteHandler(router, '/backoffice/:businessId/leads/:leadId/site', 'patch')
    const req: any = {
      params: { businessId: 'b1', leadId: 'l1' },
      auth: { business_id: 'b1', role: 'staff', user_id: 'u_staff' },
      body: { site_status: 'in_progress' },
      header: () => '',
      ip: '127.0.0.1',
    }
    const res = createRes()
    await handler(req, res as any, (e: any) => {
      if (e) throw e
    })
    await res.done
    expect(res.statusCode).toBe(200)
    expect(runCalls.some((c) => String(c.sql).includes('lead_site_state'))).toBe(true)
  }, 20000)
})
