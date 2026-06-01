import { describe, expect, it, afterEach, vi } from 'vitest'
import { getLeadAttribution, track } from './tracking'

describe('getLeadAttribution', () => {
  afterEach(() => {
    try {
      window.localStorage.removeItem('mad_utms_v1')
    } catch {}
  })

  it('retourne landing_path + utm + referrer', () => {
    window.history.pushState({}, '', '/?utm_source=google&utm_medium=cpc&utm_campaign=test')
    const out = getLeadAttribution()
    expect(out.utm_source).toBe('google')
    expect(out.utm_medium).toBe('cpc')
    expect(out.utm_campaign).toBe('test')
    expect(out.landing_path).toBe('/')
  })
})

describe('track open_quote_form', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    ;(window as any).__mad_tracking_enabled = undefined
    try {
      window.sessionStorage.removeItem('mad_view_dedupe_v1')
    } catch {}
    try {
      window.localStorage.removeItem('mad_session_v1')
    } catch {}
  })

  it('ne déduplique pas les cta_click mais déduplique scroll/deeplink', async () => {
    const calls: any[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: any, init?: any) => {
        calls.push({ init })
        return new Response('', { status: 200 })
      }),
    )

    await track('b1', 't1', 'open_quote_form', { page_type: 'home', page_path: '/x', properties: { trigger: 'scroll' } })
    await track('b1', 't1', 'open_quote_form', { page_type: 'home', page_path: '/x', properties: { trigger: 'scroll' } })
    await track('b1', 't1', 'open_quote_form', { page_type: 'home', page_path: '/x', properties: { trigger: 'cta_click' } })
    await track('b1', 't1', 'open_quote_form', { page_type: 'home', page_path: '/x', properties: { trigger: 'cta_click' } })

    expect(calls.length).toBe(3)
    const bodies = calls.map((c) => JSON.parse(String(c.init?.body || '{}')))
    expect(bodies.filter((b) => b.name === 'open_quote_form').length).toBe(3)
  })

  it('bloque open_quote_form auto après cta_click', async () => {
    const calls: any[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: any, init?: any) => {
        calls.push({ init })
        return new Response('', { status: 200 })
      }),
    )

    await track('b1', 't1', 'open_quote_form', { page_type: 'home', page_path: '/x', properties: { trigger: 'cta_click' } })
    await track('b1', 't1', 'open_quote_form', { page_type: 'home', page_path: '/x', properties: { trigger: 'scroll' } })
    expect(calls.length).toBe(1)
  })

  it('n’envoie rien si tracking désactivé', async () => {
    const calls: any[] = []
    ;(window as any).__mad_tracking_enabled = false
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: any, init?: any) => {
        calls.push({ init })
        return new Response('', { status: 200 })
      }),
    )
    await track('b1', 't1', 'view_page', { page_type: 'home', page_path: '/' })
    expect(calls.length).toBe(0)
  })
})
