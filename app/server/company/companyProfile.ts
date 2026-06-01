import { newId, nowIso } from '../utils.js'

export type CompanyKey = { business_id?: string | null; prospect_id?: string | null }

export function parseCompanyKey(raw: string): CompanyKey | null {
  const s = String(raw || '')
  if (s.startsWith('business:')) return { business_id: s.slice('business:'.length) }
  if (s.startsWith('prospect:')) return { prospect_id: s.slice('prospect:'.length) }
  return null
}

export function companyKeyToString(key: CompanyKey): string {
  if (key.business_id) return `business:${key.business_id}`
  if (key.prospect_id) return `prospect:${key.prospect_id}`
  return ''
}

export async function getCompanyProfile(db: any, key: CompanyKey) {
  if (key.business_id) return db.get('SELECT * FROM company_profile WHERE business_id = ?', [key.business_id])
  if (key.prospect_id) return db.get('SELECT * FROM company_profile WHERE prospect_id = ?', [key.prospect_id])
  return null
}

export async function ensureCompanyProfile(db: any, key: CompanyKey) {
  const row = await getCompanyProfile(db, key)
  if (row) return row
  const id = newId()
  const now = nowIso()
  await db.run(
    `INSERT INTO company_profile (
      company_profile_id, business_id, prospect_id,
      website_url, legal_contact_email, headcount_range, naf_code, sector_label, annual_revenue_eur,
      website_created_at, website_redesign_at,
      created_at, updated_at
    ) VALUES (
      ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?,
      ?, ?
    )`,
    [id, key.business_id || null, key.prospect_id || null, null, null, null, null, null, null, null, null, now, now],
  )
  return getCompanyProfile(db, key)
}

export async function upsertCompanyProfile(db: any, key: CompanyKey, patch: any) {
  const current = await ensureCompanyProfile(db, key)
  const allowed = [
    'website_url',
    'legal_contact_email',
    'headcount_range',
    'naf_code',
    'sector_label',
    'annual_revenue_eur',
    'website_created_at',
    'website_redesign_at',
  ]
  const updates: string[] = []
  const params: any[] = []
  for (const f of allowed) {
    if (patch?.[f] === undefined) continue
    updates.push(`${f} = ?`)
    params.push(patch[f] === '' ? null : patch[f])
  }
  if (!updates.length) return current
  const now = nowIso()
  updates.push('updated_at = ?')
  params.push(now)
  if (key.business_id) {
    params.push(key.business_id)
    await db.run(`UPDATE company_profile SET ${updates.join(', ')} WHERE business_id = ?`, params)
  } else if (key.prospect_id) {
    params.push(key.prospect_id)
    await db.run(`UPDATE company_profile SET ${updates.join(', ')} WHERE prospect_id = ?`, params)
  }
  return getCompanyProfile(db, key)
}
