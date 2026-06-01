import crypto from 'crypto'
import twilio from 'twilio'

type SendParams = {
  channel: 'sms' | 'whatsapp'
  to: string
  text: string
}

export type ProviderSendResult = {
  provider_message_id: string
  status: 'sent' | 'failed'
}

export interface MessagingProvider {
  send(params: SendParams): Promise<ProviderSendResult>
}

class NoopProvider implements MessagingProvider {
  async send(params: SendParams): Promise<ProviderSendResult> {
    if (process.env.NOOP_MESSAGE_ECHO === 'true' && process.env.NODE_ENV !== 'production') {
      process.stdout.write(`MESSAGE_TO=${params.to}\nMESSAGE_CHANNEL=${params.channel}\nMESSAGE_TEXT=${params.text}\n`)
    }
    return { provider_message_id: crypto.randomUUID(), status: 'sent' }
  }
}

class TwilioProvider implements MessagingProvider {
  private client: ReturnType<typeof twilio>
  private fromSms: string
  private fromWhatsapp: string

  constructor() {
    const sid = process.env.TWILIO_ACCOUNT_SID || ''
    const token = process.env.TWILIO_AUTH_TOKEN || ''
    if (!sid || !token) throw new Error('Missing TWILIO credentials')
    this.client = twilio(sid, token)
    this.fromSms = process.env.TWILIO_FROM_SMS || ''
    this.fromWhatsapp = process.env.TWILIO_FROM_WHATSAPP || ''
    if (!this.fromSms) throw new Error('Missing TWILIO_FROM_SMS')
    if (!this.fromWhatsapp) throw new Error('Missing TWILIO_FROM_WHATSAPP')
  }

  async send(params: SendParams): Promise<ProviderSendResult> {
    const to = params.channel === 'whatsapp' ? `whatsapp:${params.to}` : params.to
    const from = params.channel === 'whatsapp' ? `whatsapp:${this.fromWhatsapp}` : this.fromSms
    const msg = await this.client.messages.create({ to, from, body: params.text })
    const status = msg.status === 'failed' || msg.status === 'undelivered' ? 'failed' : 'sent'
    return { provider_message_id: msg.sid, status }
  }
}

export function getMessagingProvider(): MessagingProvider {
  const kind = process.env.MESSAGE_PROVIDER || 'noop'
  if (kind === 'noop') return new NoopProvider()
  if (kind === 'twilio') return new TwilioProvider()
  return new NoopProvider()
}
