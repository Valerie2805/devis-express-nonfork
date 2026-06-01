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

describe('backoffice portal messages', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('liste les messages portail d’un lead', async () => {
    vi.resetModules()
    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        get: async (sql: string) => {
          if (sql.includes('SELECT lead_id, assignee_user_id')) return { lead_id: 'l1', assignee_user_id: 'u1' }
          if (sql.includes('SELECT portal_id')) return { portal_id: 'p1' }
          return null
        },
        all: async (sql: string) => {
          if (sql.includes('FROM lead_portal_message')) return [{ direction: 'client', author_label: 'Client', text: 'Bonjour', created_at: 'x' }]
          return []
        },
        run: async () => {},
      }),
    }))

    const router = (await import('./backoffice')).default as any
    const handler = getRouteHandler(router, '/backoffice/:businessId/leads/:leadId/portal/messages', 'get')
    const req: any = { params: { businessId: 'b1', leadId: 'l1' }, auth: { business_id: 'b1', role: 'staff', user_id: 'u1' } }
    const res = createRes()
    await handler(req, res as any, (e: any) => {
      if (e) throw e
    })
    await res.done
    expect(res.statusCode).toBe(200)
    expect(res.body.portal_id).toBe('p1')
    expect(res.body.messages?.[0]?.text).toBe('Bonjour')
  }, 20_000)

  it('ajoute un message staff', async () => {
    const runCalls: any[] = []
    vi.resetModules()
    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        get: async (sql: string) => {
          if (sql.includes('SELECT lead_id, assignee_user_id')) return { lead_id: 'l1', assignee_user_id: 'u1' }
          if (sql.includes('SELECT portal_id')) return { portal_id: 'p1' }
          if (sql.includes('SELECT username')) return { username: 'Emilie' }
          return null
        },
        all: async () => [],
        run: async (sql: string, params: any[]) => runCalls.push({ sql, params }),
      }),
    }))

    const router = (await import('./backoffice')).default as any
    const handler = getRouteHandler(router, '/backoffice/:businessId/leads/:leadId/portal/messages', 'post')
    const req: any = {
      params: { businessId: 'b1', leadId: 'l1' },
      auth: { business_id: 'b1', role: 'staff', user_id: 'u1' },
      body: { text: 'Ok' },
      header: () => '',
      ip: '127.0.0.1',
    }
    const res = createRes()
    await handler(req, res as any, (e: any) => {
      if (e) throw e
    })
    await res.done
    expect(res.statusCode).toBe(200)
    expect(runCalls.some((c) => String(c.sql).includes('INSERT INTO lead_portal_message'))).toBe(true)
  })
})
