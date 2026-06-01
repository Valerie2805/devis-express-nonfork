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

describe('internal prospection route', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('envoie un email et persiste un message outbound', async () => {
    process.env.RESEND_API_KEY = 'k'
    process.env.RESEND_FROM_EMAIL = 'from@example.com'
    process.env.MAILGUN_INBOUND_DOMAIN = 'inbound.example.com'

    const runCalls: any[] = []
    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        run: async (sql: string, params: any[]) => runCalls.push({ sql, params }),
      }),
    }))

    vi.doMock('../../prospection/resend.js', () => ({
      sendResendEmail: async () => 'email_123',
    }))

    const { sendProspectEmailHandler } = await import('./internalProspection')

    const req: any = {
      params: { prospectId: 'p1' },
      body: { to_email: 'to@example.com', subject: 'Hi', text: 'Hello' },
    }
    const res = createRes()
    await sendProspectEmailHandler(req, res as any)

    expect(res.statusCode).toBe(200)
    expect(res.body?.provider_message_id).toBe('email_123')
    expect(runCalls.length).toBe(1)
    expect(runCalls[0].sql).toContain('INSERT INTO prospect_message')
  }, 20_000)
})
