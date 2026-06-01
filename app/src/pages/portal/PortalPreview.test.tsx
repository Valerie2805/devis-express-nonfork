import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import PortalPreview from '@/pages/portal/PortalPreview'

function installLocalStorageMock() {
  const store = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', {
    value: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => void store.clear(),
    },
    configurable: true,
  })
}

describe('Portal preview', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    window.localStorage.clear()
    cleanup()
  })

  it('affiche une preview si autorisée', async () => {
    installLocalStorageMock()
    window.localStorage.setItem('portal_session:p1', 'sess1')

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: any) => {
        const url = String(input)
        if (url.includes('/api/v1/public/portal/p1/preview?t=tok_preview&s=sess1')) {
          return new Response(JSON.stringify({ success: true, business_id: 'b1' }), { status: 200 })
        }
        if (url.includes('/api/v1/public/portal/p1/site_config?t=tok_preview&s=sess1')) {
          return new Response(
            JSON.stringify({
              business_id: 'b1',
              config: { company_name: 'Demo', phone_e164: '+331', settings: { tracking_enabled: false } },
              content: {
                site_copy: {},
                tarifs: {},
                tarifs_common: {},
                form: {},
                blueprints: {
                  pages: {
                    home: {
                      sections_order: ['hero'],
                      sections: { hero: { components: [{ type: 'headline', text: 'Hello' }] } },
                    },
                  },
                  global: { seo: { titles: {} } },
                },
                trade_label: '',
                ab: { hero_variant: 'A', experiments: {} },
                google_reviews: { rating_avg: null, rating_count: 0, reviews: [] },
                photos_real: [],
              },
            }),
            { status: 200 },
          )
        }
        return new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
      }),
    )

    render(
      <MemoryRouter initialEntries={['/portal/p1/preview?t=tok_preview']}>
        <Routes>
          <Route path="/portal/:portalId/preview" element={<PortalPreview />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('Hello')).toBeInTheDocument()
  })
})

