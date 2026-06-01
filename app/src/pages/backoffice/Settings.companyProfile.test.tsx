import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Settings from '@/pages/backoffice/Settings'
import { useAuthStore } from '@/store/authStore'

describe('Settings company profile', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    useAuthStore.getState().setToken(null)
    cleanup()
  })

  it('affiche la section entreprise', async () => {
    useAuthStore.getState().setToken('t')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: any) => {
        const url = String(input)
        if (url.includes('/api/v1/backoffice/b1/settings')) return new Response(JSON.stringify({ config: { settings: { onboarding: {} } } }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/proof')) return new Response(JSON.stringify({ reviews: [], photos: [] }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/me')) return new Response(JSON.stringify({ business_id: 'b1', role: 'owner', user_id: 'u1' }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/users')) return new Response(JSON.stringify({ users: [] }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/company_profile')) return new Response(JSON.stringify({ profile: { business_id: 'b1', headcount_range: null } }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/site_audits')) return new Response(JSON.stringify({ items: [] }), { status: 200 })
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

    expect(await screen.findByText('Entreprise')).toBeInTheDocument()
  })
})

