import jwt from 'jsonwebtoken'

export type InternalAuthPayload = {
  internal_user_id: string
  email: string
  role?: string
}

export function signInternalToken(payload: InternalAuthPayload, secret: string) {
  return jwt.sign(payload, secret, { expiresIn: '7d' })
}

export function verifyInternalToken(token: string, secret: string) {
  return jwt.verify(token, secret) as InternalAuthPayload
}

