import { describe, expect, it, vi, afterEach } from 'vitest'
import { fireEvent, render, screen, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import LeadDetail from '@/pages/backoffice/LeadDetail'
import { useAuthStore } from '@/store/authStore'

describe('Backoffice LeadDetail portal messages', () => {
  afterEach(() => {
    useAuthStore.getState().setToken(null)
    cleanup()
    vi.unstubAllGlobals()
  })

  it('affiche les messages du portail et permet de répondre', async () => {
    useAuthStore.getState().setToken('t')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: any, init?: any) => {
        const url = String(input)
        if (url.includes('/api/v1/backoffice/b1/leads/l1/portal/messages') && (!init || !init.method || init.method === 'GET')) {
          return new Response(JSON.stringify({ portal_id: 'p1', messages: [{ direction: 'client', author_label: 'Client', text: 'Bonjour', created_at: '2026-04-01T10:00:00.000Z' }] }), {
            status: 200,
          })
        }
        if (url.includes('/api/v1/backoffice/b1/leads/l1/portal/messages') && init?.method === 'POST') {
          return new Response(JSON.stringify({ success: true }), { status: 200 })
        }
        if (url.includes('/api/v1/backoffice/b1/leads/l1') && (!init || !init.method || init.method === 'GET')) {
          return new Response(
            JSON.stringify({
              lead: { lead_id: 'l1', trade_id: 't1', status: 'new', stage: null, urgency: 'now', city: 'Paris', postal_code: '75000', first_name: 'A', phone_e164: '+331', outcome: null },
              messages: [],
            }),
            { status: 200 },
          )
        }
        if (url.includes('/api/v1/backoffice/b1/me')) return new Response(JSON.stringify({ role: 'staff' }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/settings')) return new Response(JSON.stringify({ config: { settings: { pipeline_stages: [] } } }), { status: 200 })
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

    expect(await screen.findByText('Portail client')).toBeInTheDocument()
    expect(await screen.findByText('Bonjour')).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('Réponse à envoyer au client'), { target: { value: 'Ok' } })
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer au client' }))
    await waitFor(() => {
      const calls = (fetch as any).mock.calls as any[]
      expect(calls.some((c) => String(c[0]).includes('/portal/messages') && c[1]?.method === 'POST')).toBe(true)
      expect(calls.filter((c) => String(c[0]).includes('/portal/messages') && (!c[1] || !c[1].method || c[1].method === 'GET')).length).toBeGreaterThanOrEqual(2)
    })
  })
})
