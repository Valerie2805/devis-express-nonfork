import { describe, expect, it } from 'vitest'
import { ensureInternalAdmin } from './ensureAdmin'

describe('ensureInternalAdmin', () => {
  it('crée un user interne si absent et si env vars définies', async () => {
    process.env.INTERNAL_ADMIN_EMAIL = 'admin@example.com'
    process.env.INTERNAL_ADMIN_PASSWORD = 'pw'

    const runCalls: any[] = []
    const db: any = {
      get: async () => null,
      run: async (sql: string, params: any[]) => {
        runCalls.push({ sql, params })
      },
    }

    await ensureInternalAdmin(db)

    expect(runCalls.length).toBe(1)
    expect(runCalls[0].sql).toContain('INSERT INTO internal_user')
    expect(runCalls[0].params[1]).toBe('admin@example.com')
  })

  it('ne fait rien si env vars absentes', async () => {
    delete process.env.INTERNAL_ADMIN_EMAIL
    delete process.env.INTERNAL_ADMIN_PASSWORD

    const runCalls: any[] = []
    const db: any = {
      get: async () => null,
      run: async (sql: string, params: any[]) => {
        runCalls.push({ sql, params })
      },
    }

    await ensureInternalAdmin(db)
    expect(runCalls.length).toBe(0)
  })
})

