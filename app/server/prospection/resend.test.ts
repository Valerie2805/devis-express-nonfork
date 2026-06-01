import { describe, expect, it, vi, afterEach } from 'vitest'
import { buildReplyTo, sendResendEmail } from './resend'

describe('resend', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('construit un reply-to par prospect', () => {
    process.env.MAILGUN_INBOUND_DOMAIN = 'inbound.example.com'
    expect(buildReplyTo('p1')).toBe('p_p1@inbound.example.com')
  })

  it('envoie via fetch et renvoie un provider_message_id', async () => {
    process.env.RESEND_API_KEY = 'k'
    process.env.RESEND_FROM_EMAIL = 'from@example.com'
    process.env.MAILGUN_INBOUND_DOMAIN = 'inbound.example.com'

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ id: 'email_123' }), { status: 200 })),
    )

    const id = await sendResendEmail({
      prospectId: 'p1',
      to: 'to@example.com',
      subject: 'Hello',
      text: 'Hi',
    })
    expect(id).toBe('email_123')
  })
})

