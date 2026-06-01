import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import Companies, { companiesToCsv } from '@/pages/internal/Companies'
import { useInternalAuthStore } from '@/store/internalAuthStore'
import { fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

describe('Companies', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    useInternalAuthStore.getState().setToken(null)
    cleanup()
  })

  it('affiche une entreprise filtrable par accessibilité', async () => {
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
                pagespeed: { mobile: { accessibility_score: 40 }, desktop: null, worst_accessibility: 40 },
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
    expect(await screen.findByText('ACME')).toBeInTheDocument()
    expect(await screen.findByText('2 à 10 salariés')).toBeInTheDocument()
  })

  it('permet de rafraîchir PageSpeed', async () => {
    useInternalAuthStore.getState().setToken('t')
    const fetchMock = vi.fn(async (input: any, init?: any) => {
      const url = String(input)
      if (url.includes('/api/v1/internal/companies') && init?.method === 'POST') return new Response(JSON.stringify({ success: true }), { status: 200 })
      if (url.includes('/api/v1/internal/companies'))
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
                headcount_range: null,
                naf_code: null,
                sector_label: null,
                annual_revenue_eur: null,
                pagespeed: { mobile: { accessibility_score: 40 }, desktop: null, worst_accessibility: 40 },
              },
            ],
          }),
          { status: 200 },
        )
      return new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter initialEntries={['/internal/companies']}>
        <Companies />
      </MemoryRouter>,
    )
    await screen.findByText('ACME')
    fireEvent.click(screen.getByRole('button', { name: 'Refresh PSI' }))
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/api/v1/internal/companies/business%3Ab1/pagespeed/run'))).toBe(true)
  })

  it('permet de modifier le CA', async () => {
    useInternalAuthStore.getState().setToken('t')
    const fetchMock = vi.fn(async (input: any, init?: any) => {
      const url = String(input)
      if (url.includes('/api/v1/internal/companies') && init?.method === 'PATCH') return new Response(JSON.stringify({ profile: {} }), { status: 200 })
      if (url.includes('/api/v1/internal/companies'))
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
                headcount_range: null,
                naf_code: null,
                sector_label: null,
                annual_revenue_eur: null,
                pagespeed: { mobile: { accessibility_score: 40 }, desktop: null, worst_accessibility: 40 },
              },
            ],
          }),
          { status: 200 },
        )
      return new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter initialEntries={['/internal/companies']}>
        <Companies />
      </MemoryRouter>,
    )
    await screen.findByText('ACME')
    fireEvent.click(screen.getByRole('button', { name: 'Modifier' }))
    fireEvent.change(screen.getByLabelText('CA annuel (€)'), { target: { value: '120000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/api/v1/internal/companies/business%3Ab1/profile'))).toBe(true)
  })

  it('génère un CSV', () => {
    const csv = companiesToCsv([
      {
        company_key: 'business:b1',
        type: 'business',
        name: 'ACME',
        city: 'Paris',
        website_url: 'https://acme.fr',
        legal_contact_email: 'contact@acme.fr',
        headcount_range: '2_10',
        naf_code: '4332A',
        sector_label: 'Plombier',
        annual_revenue_eur: 120000,
        website_created_at: '2020-01-01',
        website_redesign_at: null,
        pagespeed: { mobile: { accessibility_score: 40, performance_score: 80, seo_score: 70, best_practices_score: 60 }, desktop: null, worst_accessibility: 40 },
      } as any,
    ])
    expect(csv).toContain('company_key')
    expect(csv).toContain('business:b1')
    expect(csv).toContain('ACME')
  })
})
