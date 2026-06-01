import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import Commissions from '@/pages/internal/Commissions'
import { useInternalAuthStore } from '@/store/internalAuthStore'
import { MemoryRouter } from 'react-router-dom'

describe('Commissions details', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    useInternalAuthStore.getState().setToken(null)
    cleanup()
  })

  it('affiche le détail d’un mois', async () => {
    useInternalAuthStore.getState().setToken('t')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: any, init?: any) => {
        const url = String(input)
        if (url.includes('/api/v1/internal/companies')) {
          return new Response(JSON.stringify({ items: [] }), { status: 200 })
        }
        if (url.includes('/api/v1/internal/commissions') && String(init?.method || 'GET') === 'GET') {
          return new Response(
            JSON.stringify({
              items: [
                {
                  entry_id: 'e1',
                  month: '2026-04',
                  company_key: 'business:b1',
                  ca_eur: 10000,
                  rate_pct: 10,
                  charges_pct: 22,
                  commission_gross_eur: 1000,
                  charges_amount_eur: 220,
                  commission_net_eur: 780,
                },
              ],
              totals_by_month: { '2026-04': { commission_net_eur: 780, count: 1, ca_eur: 10000, commission_gross_eur: 1000, charges_amount_eur: 220 } },
            }),
            { status: 200 },
          )
        }
        return new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
      }),
    )

    render(
      <MemoryRouter initialEntries={['/internal/commissions']}>
        <Commissions />
      </MemoryRouter>,
    )

    await screen.findByText('2026-04')
    fireEvent.click(screen.getByRole('button', { name: 'Détails' }))
    expect(await screen.findByText('business:b1')).toBeInTheDocument()
    expect((await screen.findAllByText('780€')).length).toBeGreaterThan(0)
  })
})
