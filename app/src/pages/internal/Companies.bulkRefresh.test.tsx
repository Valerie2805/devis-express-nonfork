import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Companies from '@/pages/internal/Companies'
import { useInternalAuthStore } from '@/store/internalAuthStore'

describe('Companies bulk refresh', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    useInternalAuthStore.getState().setToken(null)
    cleanup()
  })

  it('refresh PSI for all listed items', async () => {
    useInternalAuthStore.getState().setToken('t')
    const fetchMock = vi.fn(async (input: any, init?: any) => {
      const url = String(input)
      if (url.includes('/api/v1/internal/companies') && String(init?.method || 'GET') === 'GET') {
        return new Response(
          JSON.stringify({
            items: [
              {
                company_key: 'business:b1',
                type: 'business',
                name: 'ACME',
                city: null,
                website_url: null,
                legal_contact_email: null,
                headcount_range: null,
                naf_code: null,
                sector_label: null,
                pagespeed: {},
              },
              {
                company_key: 'prospect:p1',
                type: 'prospect',
                name: 'BETA',
                city: null,
                website_url: null,
                legal_contact_email: null,
                headcount_range: null,
                naf_code: null,
                sector_label: null,
                pagespeed: {},
              },
            ],
          }),
          { status: 200 },
        )
      }
      if (url.includes('/api/v1/internal/companies/business%3Ab1/pagespeed/run') && init?.method === 'POST') {
        return new Response(JSON.stringify({ success: true }), { status: 200 })
      }
      if (url.includes('/api/v1/internal/companies/prospect%3Ap1/pagespeed/run') && init?.method === 'POST') {
        return new Response(JSON.stringify({ success: true }), { status: 200 })
      }
      return new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter initialEntries={['/internal/companies']}>
        <Companies />
      </MemoryRouter>,
    )

    await screen.findByText('ACME')
    await screen.findByText('BETA')
    fireEvent.click(screen.getByRole('button', { name: 'Refresh PSI (filtrés)' }))

    await waitFor(() => {
      const called = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/pagespeed/run') && c[1]?.method === 'POST')
      expect(called.length).toBe(2)
    })
  })
})

