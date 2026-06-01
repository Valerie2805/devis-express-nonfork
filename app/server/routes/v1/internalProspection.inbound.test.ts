import { describe, expect, it, vi, afterEach } from 'vitest'
import { computeMailgunSignature } from '../../prospection/mailgun'

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
  out.sendStatus = (code: number) => {
    out.statusCode = code
    return out
  }
  return out
}

describe('internal prospection inbound', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('refuse si signature invalide', async () => {
    process.env.MAILGUN_SIGNING_KEY = 'k'
    process.env.MAILGUN_INBOUND_DOMAIN = 'inbound.example.com'

    const { inboundEmailHandler } = await import('./internalProspection')
    const req: any = { body: { timestamp: '1', token: 't', signature: 'bad' } }
    const res = createRes()
    await inboundEmailHandler(req, res as any)
    expect(res.statusCode).toBe(401)
  }, 20_000)

  it('insère un message inbound et met à jour le prospect', async () => {
    process.env.MAILGUN_SIGNING_KEY = 'k'
    process.env.MAILGUN_INBOUND_DOMAIN = 'inbound.example.com'
    const timestamp = '1710000000'
    const token = 'tok'
    const signature = computeMailgunSignature('k', timestamp, token)

    const runCalls: any[] = []
    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        run: async (sql: string, params: any[]) => runCalls.push({ sql, params }),
      }),
    }))

    const { inboundEmailHandler } = await import('./internalProspection')
    const req: any = {
      body: {
        timestamp,
        token,
        signature,
        recipient: 'p_p1@inbound.example.com',
        sender: 'alice@example.com',
        subject: 'Re: hello',
        'stripped-text': 'ok',
      },
    }
    const res = createRes()
    await inboundEmailHandler(req, res as any)

    expect(res.statusCode).toBe(204)
    expect(runCalls.some((c) => String(c.sql).includes('INSERT INTO prospect_message'))).toBe(true)
    expect(runCalls.some((c) => String(c.sql).includes('UPDATE prospect'))).toBe(true)
  }, 20_000)
})
