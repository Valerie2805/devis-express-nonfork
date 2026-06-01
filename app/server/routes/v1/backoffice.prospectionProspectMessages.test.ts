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

describe('backoffice prospection prospect messages', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('liste les messages d’un prospect', async () => {
    vi.resetModules()
    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        get: async (sql: string) => {
          if (sql.includes('FROM business_prospect')) return { business_id: 'b1' }
          return null
        },
        all: async () => [
          {
            message_id: 'm1',
            direction: 'outbound',
            provider: 'noop',
            channel: 'email',
            from_email: 'a@example.com',
            to_email: 'b@example.com',
            to_phone: null,
            subject: 'Hi',
            text: 'Body',
            created_at: '2024-01-01T00:00:00.000Z',
            task_id: 't1',
          },
        ],
        run: async () => {},
      }),
    }))

    const router = (await import('./backoffice')).default as any
    const handler = getRouteHandler(router, '/backoffice/:businessId/prospection/prospects/:prospectId/messages', 'get')
    const req: any = {
      params: { businessId: 'b1', prospectId: 'p1' },
      query: { limit: '50', offset: '0' },
      auth: { business_id: 'b1', role: 'owner', user_id: 'u1' },
      header: () => '',
      ip: '127.0.0.1',
    }
    const res = createRes()
    await handler(req, res as any, (e: any) => {
      if (e) throw e
    })
    await res.done
    expect(res.statusCode).toBe(200)
    expect(res.body.items?.[0]?.message_id).toBe('m1')
    expect(res.body.items?.[0]?.channel).toBe('email')
  }, 20_000)
})

