import { describe, expect, it, vi, afterEach } from 'vitest'
import { fireEvent, render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Portal from '@/pages/portal/Portal'

function installLocalStorageMock() {
  const store = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', {
    value: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => void store.clear(),
    },
    configurable: true,
  })
}

describe('Portal client', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    window.localStorage.clear()
    cleanup()
  })

  it('déverrouille avec PIN puis affiche le statut', async () => {
    installLocalStorageMock()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: any, init?: any) => {
        const url = String(input)
        if (url.includes('/api/v1/public/portal/p1?t=tok_portal') && (!init || !init.method || init.method === 'GET')) {
          return new Response(JSON.stringify({ portal_id: 'p1', preview_enabled: false }), { status: 200 })
        }
        if (url.includes('/api/v1/public/portal/p1/unlock?t=tok_portal') && init?.method === 'POST') {
          return new Response(JSON.stringify({ session_token: 'sess1', preview_enabled: false }), { status: 200 })
        }
        if (url.includes('/api/v1/public/portal/p1/home?t=tok_portal&s=sess1')) {
          return new Response(
            JSON.stringify({
              portal_id: 'p1',
              business_id: 'b1',
              lead_id: 'l1',
              site: { site_status: 'in_progress', site_started_at: null, site_delivered_at: null },
              preview_enabled: false,
              preview_token: null,
              checklist: [{ item_key: 'content', done: 1, updated_at: 'x' }],
              messages: [{ direction: 'client', author_label: 'Client', text: 'Bonjour', created_at: 'x' }],
            }),
            { status: 200 },
          )
        }
        return new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
      }),
    )

    render(
      <MemoryRouter initialEntries={['/portal/p1?t=tok_portal']}>
        <Routes>
          <Route path="/portal/:portalId" element={<Portal />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('Portail client')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Code PIN'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Accéder' }))
    expect(await screen.findByText('Statut : in_progress')).toBeInTheDocument()
    expect(await screen.findByText('Checklist')).toBeInTheDocument()
    expect(await screen.findByText('Bonjour')).toBeInTheDocument()
  })
})
