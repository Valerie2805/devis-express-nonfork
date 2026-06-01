import { describe, expect, it, vi, afterEach } from 'vitest'
import { fireEvent, render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Commissions from '@/pages/backoffice/Commissions'
import { useAuthStore } from '@/store/authStore'

describe('Backoffice Commissions', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    useAuthStore.getState().setToken(null)
    cleanup()
  })

  it('affiche les commissions et permet de mettre à jour le taux', async () => {
    useAuthStore.getState().setToken('t')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: any, init?: any) => {
        const url = String(input)
        if (url.includes('/api/v1/backoffice/b1/me')) return new Response(JSON.stringify({ role: 'owner' }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/settings')) return new Response(JSON.stringify({ config: { settings: {} } }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/commissions') && (!init || !init.method || init.method === 'GET')) {
          return new Response(
            JSON.stringify({
              default_rate_pct: 10,
              totals_by_month: { '2026-04': { revenue_cents: 10000, commission_cents: 1000, count: 1 } },
              items: [
                {
                  lead_id: 'l1',
                  first_name: 'A',
                  city: 'Paris',
                  month: '2026-04',
                  months: ['2026-04'],
                  by_month: [{ month: '2026-04', amount_cents: 10000, commission_cents: 1000 }],
                  amount_cents: 10000,
                  rate_pct: 10,
                  commission_cents: 1000,
                },
              ],
            }),
            { status: 200 },
          )
        }
        if (url.includes('/api/v1/backoffice/b1/leads/l1/commission_rate') && init?.method === 'PUT') {
          return new Response(JSON.stringify({ lead_id: 'l1', rate_pct: 15 }), { status: 200 })
        }
        return new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
      }),
    )

    render(
      <MemoryRouter initialEntries={['/backoffice/b1/commissions']}>
        <Routes>
          <Route path="/backoffice/:businessId/commissions" element={<Commissions />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('Commissions')).toBeInTheDocument()
    expect(await screen.findByText('A')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Taux l1'), { target: { value: '15' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer l1' }))
    expect((fetch as any).mock.calls.some((c: any[]) => String(c[0]).includes('/leads/l1/commission_rate') && c[1]?.method === 'PUT')).toBe(true)
  })
})
