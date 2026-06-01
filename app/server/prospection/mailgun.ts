import crypto from 'crypto'

export function computeMailgunSignature(signingKey: string, timestamp: string, token: string) {
  return crypto.createHmac('sha256', signingKey).update(`${timestamp}${token}`).digest('hex')
}

export function verifyMailgunSignature(
  input: { timestamp?: string; token?: string; signature?: string },
  signingKey: string,
) {
  const ts = String(input.timestamp || '').trim()
  const tok = String(input.token || '').trim()
  const sig = String(input.signature || '').trim()
  if (!ts || !tok || !sig) return false
  const expected = computeMailgunSignature(signingKey, ts, tok)
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(sig, 'hex'))
  } catch {
    return false
  }
}

