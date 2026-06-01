import { describe, expect, it, vi, afterEach } from 'vitest'

function createRes() {
  const out: any = { statusCode: 200, body: null }
  out.status = (code: number) => {
    out.statusCode = code
    return out
  }
  out.json = (body: any) => {
    out.body = body
    return out
  }
  return out
}

describe('internal prospection list prospects', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('retourne une liste de prospects', async () => {
    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        all: async () => [
          { prospect_id: 'p1', name: 'ACME', status: 'new', updated_at: '2026-01-01' },
          { prospect_id: 'p2', name: 'Beta', status: 'replied', updated_at: '2026-01-02' },
        ],
      }),
    }))
    const { listProspectsHandler } = await import('./internalProspection')
    const req: any = { query: {} }
    const res = createRes()
    await listProspectsHandler(req, res as any)
    expect(res.statusCode).toBe(200)
    expect(res.body?.items?.length).toBe(2)
    expect(res.body.items[0].prospect_id).toBe('p1')
  })
})

