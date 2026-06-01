import { describe, expect, it, vi, afterEach } from 'vitest'
import { fireEvent, render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import LeadDetail from '@/pages/backoffice/LeadDetail'
import { useAuthStore } from '@/store/authStore'

describe('Backoffice LeadDetail revenue', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    useAuthStore.getState().setToken(null)
    cleanup()
  })

  it('envoie outcome.amount_cents quand statut=won', async () => {
    useAuthStore.getState().setToken('t')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: any, init?: any) => {
        const url = String(input)
        if (url.includes('/api/v1/backoffice/b1/leads/l1') && (!init || !init.method || init.method === 'GET')) {
          return new Response(
            JSON.stringify({
              lead: { lead_id: 'l1', trade_id: 't1', status: 'won', stage: null, urgency: 'now', city: 'Paris', postal_code: '75000', first_name: 'A', phone_e164: '+331', outcome: null },
              messages: [],
            }),
            { status: 200 },
          )
        }
        if (url.includes('/api/v1/backoffice/b1/me')) return new Response(JSON.stringify({ role: 'owner' }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/settings')) return new Response(JSON.stringify({ config: { settings: { pipeline_stages: [] } } }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/leads/l1') && init?.method === 'PATCH') return new Response(JSON.stringify({ ok: true }), { status: 200 })
        if (url.includes('/api/v1/analytics/b1/events')) return new Response('', { status: 200 })
        return new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
      }),
    )

    render(
      <MemoryRouter initialEntries={['/backoffice/b1/leads/l1']}>
        <Routes>
          <Route path="/backoffice/:businessId/leads/:leadId" element={<LeadDetail />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('Statut')).toBeInTheDocument()
    const amount = await screen.findByLabelText('Montant gagné (EUR)')
    fireEvent.change(amount, { target: { value: '199' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await new Promise((r) => setTimeout(r, 0))

    const patchCall = (fetch as any).mock.calls.find((c: any[]) => String(c[0]).includes('/api/v1/backoffice/b1/leads/l1') && c[1]?.method === 'PATCH')
    expect(patchCall).toBeTruthy()
    const body = JSON.parse(patchCall[1].body)
    expect(body.status).toBe('won')
    expect(body.outcome.amount_cents).toBe(19900)
  })
})
