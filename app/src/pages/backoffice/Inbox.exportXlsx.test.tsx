import { describe, expect, it, vi, afterEach } from 'vitest'
import { fireEvent, render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Inbox from '@/pages/backoffice/Inbox'
import { useAuthStore } from '@/store/authStore'

describe('Backoffice Inbox export xlsx', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    useAuthStore.getState().setToken(null)
    cleanup()
  })

  it('propose un export Excel et appelle l’endpoint .xlsx', async () => {
    useAuthStore.getState().setToken('t')
    ;(globalThis.URL as any).createObjectURL = vi.fn(() => 'blob:1')
    ;(globalThis.URL as any).revokeObjectURL = vi.fn()
    ;(HTMLAnchorElement.prototype as any).click = vi.fn()

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: any) => {
        const url = String(input)
        if (url.includes('/api/v1/backoffice/b1/leads?')) return new Response(JSON.stringify({ items: [], total: 0 }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/me')) return new Response(JSON.stringify({ role: 'owner' }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/settings')) return new Response(JSON.stringify({ config: { settings: {} } }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/leads/export.xlsx')) return new Response(new Uint8Array([1, 2, 3]), { status: 200 })
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

    const btn = await screen.findByRole('button', { name: 'Exporter Excel' })
    fireEvent.click(btn)
    expect((fetch as any).mock.calls.some((c: any[]) => String(c[0]).includes('/leads/export.xlsx'))).toBe(true)
  })

  it('affiche une erreur si l’export Excel échoue', async () => {
    useAuthStore.getState().setToken('t')
    ;(globalThis.URL as any).createObjectURL = vi.fn(() => 'blob:1')
    ;(globalThis.URL as any).revokeObjectURL = vi.fn()
    ;(HTMLAnchorElement.prototype as any).click = vi.fn()

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: any) => {
        const url = String(input)
        if (url.includes('/api/v1/backoffice/b1/leads?')) return new Response(JSON.stringify({ items: [], total: 0 }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/me')) return new Response(JSON.stringify({ role: 'owner' }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/settings')) return new Response(JSON.stringify({ config: { settings: {} } }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/leads/export.xlsx')) return new Response('Forbidden', { status: 403 })
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

    const btn = await screen.findByRole('button', { name: 'Exporter Excel' })
    fireEvent.click(btn)
    expect(await screen.findByText('Forbidden')).toBeInTheDocument()
  })
})
