import type { Db } from '../db.js'
import { signInternalToken } from './auth.js'
import { verifyPassword } from './password.js'

export async function loginInternalUser(db: Pick<Db, 'get'>, email: string, password: string) {
  const ident = String(email || '').trim().toLowerCase()
  const user = await db.get<{
    internal_user_id: string
    email: string
    role: string
    password_hash: string
  }>('SELECT internal_user_id, email, role, password_hash FROM internal_user WHERE LOWER(email) = ?', [ident])

  if (!user) return null
  if (!verifyPassword(password, user.password_hash)) return null

  const secret = process.env.INTERNAL_JWT_SECRET || 'dev-internal-secret'
  return signInternalToken({ internal_user_id: user.internal_user_id, email: user.email, role: user.role }, secret)
}
