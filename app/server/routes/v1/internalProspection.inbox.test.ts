import { describe, expect, it, vi, afterEach } from 'vitest'

function createRes() {
  const out: any = { statusCode: 200, body: null }
  out.status = (code: number) => {
    out.statusCode = code
    return out
  }
  out.json = (body: any) => {
    out.body = body
    return out
  }
  return out
}

describe('internal prospection inbox', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('liste les threads', async () => {
    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        all: async () => [
          { prospect_id: 'p1', name: 'ACME', last_at: '2026-01-02', last_direction: 'inbound', last_subject: 'Re:' },
        ],
      }),
    }))
    const { listInboxThreadsHandler } = await import('./internalProspection')
    const req: any = { query: {} }
    const res = createRes()
    await listInboxThreadsHandler(req, res as any)
    expect(res.statusCode).toBe(200)
    expect(res.body?.items?.[0]?.prospect_id).toBe('p1')
  })

  it('liste les messages d’un prospect', async () => {
    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        all: async () => [
          { message_id: 'm1', direction: 'inbound', text: 'hello', created_at: '2026-01-01', from_email: 'a@b.c' },
        ],
      }),
    }))
    const { listInboxMessagesHandler } = await import('./internalProspection')
    const req: any = { params: { prospectId: 'p1' } }
    const res = createRes()
    await listInboxMessagesHandler(req, res as any)
    expect(res.statusCode).toBe(200)
    expect(res.body?.items?.length).toBe(1)
  })
})

