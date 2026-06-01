import { describe, expect, it, vi, afterEach } from 'vitest'
import { fireEvent, render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Prospection from '@/pages/backoffice/Prospection'
import SiteAudits from '@/pages/backoffice/SiteAudits'
import { useAuthStore } from '@/store/authStore'

describe('Backoffice Prospection', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    useAuthStore.getState().setToken(null)
    cleanup()
  })

  it('permet de chercher sur Google Places', async () => {
    useAuthStore.getState().setToken('t')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: any, init?: any) => {
        const url = String(input)
        if (url.includes('/api/v1/backoffice/b1/me')) return new Response(JSON.stringify({ role: 'owner' }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/settings')) return new Response(JSON.stringify({ config: { settings: {} } }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/prospection/sequences')) return new Response(JSON.stringify({ items: [] }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/prospection/prospects')) return new Response(JSON.stringify({ items: [], total: 0 }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/prospection/stats')) return new Response(JSON.stringify({ total: 0, series: [] }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/prospection/search_places') && init?.method === 'POST')
          return new Response(JSON.stringify({ results: [{ place_id: 'p1', name: 'X', address: 'A', lat: null, lng: null, rating: null, reviews_count: null }] }), { status: 200 })
        return new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
      }),
    )

    render(
      <MemoryRouter initialEntries={['/backoffice/b1/prospection']}>
        <Routes>
          <Route path="/backoffice/:businessId/prospection" element={<Prospection />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('Prospection')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Métier'), { target: { value: 'electricien' } })
    fireEvent.change(screen.getByLabelText('Ville'), { target: { value: 'orléans' } })
    fireEvent.change(screen.getByLabelText('Département'), { target: { value: '45' } })
    fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }))
    const call = (fetch as any).mock.calls.find((c: any[]) => String(c[0]).includes('/prospection/search_places'))
    expect(call).toBeTruthy()
    expect(JSON.parse(call[1].body).query).toBe('electricien orléans 45')
    expect(await screen.findByText('X')).toBeInTheDocument()
  })

  it('ouvre Audit IA en cliquant sur un site web', async () => {
    useAuthStore.getState().setToken('t')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: any, init?: any) => {
        const url = String(input)
        if (url.includes('/api/v1/backoffice/b1/me')) return new Response(JSON.stringify({ role: 'owner' }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/settings')) return new Response(JSON.stringify({ config: { settings: {} } }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/prospection/sequences')) return new Response(JSON.stringify({ items: [] }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/prospection/prospects'))
          return new Response(
            JSON.stringify({
              items: [{ prospect_id: 'p1', name: 'Elec 45', city: 'Orléans', website: 'https://elec45.example', status: 'new' }],
              total: 1,
            }),
            { status: 200 },
          )
        if (url.includes('/api/v1/backoffice/b1/prospection/stats')) return new Response(JSON.stringify({ total: 1, series: [] }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/site_audits') && (!init || !init.method || init.method === 'GET'))
          return new Response(JSON.stringify({ items: [] }), { status: 200 })
        return new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
      }),
    )

    render(
      <MemoryRouter initialEntries={['/backoffice/b1/prospection']}>
        <Routes>
          <Route path="/backoffice/:businessId/prospection" element={<Prospection />} />
          <Route path="/backoffice/:businessId/site-audits" element={<SiteAudits />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('Elec 45')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'https://elec45.example' }))
    expect(await screen.findByText('Audit IA')).toBeInTheDocument()
    expect((screen.getByPlaceholderText('https://exemple.fr') as HTMLInputElement).value).toBe('https://elec45.example')
  })

  it('affiche un diagnostic quand Google Places refuse la clé (empty referer)', async () => {
    useAuthStore.getState().setToken('t')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: any, init?: any) => {
        const url = String(input)
        if (url.includes('/api/v1/backoffice/b1/me')) return new Response(JSON.stringify({ role: 'owner' }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/settings')) return new Response(JSON.stringify({ config: { settings: {} } }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/prospection/sequences')) return new Response(JSON.stringify({ items: [] }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/prospection/prospects')) return new Response(JSON.stringify({ items: [], total: 0 }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/prospection/stats')) return new Response(JSON.stringify({ total: 0, series: [] }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/prospection/search_places') && init?.method === 'POST')
          return new Response(
            JSON.stringify({
              error: 'This IP, site or mobile application is not authorized to use this API key. Request received from IP address 1.2.3.4, with empty referer',
            }),
            { status: 403 },
          )
        return new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
      }),
    )

    render(
      <MemoryRouter initialEntries={['/backoffice/b1/prospection']}>
        <Routes>
          <Route path="/backoffice/:businessId/prospection" element={<Prospection />} />
        </Routes>
      </MemoryRouter>,
    )

    fireEvent.change(await screen.findByLabelText('Métier'), { target: { value: 'electricien' } })
    fireEvent.change(screen.getByLabelText('Ville'), { target: { value: 'orléans' } })
    fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }))
    expect(await screen.findByText('Diagnostic')).toBeInTheDocument()
    expect(await screen.findByText(/Google Cloud/i)).toBeInTheDocument()
  })

  it('permet d’archiver un prospect', async () => {
    useAuthStore.getState().setToken('t')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: any, init?: any) => {
        const url = String(input)
        if (url.includes('/api/v1/backoffice/b1/me')) return new Response(JSON.stringify({ role: 'owner' }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/settings')) return new Response(JSON.stringify({ config: { settings: {} } }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/prospection/sequences')) return new Response(JSON.stringify({ items: [] }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/prospection/prospects') && (!init || !init.method || init.method === 'GET'))
          return new Response(
            JSON.stringify({
              items: [{ prospect_id: 'p1', name: 'Elec 45', city: 'Orléans', website: 'https://elec45.example', status: 'new' }],
              total: 1,
            }),
            { status: 200 },
          )
        if (url.includes('/api/v1/backoffice/b1/prospection/stats')) return new Response(JSON.stringify({ total: 1, series: [] }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/prospection/prospects/p1') && init?.method === 'PATCH') return new Response(JSON.stringify({ success: true }), { status: 200 })
        return new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
      }),
    )

    render(
      <MemoryRouter initialEntries={['/backoffice/b1/prospection']}>
        <Routes>
          <Route path="/backoffice/:businessId/prospection" element={<Prospection />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('Elec 45')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Archiver' }))
    expect((fetch as any).mock.calls.some((c: any[]) => String(c[0]).includes('/prospection/prospects/p1') && c[1]?.method === 'PATCH')).toBe(true)
  })

  it('permet d’importer les avis existants en bulk', async () => {
    useAuthStore.getState().setToken('t')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: any, init?: any) => {
        const url = String(input)
        if (url.includes('/api/v1/backoffice/b1/me')) return new Response(JSON.stringify({ role: 'owner' }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/settings')) return new Response(JSON.stringify({ config: { settings: {} } }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/prospection/sequences')) return new Response(JSON.stringify({ items: [] }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/prospection/prospects')) return new Response(JSON.stringify({ items: [], total: 0 }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/prospection/stats')) return new Response(JSON.stringify({ total: 0, series: [] }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/prospection/import_reviews') && init?.method === 'POST') return new Response(JSON.stringify({ inserted: 2, processed: 1 }), { status: 200 })
        return new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
      }),
    )

    render(
      <MemoryRouter initialEntries={['/backoffice/b1/prospection']}>
        <Routes>
          <Route path="/backoffice/:businessId/prospection" element={<Prospection />} />
        </Routes>
      </MemoryRouter>,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Importer les avis existants' }))
    expect((fetch as any).mock.calls.some((c: any[]) => String(c[0]).includes('/prospection/import_reviews') && c[1]?.method === 'POST')).toBe(true)
    expect(await screen.findByText('Avis importés : 2')).toBeInTheDocument()
  })

  it('permet d’afficher les prospects archivés', async () => {
    useAuthStore.getState().setToken('t')
    const calls: any[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: any, init?: any) => {
        calls.push([input, init])
        const url = String(input)
        if (url.includes('/api/v1/backoffice/b1/me')) return new Response(JSON.stringify({ role: 'owner' }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/settings')) return new Response(JSON.stringify({ config: { settings: {} } }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/prospection/sequences')) return new Response(JSON.stringify({ items: [] }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/prospection/stats')) return new Response(JSON.stringify({ total: 0, series: [] }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/prospection/prospects')) return new Response(JSON.stringify({ items: [], total: 0 }), { status: 200 })
        return new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
      }),
    )

    render(
      <MemoryRouter initialEntries={['/backoffice/b1/prospection']}>
        <Routes>
          <Route path="/backoffice/:businessId/prospection" element={<Prospection />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('Prospects')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Afficher archivés' }))
    expect(calls.some((c) => String(c[0]).includes('include_archived=1'))).toBe(true)
  })

  it('archive tous les prospects filtrés', async () => {
    useAuthStore.getState().setToken('t')
    vi.stubGlobal('confirm', vi.fn(() => true))
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: any, init?: any) => {
        const url = String(input)
        if (url.includes('/api/v1/backoffice/b1/me')) return new Response(JSON.stringify({ role: 'owner' }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/settings')) return new Response(JSON.stringify({ config: { settings: {} } }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/prospection/sequences')) return new Response(JSON.stringify({ items: [] }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/prospection/stats')) return new Response(JSON.stringify({ total: 0, series: [] }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/prospection/prospects') && (!init || !init.method || init.method === 'GET'))
          return new Response(JSON.stringify({ items: [{ prospect_id: 'p1', name: 'X', city: null, website: null, status: 'new' }], total: 1 }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/prospection/prospects/archive_bulk') && init?.method === 'POST')
          return new Response(JSON.stringify({ success: true, archived: 1 }), { status: 200 })
        return new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
      }),
    )

    render(
      <MemoryRouter initialEntries={['/backoffice/b1/prospection']}>
        <Routes>
          <Route path="/backoffice/:businessId/prospection" element={<Prospection />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('X')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Archiver tous les prospects filtrés' }))
    expect((fetch as any).mock.calls.some((c: any[]) => String(c[0]).includes('/archive_bulk') && c[1]?.method === 'POST')).toBe(true)
  })

  it('affiche les avis en inline quand on clique Voir avis', async () => {
    useAuthStore.getState().setToken('t')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: any, init?: any) => {
        const url = String(input)
        if (url.includes('/api/v1/backoffice/b1/me')) return new Response(JSON.stringify({ role: 'owner' }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/settings')) return new Response(JSON.stringify({ config: { settings: {} } }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/prospection/sequences')) return new Response(JSON.stringify({ items: [] }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/prospection/stats')) return new Response(JSON.stringify({ total: 0, series: [] }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/prospection/prospects/p1/reviews'))
          return new Response(
            JSON.stringify({ items: [{ author_name: 'Alice', rating: 5, text: 'Super', created_at: '2024-01-01T00:00:00.000Z' }] }),
            { status: 200 },
          )
        if (url.includes('/api/v1/backoffice/b1/prospection/prospects'))
          return new Response(JSON.stringify({ items: [{ prospect_id: 'p1', name: 'X', city: null, website: null, status: 'new' }], total: 1 }), { status: 200 })
        return new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
      }),
    )

    render(
      <MemoryRouter initialEntries={['/backoffice/b1/prospection']}>
        <Routes>
          <Route path="/backoffice/:businessId/prospection" element={<Prospection />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('X')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Voir avis' }))
    expect(await screen.findByText('Alice')).toBeInTheDocument()
    expect(await screen.findByText(/5\/5/)).toBeInTheDocument()
  })

  it('permet d’approuver et envoyer une task prospection', async () => {
    useAuthStore.getState().setToken('t')
    vi.stubGlobal('confirm', vi.fn(() => true))
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: any, init?: any) => {
        const url = String(input)
        if (url.includes('/api/v1/backoffice/b1/me')) return new Response(JSON.stringify({ role: 'owner' }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/settings')) return new Response(JSON.stringify({ config: { settings: {} } }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/prospection/sequences')) return new Response(JSON.stringify({ items: [] }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/prospection/stats')) return new Response(JSON.stringify({ total: 0, series: [] }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/prospection/prospects')) return new Response(JSON.stringify({ items: [], total: 0 }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/prospection/tasks') && (!init || !init.method || init.method === 'GET'))
          return new Response(
            JSON.stringify({
              items: [
                {
                  task_id: 't1',
                  prospect_id: 'p1',
                  kind: 'outreach',
                  run_at: new Date().toISOString(),
                  status: 'pending_review',
                  last_error: null,
                  attempts: 0,
                  sequence_id: null,
                  step_id: null,
                  approved_channel: null,
                  approved_at: null,
                  payload: { templates: { sms: { text: 'Salut' }, email: { subject: 'Hi', text: 'Body' } } },
                  prospect: { name: 'Prospect', phone: null, emails: [], website: null, city: null },
                },
              ],
            }),
            { status: 200 },
          )
        if (url.includes('/api/v1/backoffice/b1/prospection/tasks/t1/approve') && init?.method === 'POST')
          return new Response(JSON.stringify({ success: true }), { status: 200 })
        return new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
      }),
    )

    render(
      <MemoryRouter initialEntries={['/backoffice/b1/prospection']}>
        <Routes>
          <Route path="/backoffice/:businessId/prospection" element={<Prospection />} />
        </Routes>
      </MemoryRouter>,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Rafraîchir' }))
    expect(await screen.findByText('Prospect')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }))
    const call = (fetch as any).mock.calls.find((c: any[]) => String(c[0]).includes('/tasks/t1/approve'))
    expect(call).toBeTruthy()
    expect(JSON.parse(call[1].body).channel).toBe('sms')
    expect(JSON.parse(call[1].body).send).toBe(true)
  })

  it('permet d’envoyer une séquence depuis une task', async () => {
    useAuthStore.getState().setToken('t')
    vi.stubGlobal('confirm', vi.fn(() => true))
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: any, init?: any) => {
        const url = String(input)
        if (url.includes('/api/v1/backoffice/b1/me')) return new Response(JSON.stringify({ role: 'owner' }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/settings')) return new Response(JSON.stringify({ config: { settings: {} } }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/prospection/sequences')) return new Response(JSON.stringify({ items: [] }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/prospection/stats')) return new Response(JSON.stringify({ total: 0, series: [] }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/prospection/prospects')) return new Response(JSON.stringify({ items: [], total: 0 }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/prospection/tasks') && (!init || !init.method || init.method === 'GET'))
          return new Response(
            JSON.stringify({
              items: [
                {
                  task_id: 't1',
                  prospect_id: 'p1',
                  kind: 'outreach',
                  run_at: new Date().toISOString(),
                  status: 'pending_review',
                  last_error: null,
                  attempts: 0,
                  sequence_id: 's1',
                  step_id: 'step_1',
                  approved_channel: null,
                  approved_at: null,
                  payload: { templates: { sms: { text: 'Salut' }, email: { subject: 'Hi', text: 'Body' } } },
                  prospect: { name: 'Prospect', phone: null, emails: [], website: null, city: null },
                },
              ],
            }),
            { status: 200 },
          )
        if (url.includes('/api/v1/backoffice/b1/prospection/sequences/s1/approve') && init?.method === 'POST')
          return new Response(JSON.stringify({ success: true }), { status: 200 })
        return new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
      }),
    )

    render(
      <MemoryRouter initialEntries={['/backoffice/b1/prospection']}>
        <Routes>
          <Route path="/backoffice/:businessId/prospection" element={<Prospection />} />
        </Routes>
      </MemoryRouter>,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Rafraîchir' }))
    expect(await screen.findByText('Séquence : s1')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer séq.' }))
    const call = (fetch as any).mock.calls.find((c: any[]) => String(c[0]).includes('/sequences/s1/approve'))
    expect(call).toBeTruthy()
    expect(JSON.parse(call[1].body).channel).toBe('sms')
    expect(JSON.parse(call[1].body).send).toBe(true)
  })
})
