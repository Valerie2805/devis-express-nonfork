import nodemailer from 'nodemailer'

export type SendEmailParams = {
  to: string
  subject: string
  text: string
}

export interface EmailProvider {
  send(params: SendEmailParams): Promise<void>
}

class NoopEmailProvider implements EmailProvider {
  async send(params: SendEmailParams): Promise<void> {
    process.stdout.write(`EMAIL_TO=${params.to}\nEMAIL_SUBJECT=${params.subject}\nEMAIL_TEXT=${params.text}\n`)
  }
}

class SmtpEmailProvider implements EmailProvider {
  private transporter: nodemailer.Transporter
  private from: string
  constructor() {
    const host = process.env.SMTP_HOST || ''
    const port = Number(process.env.SMTP_PORT || '587')
    const user = process.env.SMTP_USER || ''
    const pass = process.env.SMTP_PASS || ''
    const from = process.env.SMTP_FROM || ''
    if (!host || !user || !pass || !from) throw new Error('Missing SMTP config')
    this.from = from
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    })
  }

  async send(params: SendEmailParams): Promise<void> {
    await this.transporter.sendMail({ from: this.from, to: params.to, subject: params.subject, text: params.text })
  }
}

let cached: EmailProvider | null = null

export function getEmailProvider(): EmailProvider {
  if (cached) return cached
  const kind = process.env.EMAIL_PROVIDER || 'noop'
  if (kind === 'smtp') cached = new SmtpEmailProvider()
  else cached = new NoopEmailProvider()
  return cached
}

