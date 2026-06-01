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

describe('backoffice prospection mini-crm (owner)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('crée une séquence', async () => {
    const runCalls: any[] = []
    vi.resetModules()
    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        run: async (sql: string, params: any[]) => runCalls.push({ sql, params }),
        get: async () => null,
        all: async () => [],
      }),
    }))

    const router = (await import('./backoffice')).default as any
    const handler = getRouteHandler(router, '/backoffice/:businessId/prospection/sequences', 'post')
    const req: any = {
      params: { businessId: 'b1' },
      auth: { business_id: 'b1', role: 'owner', user_id: 'u1' },
      body: { name: 'Intro', enabled: true, steps: [{ id: 's1', delay_minutes: 0, templates: { sms: { text: 'x' } } }] },
      header: () => '',
      ip: '127.0.0.1',
    }
    const res = createRes()
    await handler(req, res as any, (e: any) => {
      if (e) throw e
    })
    await res.done
    expect(res.statusCode).toBe(201)
    expect(runCalls.some((c) => String(c.sql).includes('INSERT INTO prospect_sequence'))).toBe(true)
  }, 20_000)

  it('active une séquence et crée des tasks pending_review', async () => {
    const runCalls: any[] = []
    vi.resetModules()
    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        run: async (sql: string, params: any[]) => runCalls.push({ sql, params }),
        get: async (sql: string) => {
          if (sql.includes('FROM prospect_sequence')) return { sequence_id: 'seq1', steps_json: JSON.stringify([{ id: 's1', delay_minutes: 0, templates: { sms: { text: 'x' }, email: { subject: 'hi', text: 'y' } } }]) }
          return null
        },
        all: async () => [],
      }),
    }))

    const router = (await import('./backoffice')).default as any
    const handler = getRouteHandler(router, '/backoffice/:businessId/prospection/sequences/:sequenceId/activate', 'post')
    const req: any = {
      params: { businessId: 'b1', sequenceId: 'seq1' },
      auth: { business_id: 'b1', role: 'owner', user_id: 'u1' },
      body: { prospect_ids: ['p1'] },
      header: () => '',
      ip: '127.0.0.1',
    }
    const res = createRes()
    await handler(req, res as any, (e: any) => {
      if (e) throw e
    })
    await res.done
    expect(res.statusCode).toBe(200)
    const inserts = runCalls.filter((c) => String(c.sql).includes('INSERT INTO prospect_task'))
    expect(inserts.length).toBeGreaterThanOrEqual(1)
    expect(inserts[0].params).toContain('pending_review')
  }, 20_000)

  it('approve task sans envoi met la task en approved', async () => {
    const runCalls: any[] = []
    vi.resetModules()
    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        run: async (sql: string, params: any[]) => runCalls.push({ sql, params }),
        get: async (sql: string) => {
          if (sql.includes('FROM prospect_task')) return { task_id: 't1', prospect_id: 'p1', payload_json: JSON.stringify({ templates: { sms: { text: 'x' } } }), status: 'pending_review' }
          if (sql.includes('FROM prospect')) return { prospect_id: 'p1', phone: '+33123456789', emails_json: '[]' }
          return null
        },
        all: async () => [],
      }),
    }))

    const router = (await import('./backoffice')).default as any
    const handler = getRouteHandler(router, '/backoffice/:businessId/prospection/tasks/:taskId/approve', 'post')
    const req: any = {
      params: { businessId: 'b1', taskId: 't1' },
      auth: { business_id: 'b1', role: 'owner', user_id: 'u1' },
      body: { channel: 'sms', send: false },
      header: () => '',
      ip: '127.0.0.1',
    }
    const res = createRes()
    await handler(req, res as any, (e: any) => {
      if (e) throw e
    })
    await res.done
    expect(res.statusCode).toBe(200)
    expect(runCalls.some((c) => String(c.sql).includes('UPDATE prospect_task') && c.params.includes('approved'))).toBe(true)
  }, 20_000)

  it('approve task avec envoi SMS enregistre un message et marque sent', async () => {
    const runCalls: any[] = []
    const sendCalls: any[] = []
    vi.resetModules()
    vi.doMock('../../providers/messagingProvider.js', () => ({
      getMessagingProvider: () => ({
        send: async (params: any) => {
          sendCalls.push(params)
          return { provider_message_id: 'm1', status: 'sent' }
        },
      }),
    }))
    vi.doMock('../../providers/emailProvider.js', () => ({
      getEmailProvider: () => ({
        send: async () => {},
      }),
    }))
    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        run: async (sql: string, params: any[]) => runCalls.push({ sql, params }),
        get: async (sql: string) => {
          if (sql.includes('FROM prospect_task'))
            return { task_id: 't1', prospect_id: 'p1', payload_json: JSON.stringify({ templates: { sms: { text: 'hello' } } }), status: 'pending_review' }
          if (sql.includes('FROM prospect')) return { prospect_id: 'p1', phone: '+33123456789', emails_json: '[]' }
          return null
        },
        all: async () => [],
      }),
    }))

    const router = (await import('./backoffice')).default as any
    const handler = getRouteHandler(router, '/backoffice/:businessId/prospection/tasks/:taskId/approve', 'post')
    const req: any = {
      params: { businessId: 'b1', taskId: 't1' },
      auth: { business_id: 'b1', role: 'owner', user_id: 'u1' },
      body: { channel: 'sms', send: true },
      header: () => '',
      ip: '127.0.0.1',
    }
    const res = createRes()
    await handler(req, res as any, (e: any) => {
      if (e) throw e
    })
    await res.done
    expect(res.statusCode).toBe(200)
    expect(sendCalls[0]?.text).toBe('hello')
    expect(runCalls.some((c) => String(c.sql).includes('INSERT INTO prospect_message'))).toBe(true)
    expect(runCalls.some((c) => String(c.sql).includes('UPDATE prospect_task') && c.params.includes('sent'))).toBe(true)
  }, 20_000)

  it('cancel task la marque canceled', async () => {
    const runCalls: any[] = []
    vi.resetModules()
    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        run: async (sql: string, params: any[]) => runCalls.push({ sql, params }),
        get: async (sql: string) => {
          if (sql.includes('FROM prospect_task')) return { task_id: 't1', prospect_id: 'p1', status: 'pending_review' }
          return null
        },
        all: async () => [],
      }),
    }))

    const router = (await import('./backoffice')).default as any
    const handler = getRouteHandler(router, '/backoffice/:businessId/prospection/tasks/:taskId/cancel', 'post')
    const req: any = {
      params: { businessId: 'b1', taskId: 't1' },
      auth: { business_id: 'b1', role: 'owner', user_id: 'u1' },
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
    expect(runCalls.some((c) => String(c.sql).includes('UPDATE prospect_task') && c.params.includes('canceled'))).toBe(true)
  }, 20_000)

  it('approve séquence avec envoi SMS envoie toutes les tasks pending_review', async () => {
    const runCalls: any[] = []
    const sendCalls: any[] = []
    vi.resetModules()
    vi.doMock('../../providers/messagingProvider.js', () => ({
      getMessagingProvider: () => ({
        send: async (params: any) => {
          sendCalls.push(params)
          return { provider_message_id: `m_${sendCalls.length}`, status: 'sent' }
        },
      }),
    }))
    vi.doMock('../../providers/emailProvider.js', () => ({
      getEmailProvider: () => ({
        send: async () => {},
      }),
    }))
    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        run: async (sql: string, params: any[]) => runCalls.push({ sql, params }),
        all: async (sql: string) => {
          if (sql.includes('SELECT task_id') && sql.includes('FROM prospect_task')) return [{ task_id: 't1' }, { task_id: 't2' }]
          return []
        },
        get: async (sql: string, params: any[]) => {
          if (sql.includes('FROM prospect_task')) {
            const id = String(params?.[1] || '')
            return {
              task_id: id,
              prospect_id: id === 't1' ? 'p1' : 'p2',
              payload_json: JSON.stringify({ templates: { sms: { text: `hello_${id}` } } }),
              status: 'pending_review',
              attempts: 0,
            }
          }
          if (sql.includes('FROM prospect')) {
            const pid = String(params?.[0] || '')
            return { prospect_id: pid, phone: '+33123456789', emails_json: '[]' }
          }
          if (sql.includes('FROM prospect_sequence')) return { sequence_id: 'seq1' }
          return null
        },
      }),
    }))

    const router = (await import('./backoffice')).default as any
    const handler = getRouteHandler(router, '/backoffice/:businessId/prospection/sequences/:sequenceId/approve', 'post')
    const req: any = {
      params: { businessId: 'b1', sequenceId: 'seq1' },
      auth: { business_id: 'b1', role: 'owner', user_id: 'u1' },
      body: { channel: 'sms', send: true },
      header: () => '',
      ip: '127.0.0.1',
    }
    const res = createRes()
    await handler(req, res as any, (e: any) => {
      if (e) throw e
    })
    await res.done
    expect(res.statusCode).toBe(200)
    expect(sendCalls.length).toBe(2)
    expect(sendCalls.map((c) => c.text)).toEqual(['hello_t1', 'hello_t2'])
    expect(runCalls.some((c) => String(c.sql).includes('UPDATE prospect_task') && c.params.includes('sent'))).toBe(true)
  }, 20_000)
})
