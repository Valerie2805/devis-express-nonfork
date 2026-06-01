import { describe, expect, it } from 'vitest'
import { upsertCompanyProfile } from './companyProfile'

describe('companyProfile', () => {
  it('upsert company profile for business', async () => {
    const calls: any[] = []
    const db: any = {
      run: async (sql: string, params: any[]) => {
        calls.push({ sql, params })
      },
      get: async () => null,
    }

    await upsertCompanyProfile(db, { business_id: 'b1' }, { headcount_range: '2_10' })
    expect(calls.length).toBeGreaterThan(0)
    expect(calls.some((c) => String(c.sql).includes('INSERT INTO company_profile'))).toBe(true)
  })
})
