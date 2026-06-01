import { describe, expect, it, vi, afterEach } from 'vitest'
import crypto from 'crypto'

function createRes() {
  let resolveDone: (() => void) | null = null
  const done = new Promise<void>((r) => {
    resolveDone = r
  })
  const out: any = { statusCode: 200, body: null, done }
  out.status = (code: number) => {
    out.statusCode = code
    return out
  }
  out.json = (body: any) => {
    out.body = body
    resolveDone?.()
    return out
  }
  return out
}

function getRouteHandler(router: any, path: string, method: string) {
  const layer = router.stack.find((l: any) => l.route && l.route.path === path && l.route.methods?.[method])
  if (!layer) throw new Error('route not found')
  const stack = layer.route.stack
  return stack[stack.length - 1].handle
}

function sha256(s: string) {
  return crypto.createHash('sha256').update(s).digest('hex')
}

function encryptPreviewToken(s: string) {
  const key = crypto.createHash('sha256').update('dev-secret').digest()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(Buffer.from(s, 'utf8')), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`
}

describe('public portal', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('refuse si token invalide', async () => {
    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        get: async () => ({
          portal_id: 'p1',
          portal_token_hash: '00',
          portal_token_set_at: 'x',
          preview_token_hash: '00',
          preview_token_set_at: 'x',
          pin_hash: '00',
          pin_set_at: 'x',
          preview_enabled: 0,
        }),
      }),
    }))

    const router = (await import('./public.portal')).default as any
    const handler = getRouteHandler(router, '/public/portal/:portalId', 'get')
    const req: any = { params: { portalId: 'p1' }, query: { t: 'bad' } }
    const res = createRes()
    await handler(req, res as any, (e: any) => {
      if (e) throw e
    })
    await res.done
    expect(res.statusCode).toBe(404)
  })

  it('unlock ok retourne un session_token', async () => {
    const portalToken = 'tok_portal'
    const pin = '123456'
    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        get: async (_sql: string, _params: any[]) => ({
          portal_id: 'p1',
          business_id: 'b1',
          lead_id: 'l1',
          portal_token_hash: sha256(portalToken),
          pin_hash: sha256(pin),
          preview_enabled: 0,
        }),
      }),
    }))

    const router = (await import('./public.portal')).default as any
    const handler = getRouteHandler(router, '/public/portal/:portalId/unlock', 'post')
    const req: any = { params: { portalId: 'p1' }, query: { t: portalToken }, body: { pin } }
    const res = createRes()
    await handler(req, res as any, (e: any) => {
      if (e) throw e
    })
    await res.done
    expect(res.statusCode).toBe(200)
    expect(res.body.session_token).toBeTruthy()
  })

  it('preview refuse si preview non activée', async () => {
    const portalToken = 'tok_portal'
    const pin = '123456'
    const previewToken = 'tok_preview'
    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        get: async (_sql: string) => ({
          portal_id: 'p1',
          business_id: 'b1',
          lead_id: 'l1',
          portal_token_hash: sha256(portalToken),
          preview_token_hash: sha256(previewToken),
          pin_hash: sha256(pin),
          preview_enabled: 0,
        }),
      }),
    }))

    const router = (await import('./public.portal')).default as any
    const unlock = getRouteHandler(router, '/public/portal/:portalId/unlock', 'post')
    const unlockReq: any = { params: { portalId: 'p1' }, query: { t: portalToken }, body: { pin } }
    const unlockRes = createRes()
    await unlock(unlockReq, unlockRes as any, (e: any) => {
      if (e) throw e
    })
    await unlockRes.done

    const handler = getRouteHandler(router, '/public/portal/:portalId/preview', 'get')
    const req: any = { params: { portalId: 'p1' }, query: { t: previewToken, s: unlockRes.body.session_token } }
    const res = createRes()
    await handler(req, res as any, (e: any) => {
      if (e) throw e
    })
    await res.done
    expect(res.statusCode).toBe(409)
  })

  it('home renvoie preview_token si preview activée', async () => {
    const portalToken = 'tok_portal'
    const pin = '123456'
    const previewToken = 'tok_preview'
    const previewEnc = encryptPreviewToken(previewToken)

    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        get: async (sql: string) => {
          if (sql.includes('portal_token_hash') && sql.includes('pin_hash')) {
            return { portal_id: 'p1', portal_token_hash: sha256(portalToken), pin_hash: sha256(pin), preview_enabled: 1 }
          }
          if (sql.includes('FROM lead_portal_access') && sql.includes('preview_token_enc')) {
            return { portal_id: 'p1', business_id: 'b1', lead_id: 'l1', portal_token_hash: sha256(portalToken), preview_enabled: 1, preview_token_enc: previewEnc }
          }
          if (sql.includes('FROM lead_site_state')) return { site_status: 'in_progress', site_started_at: null, site_delivered_at: null }
          return null
        },
        all: async () => [],
      }),
    }))

    const router = (await import('./public.portal')).default as any
    const unlock = getRouteHandler(router, '/public/portal/:portalId/unlock', 'post')
    const unlockReq: any = { params: { portalId: 'p1' }, query: { t: portalToken }, body: { pin } }
    const unlockRes = createRes()
    await unlock(unlockReq, unlockRes as any, (e: any) => {
      if (e) throw e
    })
    await unlockRes.done
    expect(unlockRes.statusCode).toBe(200)

    const home = getRouteHandler(router, '/public/portal/:portalId/home', 'get')
    const req: any = { params: { portalId: 'p1' }, query: { t: portalToken, s: unlockRes.body.session_token } }
    const res = createRes()
    await home(req, res as any, (e: any) => {
      if (e) throw e
    })
    await res.done
    expect(res.statusCode).toBe(200)
    expect(res.body.preview_token).toBe(previewToken)
  })
})
