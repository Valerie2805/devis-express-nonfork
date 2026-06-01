import { describe, expect, it, vi, afterEach } from 'vitest'
import { fireEvent, render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Inbox from '@/pages/backoffice/Inbox'
import { useAuthStore } from '@/store/authStore'

describe('Backoffice Inbox', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    useAuthStore.getState().setToken(null)
    cleanup()
  })

  it('affiche les actions appel/WhatsApp si disponibles', async () => {
    useAuthStore.getState().setToken('t')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: any) => {
        const url = String(input)
        if (url.includes('/api/v1/backoffice/b1/leads')) {
          return new Response(
            JSON.stringify({
              items: [
                {
                  lead_id: 'l1',
                  created_at: 'x',
                  status: 'new',
                  stage: null,
                  assignee_user_id: null,
                  trade_id: 't1',
                  request_type: 'foo',
                  urgency: 'now',
                  city: 'Paris',
                  channel_preference: 'call',
                  phone_valid: true,
                  sms_opt_in: false,
                  whatsapp_opt_in: true,
                  tags: [],
                  score: 1,
                  decision: 'needs_followup',
                  first_name: 'Alice',
                  phone_e164: '+33123456789',
                },
              ],
              total: 1,
            }),
            { status: 200 },
          )
        }
        if (url.includes('/api/v1/backoffice/b1/me')) return new Response(JSON.stringify({ role: 'owner' }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/settings')) return new Response(JSON.stringify({ config: { settings: {} } }), { status: 200 })
        if (url.includes('/api/v1/analytics/b1/events')) return new Response('', { status: 200 })
        return new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
      }),
    )

    render(
      <MemoryRouter initialEntries={['/backoffice/b1']}>
        <Routes>
          <Route path="/backoffice/:businessId" element={<Inbox />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('Paris')).toBeInTheDocument()
    const call = screen.getByRole('link', { name: 'Appeler' })
    expect(call.getAttribute('href')).toContain('tel:+33123456789')
    const wa = screen.getByRole('link', { name: 'WhatsApp' })
    expect(wa.getAttribute('href')).toContain('https://wa.me/33123456789')

    wa.addEventListener('click', (e) => e.preventDefault())
    fireEvent.click(wa)
    expect((fetch as any).mock.calls.some((c: any[]) => String(c[0]).includes('/api/v1/analytics/b1/events'))).toBe(true)
  })
})
