import { describe, expect, it, vi, afterEach } from 'vitest'
import { fireEvent, render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Sites from '@/pages/backoffice/Sites'
import { useAuthStore } from '@/store/authStore'

describe('Backoffice Sites', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    useAuthStore.getState().setToken(null)
    cleanup()
  })

  it('affiche les leads avec statut site', async () => {
    useAuthStore.getState().setToken('t')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: any) => {
        const url = String(input)
        if (url.includes('/api/v1/backoffice/b1/me')) return new Response(JSON.stringify({ role: 'staff' }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/settings')) return new Response(JSON.stringify({ config: { settings: {} } }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/sites')) {
          return new Response(
            JSON.stringify({
              items: [{ lead_id: 'l1', first_name: 'Alice', city: 'Paris', site_status: 'in_progress', portal_id: null, preview_enabled: 0 }],
            }),
            { status: 200 },
          )
        }
        return new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
      }),
    )

    render(
      <MemoryRouter initialEntries={['/backoffice/b1/sites']}>
        <Routes>
          <Route
            path="/backoffice/:businessId/sites"
            element={
              <Sites />
            }
          />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('Leads assignés et suivi de création')).toBeInTheDocument()
    expect(await screen.findByText('Alice')).toBeInTheDocument()
  })

  it('permet de générer un accès portail', async () => {
    useAuthStore.getState().setToken('t')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: any, init?: any) => {
        const url = String(input)
        if (url.includes('/api/v1/backoffice/b1/me')) return new Response(JSON.stringify({ role: 'staff' }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/settings')) return new Response(JSON.stringify({ config: { settings: {} } }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/sites')) {
          return new Response(
            JSON.stringify({
              items: [{ lead_id: 'l1', first_name: 'Alice', city: 'Paris', site_status: 'todo', portal_id: null, preview_enabled: 0 }],
            }),
            { status: 200 },
          )
        }
        if (url.includes('/api/v1/backoffice/b1/leads/l1/portal') && init?.method === 'POST') {
          return new Response(
            JSON.stringify({
              portal_id: 'p1',
              portal_url: '/portal/p1?t=tok',
              preview_url: '/portal/p1/preview?t=tok2',
              pin: '123456',
            }),
            { status: 200 },
          )
        }
        if (url.includes('/api/v1/backoffice/b1/leads/l1/site') && init?.method === 'PATCH') {
          return new Response(JSON.stringify({ lead_id: 'l1', site_status: 'todo' }), { status: 200 })
        }
        return new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
      }),
    )

    render(
      <MemoryRouter initialEntries={['/backoffice/b1/sites']}>
        <Routes>
          <Route path="/backoffice/:businessId/sites" element={<Sites />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('Alice')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Générer accès client' }))
    expect(await screen.findByText('123456')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Activer preview' }))
    expect((fetch as any).mock.calls.some((c: any[]) => String(c[0]).includes('/leads/l1/site') && c[1]?.method === 'PATCH')).toBe(true)
  })
})
