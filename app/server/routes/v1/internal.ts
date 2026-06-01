import type { Request, Response } from 'express'
import { getDb } from '../../db.js'
import { loginInternalUser } from '../../internal/login.js'
import { createRouter } from '../router.js'

const router = createRouter()

export async function internalLoginHandler(req: Request, res: Response) {
  const { email, password } = (req.body || {}) as { email?: string; password?: string }
  const e = String(email || '').trim()
  const p = String(password || '')
  if (!e || !p) {
    res.status(400).json({ success: false, error: 'Invalid payload' })
    return
  }
  const db = await getDb()
  const token = await loginInternalUser(db, e, p)
  if (!token) {
    res.status(401).json({ success: false, error: 'Unauthorized' })
    return
  }
  res.status(200).json({ token })
}

router.post('/internal/login', internalLoginHandler)

export default router

