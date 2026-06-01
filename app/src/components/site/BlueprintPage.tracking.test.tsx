import { describe, expect, it, vi, afterEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { render, cleanup } from '@testing-library/react'
import BlueprintPage from './BlueprintPage'

describe('BlueprintPage tracking', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    cleanup()
  })

  it('émet view_page au chargement', async () => {
    const calls: any[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: any, init?: any) => {
        const url = String(input)
        calls.push({ url, init })
        return new Response('', { status: 204 })
      }),
    )
    window.history.pushState({}, '', '/site/b1')

    render(
      <MemoryRouter initialEntries={['/site/b1']}>
        <BlueprintPage
          businessId="b1"
          pageKey="home"
          config={{ phone_e164: '+33123456789', whatsapp_e164: '+33123456789', company_name: 'ACME', trade_id: 't1' }}
          content={{
            blueprints: { global: { seo: { titles: { home: 'Titre Home' } } }, pages: { home: { sections_order: [], sections: {} } } },
            ab: { experiments: {} },
          }}
        />
      </MemoryRouter>,
    )

    const analyticsBodies = calls
      .filter((c) => String(c.url).includes('/api/v1/analytics/b1/events'))
      .map((c) => JSON.parse(String(c.init?.body || '{}')))
    expect(analyticsBodies.some((b) => b?.name === 'view_page' && b?.page_type === 'home')).toBe(true)
    expect(document.title).toBe('Titre Home')
  })
})
