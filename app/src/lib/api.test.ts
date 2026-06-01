import { describe, expect, it, vi, afterEach } from 'vitest'
import { apiFetch } from '@/lib/api'

describe('apiFetch', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('rejette avec un message de délai dépassé quand la requête ne répond pas', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn((_input: RequestInfo, init?: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          )
        })
      }),
    )

    const p = apiFetch('/api/v1/site/demo-business/config')
    let settled: unknown = Symbol('pending')
    const handled = p.catch((e) => {
      settled = e
      return undefined
    })

    await vi.advanceTimersByTimeAsync(15000)
    await handled

    expect(settled).toBeInstanceOf(Error)
    expect((settled as Error).message).toBe('Délai dépassé')
  })
})
