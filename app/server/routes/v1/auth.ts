import type { Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { getDb } from '../../db.js'
import { getEmailProvider } from '../../providers/emailProvider.js'
import { nowIso, normalizePhone } from '../../utils.js'
import { getMessagingProvider } from '../../providers/messagingProvider.js'
import { createRouter } from '../router.js'

const router = createRouter()

function newMfaCode() {
  const code = String(Math.floor(100000 + Math.random() * 900000))
  const codeHash = crypto.createHash('sha256').update(code).digest('hex')
  return { code, code_hash: codeHash }
}

router.post('/backoffice/:businessId/login', async (req: Request, res: Response) => {
  const { username, identifier, password } = (req.body || {}) as { username?: string; identifier?: string; password?: string }
  const businessId = req.params.businessId

  const db = await getDb()
  const business = await db.get<{ business_id: string }>('SELECT business_id FROM business WHERE business_id = ?', [businessId])
  if (!business) {
    res.status(404).json({ success: false, error: 'Business not found' })
    return
  }

  const ident = String(identifier || username || '').trim().toLowerCase()
  const user = await db.get<{
    user_id: string
    username: string
    email: string | null
    password_hash: string
    role: 'owner' | 'staff'
    failed_attempts: number | null
    last_failed_at: string | null
    locked_until: string | null
    mfa_enabled?: number | null
    mfa_phone_e164?: string | null
  }>(
    'SELECT user_id, username, email, password_hash, role, failed_attempts, last_failed_at, locked_until, mfa_enabled, mfa_phone_e164 FROM business_user WHERE business_id = ? AND (LOWER(username) = ? OR LOWER(email) = ?)',
    [businessId, ident, ident],
  )

  if (!user || !password) {
    res.status(401).json({ success: false, error: 'Invalid credentials' })
    return
  }

  if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
    res.status(423).json({ success: false, error: 'Account locked' })
    return
  }

  const ok = bcrypt.compareSync(password, user.password_hash)
  if (!ok) {
    const windowMs = 15 * 60 * 1000
    const lastFailMs = user.last_failed_at ? new Date(user.last_failed_at).getTime() : 0
    const current = typeof user.failed_attempts === 'number' ? user.failed_attempts : 0
    const nextAttempts = Date.now() - lastFailMs <= windowMs ? current + 1 : 1
    const lockUntil = nextAttempts >= 5 ? new Date(Date.now() + windowMs).toISOString() : null
    await db.run('UPDATE business_user SET failed_attempts = ?, last_failed_at = ?, locked_until = ? WHERE business_id = ? AND user_id = ?', [
      nextAttempts,
      nowIso(),
      lockUntil,
      businessId,
      user.user_id,
    ])
    res.status(401).json({ success: false, error: 'Invalid credentials' })
    return
  }

  await db.run('UPDATE business_user SET failed_attempts = ?, last_failed_at = ?, locked_until = ? WHERE business_id = ? AND user_id = ?', [
    0,
    null,
    null,
    businessId,
    user.user_id,
  ])

  const mfaEnabled = Boolean(user.mfa_enabled)
  if (mfaEnabled) {
    const to = user.mfa_phone_e164 ? normalizePhone(String(user.mfa_phone_e164)) : ''
    if (!to) {
      res.status(400).json({ success: false, error: '2FA not configured' })
      return
    }
    const { code, code_hash } = newMfaCode()
    const challengeId = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
    const now = nowIso()
    await db.run(
      `INSERT INTO mfa_challenge (challenge_id, business_id, user_id, code_hash, expires_at, attempts, sent_at, resend_count, consumed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [challengeId, businessId, user.user_id, code_hash, expiresAt, 0, now, 0, null],
    )
    const provider = getMessagingProvider()
    await provider.send({ channel: 'sms', to, text: `Code de connexion: ${code}` })
    res.status(200).json({ mfa_required: true, challenge_id: challengeId })
    return
  }

  const secret = process.env.JWT_SECRET || 'dev-secret'
  const token = jwt.sign({ business_id: businessId, role: user.role, user_id: user.user_id }, secret, { expiresIn: '7d' })
  res.status(200).json({ token })
})

router.post('/backoffice/:businessId/login/verify_mfa', async (req: Request, res: Response) => {
  const { challenge_id, code } = (req.body || {}) as { challenge_id?: string; code?: string }
  const businessId = req.params.businessId
  const cid = String(challenge_id || '')
  const raw = String(code || '').trim()
  if (!cid || raw.length !== 6) {
    res.status(400).json({ success: false, error: 'Invalid payload' })
    return
  }

  const db = await getDb()
  const ch = await db.get<{
    challenge_id: string
    user_id: string
    code_hash: string
    expires_at: string
    attempts: number
    consumed_at: string | null
  }>(
    'SELECT challenge_id, user_id, code_hash, expires_at, attempts, consumed_at FROM mfa_challenge WHERE business_id = ? AND challenge_id = ?',
    [businessId, cid],
  )
  if (!ch || ch.consumed_at) {
    res.status(400).json({ success: false, error: 'Invalid challenge' })
    return
  }
  if (new Date(ch.expires_at).getTime() < Date.now()) {
    res.status(400).json({ success: false, error: 'Expired challenge' })
    return
  }
  if (ch.attempts >= 5) {
    res.status(400).json({ success: false, error: 'Too many attempts' })
    return
  }

  const codeHash = crypto.createHash('sha256').update(raw).digest('hex')
  if (codeHash !== ch.code_hash) {
    await db.run('UPDATE mfa_challenge SET attempts = ? WHERE challenge_id = ?', [ch.attempts + 1, ch.challenge_id])
    res.status(401).json({ success: false, error: 'Invalid code' })
    return
  }

  await db.run('UPDATE mfa_challenge SET consumed_at = ? WHERE challenge_id = ?', [nowIso(), ch.challenge_id])
  const user = await db.get<{ role: 'owner' | 'staff' }>('SELECT role FROM business_user WHERE business_id = ? AND user_id = ?', [businessId, ch.user_id])
  if (!user) {
    res.status(400).json({ success: false, error: 'Invalid user' })
    return
  }
  const secret = process.env.JWT_SECRET || 'dev-secret'
  const token = jwt.sign({ business_id: businessId, role: user.role, user_id: ch.user_id }, secret, { expiresIn: '7d' })
  res.status(200).json({ token })
})

router.post('/backoffice/:businessId/login/resend_mfa', async (req: Request, res: Response) => {
  const { challenge_id } = (req.body || {}) as { challenge_id?: string }
  const businessId = req.params.businessId
  const cid = String(challenge_id || '')
  if (!cid) {
    res.status(400).json({ success: false, error: 'Invalid payload' })
    return
  }

  const db = await getDb()
  const ch = await db.get<{
    challenge_id: string
    user_id: string
    expires_at: string
    consumed_at: string | null
    sent_at: string | null
    resend_count: number | null
  }>(
    'SELECT challenge_id, user_id, expires_at, consumed_at, sent_at, resend_count FROM mfa_challenge WHERE business_id = ? AND challenge_id = ?',
    [businessId, cid],
  )

  if (!ch || ch.consumed_at) {
    res.status(400).json({ success: false, error: 'Invalid challenge' })
    return
  }
  if (new Date(ch.expires_at).getTime() < Date.now()) {
    res.status(400).json({ success: false, error: 'Expired challenge' })
    return
  }

  const lastSent = ch.sent_at ? new Date(ch.sent_at).getTime() : 0
  if (lastSent && Date.now() - lastSent < 30_000) {
    res.status(429).json({ success: false, error: 'Too many requests' })
    return
  }

  const count = typeof ch.resend_count === 'number' ? ch.resend_count : 0
  if (count >= 3) {
    res.status(429).json({ success: false, error: 'Too many requests' })
    return
  }

  const user = await db.get<{ mfa_phone_e164: string | null }>('SELECT mfa_phone_e164 FROM business_user WHERE business_id = ? AND user_id = ?', [
    businessId,
    ch.user_id,
  ])
  const to = user?.mfa_phone_e164 ? normalizePhone(String(user.mfa_phone_e164)) : ''
  if (!to) {
    res.status(400).json({ success: false, error: '2FA not configured' })
    return
  }

  const { code, code_hash } = newMfaCode()
  const nextExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
  const now = nowIso()
  await db.run('UPDATE mfa_challenge SET code_hash = ?, expires_at = ?, attempts = ?, sent_at = ?, resend_count = ? WHERE challenge_id = ?', [
    code_hash,
    nextExpiresAt,
    0,
    now,
    count + 1,
    ch.challenge_id,
  ])

  const provider = getMessagingProvider()
  await provider.send({ channel: 'sms', to, text: `Nouveau code de connexion: ${code}` })
  res.status(204).end()
})

router.post('/backoffice/:businessId/request_password_reset', async (req: Request, res: Response) => {
  const { identifier } = (req.body || {}) as { identifier?: string }
  const businessId = req.params.businessId
  const ident = String(identifier || '').trim().toLowerCase()
  const db = await getDb()

  const user = ident
    ? await db.get<{ user_id: string; username: string; email: string | null }>(
        'SELECT user_id, username, email FROM business_user WHERE business_id = ? AND (LOWER(username) = ? OR LOWER(email) = ?) LIMIT 1',
        [businessId, ident, ident],
      )
    : null

  if (!user) {
    res.status(204).end()
    return
  }

  const raw = crypto.randomBytes(32).toString('hex')
  const tokenHash = crypto.createHash('sha256').update(raw).digest('hex')
  const tokenId = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()

  await db.run(
    `INSERT INTO password_reset_token (token_id, business_id, user_id, token_hash, expires_at, used_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [tokenId, businessId, user.user_id, tokenHash, expiresAt, null],
  )

  const to = user.email || (user.username.includes('@') ? user.username : '')
  if (to) {
    const appUrl = process.env.APP_URL || ''
    const link = appUrl ? `${appUrl.replace(/\/$/, '')}/backoffice/${businessId}/reset?token=${raw}` : `token:${raw}`
    const emailProvider = getEmailProvider()
    await emailProvider.send({
      to,
      subject: 'Réinitialisation du mot de passe',
      text: `Lien de réinitialisation : ${link}`,
    })
  }

  res.status(204).end()
})

router.post('/backoffice/:businessId/reset_password', async (req: Request, res: Response) => {
  const { token, new_password } = (req.body || {}) as { token?: string; new_password?: string }
  const businessId = req.params.businessId
  const raw = String(token || '').trim()
  const nextPassword = String(new_password || '')
  if (!raw || nextPassword.length < 8) {
    res.status(400).json({ success: false, error: 'Invalid payload' })
    return
  }

  const db = await getDb()
  const tokenHash = crypto.createHash('sha256').update(raw).digest('hex')
  const row = await db.get<{ token_id: string; user_id: string; expires_at: string; used_at: string | null }>(
    'SELECT token_id, user_id, expires_at, used_at FROM password_reset_token WHERE business_id = ? AND token_hash = ?',
    [businessId, tokenHash],
  )
  if (!row || row.used_at) {
    res.status(400).json({ success: false, error: 'Invalid token' })
    return
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    res.status(400).json({ success: false, error: 'Expired token' })
    return
  }

  const hash = bcrypt.hashSync(nextPassword, 10)
  await db.run('UPDATE business_user SET password_hash = ? WHERE business_id = ? AND user_id = ?', [hash, businessId, row.user_id])
  await db.run('UPDATE password_reset_token SET used_at = ? WHERE token_id = ?', [nowIso(), row.token_id])
  res.status(204).end()
})

export default router
