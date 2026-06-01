import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Stats from '@/pages/backoffice/Stats'
import { useAuthStore } from '@/store/authStore'

describe('Backoffice Stats revenue', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    useAuthStore.getState().setToken(null)
    cleanup()
  })

  it('affiche le CA période et le CA par mois', async () => {
    useAuthStore.getState().setToken('t')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: any) => {
        const url = String(input)
        if (url.includes('/api/v1/backoffice/b1/me')) return new Response(JSON.stringify({ role: 'owner' }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/settings')) return new Response(JSON.stringify({ config: { settings: {} } }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/dashboard')) {
          return new Response(
            JSON.stringify({
              cards: {
                leads_total: 1,
                leads_qualified: 1,
                leads_needs_followup: 0,
                calls_clicks: 0,
                whatsapp_clicks: 0,
                form_opens: 0,
                response_time_avg_minutes: null,
                response_under_10min_rate: null,
                leads_responded_under_10min: 0,
                appointments: 0,
                quotes_sent: 0,
                won: 1,
                lost: 0,
                win_rate: 1,
                revenue_cents: 12300,
              },
              charts: {
                revenue_by_month: [
                  { month: '2026-03', revenue_cents: 9900 },
                  { month: '2026-04', revenue_cents: 12300 },
                ],
              },
              sources: {},
            }),
            { status: 200 },
          )
        }
        if (url.includes('/api/v1/backoffice/b1/reporting/funnel')) {
          return new Response(
            JSON.stringify({
              funnel: { submit_quote_form: 0, leads_created: 1, leads_contacted: 1, appointments_scheduled: 0, won: 1 },
            }),
            { status: 200 },
          )
        }
        return new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
      }),
    )

    render(
      <MemoryRouter initialEntries={['/backoffice/b1/stats']}>
        <Routes>
          <Route path="/backoffice/:businessId/stats" element={<Stats />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('CA')).toBeInTheDocument()
    expect(screen.getAllByText('123,00 €').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('CA par mois')).toBeInTheDocument()
    expect(screen.getByText('2026-04')).toBeInTheDocument()
  })
})
