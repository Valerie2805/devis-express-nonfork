import type { Request, Response, NextFunction } from 'express'
import { verifyInternalToken, type InternalAuthPayload } from './auth.js'

declare module 'express-serve-static-core' {
  interface Request {
    internal_auth?: InternalAuthPayload
  }
}

export function requireInternalAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header('authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : ''
  if (!token) {
    res.status(401).json({ success: false, error: 'Unauthorized' })
    return
  }
  try {
    const secret = process.env.INTERNAL_JWT_SECRET || 'dev-internal-secret'
    req.internal_auth = verifyInternalToken(token, secret)
    next()
  } catch {
    res.status(401).json({ success: false, error: 'Unauthorized' })
  }
}
