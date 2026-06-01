import { Router, type RequestHandler } from 'express'

function wrap(handler: RequestHandler): RequestHandler {
  return ((req, res, next) => {
    try {
      const out = handler(req, res, next) as unknown
      if (out && typeof out === 'object' && 'then' in out && typeof (out as any).catch === 'function') (out as any).catch(next)
    } catch (e) {
      next(e)
    }
  }) as RequestHandler
}

function wrapArgs(args: any[]): any[] {
  return args.flatMap((a) => {
    if (Array.isArray(a)) return wrapArgs(a)
    if (typeof a === 'function') return [wrap(a)]
    return [a]
  })
}

export function createRouter() {
  const router = Router()
  const methods = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'all', 'use'] as const
  for (const m of methods) {
    const orig = (router as any)[m].bind(router)
    ;(router as any)[m] = (...args: any[]) => orig(...wrapArgs(args))
  }
  return router
}
