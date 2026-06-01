import { describe, expect, it, vi, afterEach } from 'vitest'
import crypto from 'crypto'
import { Writable } from 'stream'

function getRouteHandler(router: any, path: string, method: string) {
  const layer = router.stack.find((l: any) => l.route && l.route.path === path && l.route.methods?.[method])
  if (!layer) throw new Error('route not found')
  const stack = layer.route.stack
  return stack[stack.length - 1].handle
}

class ResSink extends Writable {
  statusCode = 200
  headers: Record<string, string> = {}
  body = Buffer.alloc(0)
  constructor() {
    super()
  }
  _write(chunk: any, _enc: any, cb: any) {
    const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    this.body = Buffer.concat([this.body, b])
    cb()
  }
  setHeader(k: string, v: string) {
    this.headers[k.toLowerCase()] = v
  }
  status(code: number) {
    this.statusCode = code
    return this
  }
  json(obj: any) {
    this.setHeader('content-type', 'application/json')
    this.end(Buffer.from(JSON.stringify(obj)))
    return this
  }
  sendFile() {
    throw new Error('sendFile should not be called')
  }
}

describe('public site audits (blob)', () => {
  afterEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
  })

  it('sert html depuis Vercel Blob quand html_path est blob:', async () => {
    const token = 'tok'
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        get: async () => ({
          audit_id: 'a1',
          business_id: 'b1',
          status: 'done',
          public_token_hash: tokenHash,
          public_token_set_at: new Date().toISOString(),
          audit_json: JSON.stringify({ meta: { ok: true } }),
          html_path: 'blob:site_audits/a1/audit.html',
          docx_path: null,
          source_url: 'https://acme.fr',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      }),
    }))

    const html = '<html>OK</html>'
    const rs = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(html))
        controller.close()
      },
    })
    const blobGet = vi.fn(async () => ({ statusCode: 200, stream: rs, headers: new Headers(), blob: { url: '', downloadUrl: '', pathname: '', contentDisposition: '', cacheControl: '', uploadedAt: new Date(), etag: '', contentType: 'text/html', size: html.length } }))
    vi.doMock('@vercel/blob', () => ({ get: blobGet }))

    const router = (await import('./public')).default as any
    const handler = getRouteHandler(router, '/public/site_audits/:auditId/html', 'get')
    const req: any = { params: { auditId: 'a1' }, query: { t: token }, header: () => '' }
    const res = new ResSink()
    await new Promise<void>((resolve) => {
      res.on('finish', () => resolve())
      void handler(req, res as any)
    })

    expect(blobGet).toHaveBeenCalledWith('site_audits/a1/audit.html', { access: 'private' })
    expect(res.statusCode).toBe(200)
    expect(String(res.headers['content-type'])).toContain('text/html')
    expect(res.body.toString('utf8')).toContain('OK')
  })
})

