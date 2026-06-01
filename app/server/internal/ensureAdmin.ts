import type { Db } from '../db.js'
import { hashPassword } from './password.js'
import { newId, nowIso } from '../utils.js'

export async function ensureInternalAdmin(db: Pick<Db, 'get' | 'run'>) {
  const email = String(process.env.INTERNAL_ADMIN_EMAIL || '').trim().toLowerCase()
  const password = String(process.env.INTERNAL_ADMIN_PASSWORD || '')
  if (!email || !password) return

  const existing = await db.get<{ internal_user_id: string }>('SELECT internal_user_id FROM internal_user WHERE LOWER(email) = ?', [email])
  if (existing) return

  const hash = hashPassword(password)
  await db.run(
    'INSERT INTO internal_user (internal_user_id, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)',
    [newId(), email, hash, 'admin', nowIso()],
  )
}

