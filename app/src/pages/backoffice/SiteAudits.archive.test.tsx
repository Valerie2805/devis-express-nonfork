import { describe, expect, it, vi, afterEach } from 'vitest'
import { fireEvent, render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import SiteAudits from '@/pages/backoffice/SiteAudits'
import { useAuthStore } from '@/store/authStore'

describe('Backoffice SiteAudits archive', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    useAuthStore.getState().setToken(null)
    cleanup()
  })

  it('archive un audit depuis la liste', async () => {
    useAuthStore.getState().setToken('t')
    vi.stubGlobal('confirm', vi.fn(() => true))
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: any, init?: any) => {
        const url = String(input)
        if (url.includes('/api/v1/backoffice/b1/me')) return new Response(JSON.stringify({ role: 'owner' }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/settings')) return new Response(JSON.stringify({ config: { settings: {} } }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/site_audits') && (!init || !init.method || init.method === 'GET'))
          return new Response(
            JSON.stringify({ items: [{ audit_id: 'a1', source_url: 'https://exemple.fr', status: 'done', error: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }] }),
            { status: 200 },
          )
        if (url.includes('/api/v1/backoffice/b1/site_audits/a1/archive') && init?.method === 'POST') return new Response(JSON.stringify({ success: true }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/site_audits') && init?.method === 'POST')
          return new Response(JSON.stringify({ audit_id: 'a2', public_url: '/audit/a2?t=x', docx_url: '/docx', pdf_url: '/pdf' }), { status: 201 })
        return new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
      }),
    )

    render(
      <MemoryRouter initialEntries={['/backoffice/b1/site-audits']}>
        <Routes>
          <Route path="/backoffice/:businessId/site-audits" element={<SiteAudits />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('https://exemple.fr')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Archiver' }))
    expect((fetch as any).mock.calls.some((c: any[]) => String(c[0]).includes('/site_audits/a1/archive') && c[1]?.method === 'POST')).toBe(true)
  })
})
