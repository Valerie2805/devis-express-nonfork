import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import Commissions from '@/pages/internal/Commissions'
import { useInternalAuthStore } from '@/store/internalAuthStore'
import { MemoryRouter } from 'react-router-dom'

describe('Commissions', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    useInternalAuthStore.getState().setToken(null)
    cleanup()
  })

  it('calcule et affiche le net après enregistrement', async () => {
    useInternalAuthStore.getState().setToken('t')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: any, init?: any) => {
        const url = String(input)
        if (url.includes('/api/v1/internal/companies')) {
          return new Response(JSON.stringify({ items: [] }), { status: 200 })
        }
        if (url.includes('/api/v1/internal/commissions') && (!init || init.method === 'GET')) {
          return new Response(JSON.stringify({ items: [], totals_by_month: {} }), { status: 200 })
        }
        if (url.includes('/api/v1/internal/commissions') && init?.method === 'POST') {
          return new Response(
            JSON.stringify({
              entry: {
                entry_id: 'e1',
                month: '2026-04',
                ca_eur: 10000,
                rate_pct: 10,
                charges_pct: 22,
                commission_gross_eur: 1000,
                charges_amount_eur: 220,
                commission_net_eur: 780,
              },
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
    await screen.findByLabelText('Mois (YYYY-MM)')

    fireEvent.change(screen.getByLabelText('Mois (YYYY-MM)'), { target: { value: '2026-04' } })
    fireEvent.change(screen.getByLabelText('CA (€)'), { target: { value: '10000' } })
    fireEvent.change(screen.getByLabelText('Taux (%)'), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText('Charges (%)'), { target: { value: '22' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByText('Net : 780€')).toBeInTheDocument()
  })
})
