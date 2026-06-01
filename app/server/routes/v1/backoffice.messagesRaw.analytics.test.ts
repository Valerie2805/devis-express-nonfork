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

describe('backoffice messages raw analytics', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it(
    'émet lead_response_sent (template_id=custom)',
    async () => {
    vi.resetModules()
    const runCalls: any[] = []
      const prevProvider = process.env.MESSAGE_PROVIDER
      process.env.MESSAGE_PROVIDER = 'noop'
    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        get: async () => ({
          lead_id: 'l1',
          business_id: 'b1',
          trade_id: 't1',
          phone_e164: '+33123456789',
          sms_opt_in: 1,
          whatsapp_opt_in: 1,
          sms_opt_out_at: null,
        }),
        run: async (sql: string, params: any[]) => {
          runCalls.push({ sql, params })
        },
      }),
    }))

      try {
        const router = (await import('./backoffice')).default as any
        const handler = getRouteHandler(router, '/backoffice/:businessId/leads/:leadId/messages/raw', 'post')
        const req: any = {
          params: { businessId: 'b1', leadId: 'l1' },
          body: { channel: 'sms', text: 'Hello' },
          auth: { business_id: 'b1', role: 'owner', user_id: 'u1' },
          header: () => 'Bearer token',
          headers: {},
          ip: '127.0.0.1',
        }
        const res = createRes()
        let nextErr: any = null
        handler(req, res as any, (e: any) => {
          nextErr = e
          ;(res as any).end()
        })
        await res.done
        if (nextErr) throw nextErr
        expect(res.statusCode).toBe(202)
        expect(res.body?.message_id).toBeTruthy()
      } finally {
        process.env.MESSAGE_PROVIDER = prevProvider
      }

      const sqls = runCalls.map((c) => String(c.sql))
      expect(sqls).toContainEqual(expect.stringContaining('INSERT INTO analytics_event'))
      const ev = runCalls.find((c) => String(c.sql).includes('INSERT INTO analytics_event') && String(c.params?.[4]) === 'lead_response_sent')
      expect(ev).toBeTruthy()
      const props = JSON.parse(String(ev.params?.[7] || '{}'))
    expect(props.lead_id).toBe('l1')
    expect(props.channel).toBe('sms')
    expect(props.template_id).toBe('custom')
    },
    20_000,
  )
})
