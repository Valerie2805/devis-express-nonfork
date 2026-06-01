export function buildReplyTo(prospectId: string) {
  const domain = String(process.env.MAILGUN_INBOUND_DOMAIN || '').trim()
  if (!domain) throw new Error('Missing MAILGUN_INBOUND_DOMAIN')
  return `p_${prospectId}@${domain}`
}

export async function sendResendEmail(input: { prospectId: string; to: string; subject: string; text: string; html?: string }) {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim()
  const from = String(process.env.RESEND_FROM_EMAIL || '').trim()
  if (!apiKey) throw new Error('Missing RESEND_API_KEY')
  if (!from) throw new Error('Missing RESEND_FROM_EMAIL')

  const reply_to = buildReplyTo(input.prospectId)
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      reply_to,
    }),
  })

  const text = await res.text()
  let data: any = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }

  if (!res.ok) {
    const msg = (data && (data.message || data.error)) || `HTTP ${res.status}`
    throw new Error(msg)
  }

  const id = data && typeof data.id === 'string' ? data.id : null
  if (!id) throw new Error('Missing provider message id')
  return id
}

