import { describe, expect, it, vi, afterEach } from 'vitest'
import { fireEvent, render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Settings from '@/pages/backoffice/Settings'
import { useAuthStore } from '@/store/authStore'

describe('Backoffice Settings change password', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    useAuthStore.getState().setToken(null)
    cleanup()
  })

  it('permet de changer le mot de passe', async () => {
    useAuthStore.getState().setToken('t')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: any, init?: any) => {
        const url = String(input)
        if (url.includes('/api/v1/backoffice/b1/settings') && (!init || !init.method || init.method === 'GET')) {
          return new Response(JSON.stringify({ config: { settings: {} } }), { status: 200 })
        }
        if (url.includes('/api/v1/backoffice/b1/proof')) return new Response(JSON.stringify({ reviews: [], photos: [] }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/me')) return new Response(JSON.stringify({ business_id: 'b1', role: 'staff', user_id: 'u1' }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/company_profile')) return new Response(JSON.stringify({ profile: { business_id: 'b1' } }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/me/password') && init?.method === 'POST') return new Response('', { status: 204 })
        return new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
      }),
    )

    render(
      <MemoryRouter initialEntries={['/backoffice/b1/settings']}>
        <Routes>
          <Route path="/backoffice/:businessId/settings" element={<Settings />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'Réglages' })).toBeInTheDocument()
    expect(await screen.findByText('Changer mon mot de passe')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Mot de passe actuel'), { target: { value: 'oldpass' } })
    fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), { target: { value: 'newpass123' } })
    fireEvent.change(screen.getByLabelText('Confirmer le nouveau mot de passe'), { target: { value: 'newpass123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Changer le mot de passe' }))
    expect((fetch as any).mock.calls.some((c: any[]) => String(c[0]).includes('/me/password') && c[1]?.method === 'POST')).toBe(true)
  })
})
