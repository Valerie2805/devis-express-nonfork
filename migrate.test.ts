import { describe, expect, it, vi, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { runMigrations } from './migrate'
import type { Db } from './db'

function createFakeDb(): Db & { execCalls: string[]; runCalls: Array<{ sql: string; params: any[] }> } {
  const execCalls: string[] = []
  const runCalls: Array<{ sql: string; params: any[] }> = []
  const applied = new Set<string>()
  return {
    driver: 'postgres',
    execCalls,
    runCalls,
    async exec(sql: string) {
      execCalls.push(sql)
    },
    async run(sql: string, params: any[] = []) {
      runCalls.push({ sql, params })
      if (sql.includes('INSERT INTO schema_migrations') && params[0]) applied.add(String(params[0]))
    },
    async get<T>(sql: string, params: any[] = []) {
      if (sql.includes('FROM schema_migrations') && params[0]) {
        const id = String(params[0])
        return (applied.has(id) ? ({ id } as any) : null) as T | null
      }
      return null
    },
    async all<T>() {
      return [] as T[]
    },
  }
}

describe('runMigrations', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('applique les migrations même si le cwd ne contient pas server/migrations (cas Vercel)', async () => {
    const prev = process.cwd()
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mad-cwd-'))
    process.chdir(tmp)
    try {
      const db = createFakeDb()
      await runMigrations(db)
      expect(db.execCalls.join('\n')).toContain('CREATE TABLE IF NOT EXISTS business')
    } finally {
      process.chdir(prev)
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('applique une migration fallback si le dossier migrations n’est pas présent dans le bundle', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false)
    const db = createFakeDb()
    await runMigrations(db)
    expect(db.execCalls.join('\n')).toContain('CREATE TABLE IF NOT EXISTS business')
  })

  it('applique les migrations internes ajoutées au projet', async () => {
    const db = createFakeDb()
    await runMigrations(db)
    const ids = db.runCalls
      .filter((c) => c.sql.includes('INSERT INTO schema_migrations'))
      .map((c) => String(c.params[0]))
    expect(ids).toContain('0011_internal_auth.sql')
    expect(ids).toContain('0012_prospection.sql')
    expect(ids).toContain('0013_company_profile_pagespeed_commission.sql')
    expect(ids).toContain('0014_lead_site_portal_revenue.sql')
    expect(ids).toContain('0015_business_prospect.sql')
    expect(ids).toContain('0016_lead_portal_messages_checklist.sql')
    expect(ids).toContain('0017_lead_portal_access_enc.sql')
    expect(ids).toContain('0018_lead_commission_rate.sql')
    expect(ids).toContain('0019_prospection_mini_crm.sql')
    expect(ids).toContain('0020_prospect_reviews.sql')
    expect(ids).toContain('0021_site_audit_archive.sql')
  })
})
