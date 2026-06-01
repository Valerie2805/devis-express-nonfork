import fs from 'fs'
import path from 'path'
import Database from 'better-sqlite3'

function assert(cond: any, msg: string) {
  if (!cond) throw new Error(msg)
}

async function jsonReq(base: string, p: string, init?: RequestInit) {
  const res = await fetch(`${base}${p}`, init)
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  return { res, data }
}

const dataDir = path.join(process.cwd(), 'server', 'data')
const sqlitePath = path.join(dataDir, 'devisexpress_test.sqlite')
if (fs.existsSync(sqlitePath)) fs.rmSync(sqlitePath)
if (fs.existsSync(`${sqlitePath}-shm`)) fs.rmSync(`${sqlitePath}-shm`)
if (fs.existsSync(`${sqlitePath}-wal`)) fs.rmSync(`${sqlitePath}-wal`)

process.env.SQLITE_PATH = sqlitePath
process.env.SEED_DEMO = process.env.SEED_DEMO ?? 'true'
process.env.CRON_KEY = process.env.CRON_KEY ?? 'test-cron'
process.env.RETENTION_DAYS = process.env.RETENTION_DAYS ?? '0'
process.env.RETENTION_MODE = process.env.RETENTION_MODE ?? 'anonymize'
process.env.MESSAGE_PROVIDER = process.env.MESSAGE_PROVIDER ?? 'noop'

const { default: app } = await import('../app.js')
const server = app.listen(0)
const port = (server.address() as any).port as number
const base = `http://localhost:${port}/api/v1`

try {
  const login1 = await jsonReq(base, '/backoffice/demo-business/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'owner', password: 'demo' }),
  })
  assert(login1.res.ok, 'login owner/demo should succeed')
  assert(typeof login1.data?.token === 'string', 'login should return token')
  const ownerToken = login1.data.token as string

  const createStaff = await jsonReq(base, '/backoffice/demo-business/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
    body: JSON.stringify({ username: 'staff_test', email: null, password: 'password123' }),
  })
  assert(createStaff.res.status === 201, 'owner should create staff')

  const settings0 = await jsonReq(base, '/backoffice/demo-business/settings', {
    headers: { Authorization: `Bearer ${ownerToken}` },
  })
  assert(settings0.res.ok, 'owner should read settings')

  const nextSettings = {
    ...(settings0.data?.config || {}),
    settings: {
      ...(settings0.data?.config?.settings || {}),
      retention_days: 1,
      staff_permissions: {
        ...(settings0.data?.config?.settings?.staff_permissions || {}),
        export_leads: true,
      },
    },
  }

  const patchSettings = await jsonReq(base, '/backoffice/demo-business/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
    body: JSON.stringify({ settings: nextSettings.settings }),
  })
  assert(patchSettings.res.ok, 'owner should patch settings')

  const staffLogin = await jsonReq(base, '/backoffice/demo-business/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'staff_test', password: 'password123' }),
  })
  assert(staffLogin.res.ok, 'staff should login')
  const staffToken = staffLogin.data.token as string

  const staffExport = await fetch(`${base}/backoffice/demo-business/leads/export`, {
    headers: { Authorization: `Bearer ${staffToken}` },
  })
  assert(staffExport.status === 200, 'staff export should be allowed by permission')

  const staffSettingsWrite = await fetch(`${base}/backoffice/demo-business/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${staffToken}` },
    body: JSON.stringify({ pricing: { travel_fee: 'x' } }),
  })
  assert(staffSettingsWrite.status === 403, 'staff settings write should be forbidden by default')

  const leadCreate = await jsonReq(base, '/site/demo-business/leads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      trade_id: 'plombier_chauffagiste',
      request_type: 'debouchage',
      urgency: 'today',
      channel_preference: 'sms',
      first_name: 'Test',
      phone: '0611111111',
      city: 'Paris',
      postal_code: '75001',
      photos: [],
      photos_count: 0,
    }),
  })
  assert(leadCreate.res.status === 201, 'site lead create should succeed')
  const leadId = leadCreate.data.lead_id as string

  const sql = new Database(sqlitePath)
  sql.prepare("UPDATE lead SET created_at = '2020-01-01T00:00:00.000Z', updated_at = '2020-01-01T00:00:00.000Z', status='new' WHERE lead_id = ?").run(leadId)
  sql.close()

  const cron = await fetch(`${base}/admin/cron/retention?key=test-cron`, { method: 'POST' })
  assert(cron.status === 200, 'cron retention should run')

  const sql2 = new Database(sqlitePath)
  const row = sql2.prepare('SELECT status FROM lead WHERE lead_id = ?').get(leadId) as any
  assert(row && row.status === 'deleted', 'lead should be anonymized by retention')
  sql2.close()

  const enableMfa = await fetch(`${base}/backoffice/demo-business/users/demo-owner`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
    body: JSON.stringify({ mfa_enabled: true, mfa_phone_e164: '+33123456789' }),
  })
  assert(enableMfa.status === 204, 'owner should enable MFA')

  const loginMfa = await jsonReq(base, '/backoffice/demo-business/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'owner', password: 'demo' }),
  })
  assert(loginMfa.res.ok, 'login should return mfa_required')
  assert(loginMfa.data?.mfa_required === true, 'mfa_required should be true')
  const challengeId = loginMfa.data.challenge_id as string

  const resendTooFast = await fetch(`${base}/backoffice/demo-business/login/resend_mfa`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ challenge_id: challengeId }),
  })
  assert(resendTooFast.status === 429, 'resend should be rate-limited')

  const sql3 = new Database(sqlitePath)
  sql3.prepare("UPDATE mfa_challenge SET sent_at = '2000-01-01T00:00:00.000Z', resend_count = 0 WHERE challenge_id = ?").run(challengeId)
  sql3.close()

  const resendOk = await fetch(`${base}/backoffice/demo-business/login/resend_mfa`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ challenge_id: challengeId }),
  })
  assert(resendOk.status === 204, 'resend should succeed after cooldown')

  const sql4 = new Database(sqlitePath)
  const ch = sql4.prepare('SELECT resend_count FROM mfa_challenge WHERE challenge_id = ?').get(challengeId) as any
  assert(ch && Number(ch.resend_count) === 1, 'resend_count should increment')
  sql4.close()

  process.stdout.write('ok\n')
} finally {
  server.close()
}
