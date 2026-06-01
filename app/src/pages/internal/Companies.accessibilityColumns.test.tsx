import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import Companies from '@/pages/internal/Companies'
import { useInternalAuthStore } from '@/store/internalAuthStore'
import { MemoryRouter } from 'react-router-dom'

describe('Companies accessibility columns', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    useInternalAuthStore.getState().setToken(null)
    cleanup()
  })

  it('affiche accessibilité mobile/desktop + worst', async () => {
    useInternalAuthStore.getState().setToken('t')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: any) => {
        const url = String(input)
        if (!url.includes('/api/v1/internal/companies')) return new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
        return new Response(
          JSON.stringify({
            items: [
              {
                company_key: 'business:b1',
                type: 'business',
                name: 'ACME',
                city: 'Paris',
                website_url: 'https://acme.fr',
                legal_contact_email: null,
                headcount_range: '2_10',
                naf_code: '4332A',
                sector_label: 'Plombier',
                annual_revenue_eur: 120000,
                pagespeed: {
                  mobile: { accessibility_score: 40, performance_score: 80, seo_score: 70, best_practices_score: 60 },
                  desktop: { accessibility_score: 55, performance_score: 90, seo_score: 75, best_practices_score: 65 },
                  worst_accessibility: 40,
                },
              },
            ],
          }),
          { status: 200 },
        )
      }),
    )

    render(
      <MemoryRouter initialEntries={['/internal/companies']}>
        <Companies />
      </MemoryRouter>,
    )

    await screen.findByText('ACME')
    expect(await screen.findByText(/A11y mobile/i)).toBeInTheDocument()
    const root = document.body.textContent || ''
    expect(root).toContain('A11y mobile')
    expect(root).toContain('40')
    expect(await screen.findByText(/A11y desktop/i)).toBeInTheDocument()
    expect(root).toContain('A11y desktop')
    expect(root).toContain('55')
    expect(await screen.findByText(/Worst a11y/i)).toBeInTheDocument()
  })
})
