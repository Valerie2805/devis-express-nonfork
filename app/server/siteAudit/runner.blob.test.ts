import { describe, expect, it, vi, afterEach } from 'vitest'

describe('site audit runner (vercel blob)', () => {
  afterEach(() => {
    delete process.env.VERCEL
    vi.resetModules()
    vi.restoreAllMocks()
  })

  it('stocke html/docx dans Vercel Blob en prod Vercel', async () => {
    process.env.VERCEL = '1'
    const runCalls: any[] = []

    vi.doMock('../db.js', () => ({
      getDb: async () => ({
        run: async (sql: string, params: any[]) => runCalls.push({ sql, params }),
      }),
    }))
    vi.doMock('./siteAudit.js', () => ({
      generateSiteAudit: async () => ({ meta: { ok: true } }),
    }))
    vi.doMock('./templates.js', () => ({
      buildAuditHtml: () => '<html>ok</html>',
    }))
    vi.doMock('./docx.js', () => ({
      buildAuditDocx: async () => Buffer.from('docx'),
    }))

    const putMock = vi.fn(async (pathname: string) => ({ pathname, url: `https://blob/${pathname}` }))
    vi.doMock('@vercel/blob', () => ({ put: putMock }))

    const { enqueueSiteAudit } = await import('./runner')
    await enqueueSiteAudit({ auditId: 'a1', businessId: 'b1', sourceUrl: 'https://acme.fr', token: 't', tokenHash: 'h' })

    expect(putMock).toHaveBeenCalledTimes(2)
    expect(putMock.mock.calls[0][0]).toBe('site_audits/a1/audit.html')
    expect(putMock.mock.calls[1][0]).toBe('site_audits/a1/audit.docx')
    expect(runCalls.some((c) => String(c.sql).includes('UPDATE site_audit SET status') && String(c.params?.[3] || '') === 'blob:site_audits/a1/audit.html')).toBe(true)
    expect(runCalls.some((c) => String(c.sql).includes('UPDATE site_audit SET status') && String(c.params?.[4] || '') === 'blob:site_audits/a1/audit.docx')).toBe(true)
  })
})
