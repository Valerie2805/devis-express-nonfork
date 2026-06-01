import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

type JwtPayload = {
  business_id: string
  role: 'owner' | 'staff'
  user_id?: string
}

declare module 'express-serve-static-core' {
  interface Request {
    auth?: JwtPayload
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header('authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : ''
  if (!token) {
    res.status(401).json({ success: false, error: 'Unauthorized' })
    return
  }
  try {
    const secret = process.env.JWT_SECRET || 'dev-secret'
    const payload = jwt.verify(token, secret) as JwtPayload
    req.auth = payload
    next()
  } catch {
    res.status(401).json({ success: false, error: 'Unauthorized' })
  }
}
