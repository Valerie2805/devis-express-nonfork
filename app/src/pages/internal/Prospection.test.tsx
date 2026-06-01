import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import Prospection from '@/pages/internal/Prospection'
import { useInternalAuthStore } from '@/store/internalAuthStore'
import { fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

describe('Prospection', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    useInternalAuthStore.getState().setToken(null)
    cleanup()
  })

  it('affiche la liste des prospects', async () => {
    useInternalAuthStore.getState().setToken('t')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ items: [{ prospect_id: 'p1', name: 'ACME', status: 'new', updated_at: 'x' }] }), { status: 200 })),
    )

    render(
      <MemoryRouter initialEntries={['/internal/prospection']}>
        <Prospection />
      </MemoryRouter>,
    )

    expect(await screen.findByText('ACME')).toBeInTheDocument()
  })

  it('permet de rechercher sur Google Places', async () => {
    useInternalAuthStore.getState().setToken('t')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: any, init?: any) => {
        const url = String(input)
        if (url.includes('/api/v1/internal/prospection/prospects')) {
          return new Response(JSON.stringify({ items: [] }), { status: 200 })
        }
        if (url.includes('/api/v1/internal/prospection/search_places')) {
          return new Response(
            JSON.stringify({
              results: [{ place_id: 'pid', name: 'ACME', address: 'Paris', lat: 1, lng: 2, rating: 4.7, reviews_count: 12 }],
            }),
            { status: 200 },
          )
        }
        return new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
      }),
    )

    render(
      <MemoryRouter initialEntries={['/internal/prospection']}>
        <Prospection />
      </MemoryRouter>,
    )
    fireEvent.change(await screen.findByLabelText('Recherche Places'), { target: { value: 'plombier paris' } })
    fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }))

    expect(await screen.findAllByText('ACME')).toHaveLength(1)
  })

  it('permet d’importer un résultat Places en prospect', async () => {
    useInternalAuthStore.getState().setToken('t')
    let listCalls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: any) => {
        const url = String(input)
        if (url.includes('/api/v1/internal/prospection/prospects')) {
          listCalls++
          if (listCalls === 1) return new Response(JSON.stringify({ items: [] }), { status: 200 })
          return new Response(JSON.stringify({ items: [{ prospect_id: 'gp_pid', name: 'ACME', status: 'new', updated_at: 'x' }] }), { status: 200 })
        }
        if (url.includes('/api/v1/internal/prospection/search_places')) {
          return new Response(
            JSON.stringify({ results: [{ place_id: 'pid', name: 'ACME', address: 'Paris', lat: 1, lng: 2, rating: 4.7, reviews_count: 12 }] }),
            { status: 200 },
          )
        }
        if (url.includes('/api/v1/internal/prospection/import_places')) {
          return new Response(JSON.stringify({ imported: 1 }), { status: 200 })
        }
        return new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
      }),
    )

    render(
      <MemoryRouter initialEntries={['/internal/prospection']}>
        <Prospection />
      </MemoryRouter>,
    )
    fireEvent.change(await screen.findByLabelText('Recherche Places'), { target: { value: 'plombier paris' } })
    fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }))
    await screen.findByText('ACME')

    fireEvent.click(screen.getByLabelText('Sélectionner pid'))
    fireEvent.click(screen.getByRole('button', { name: 'Importer' }))

    expect(await screen.findByText('gp_pid · new')).toBeInTheDocument()
  })

  it('permet d’envoyer un email à un prospect', async () => {
    useInternalAuthStore.getState().setToken('t')
    let step = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: any) => {
        const url = String(input)
        if (url.includes('/api/v1/internal/prospection/prospects')) {
          step++
          return new Response(
            JSON.stringify({ items: [{ prospect_id: 'gp_pid', name: 'ACME', status: 'new', updated_at: 'x' }] }),
            { status: 200 },
          )
        }
        if (url.includes('/api/v1/internal/prospection/prospects/gp_pid/send')) {
          return new Response(JSON.stringify({ provider_message_id: 'email_123' }), { status: 200 })
        }
        return new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
      }),
    )

    render(
      <MemoryRouter initialEntries={['/internal/prospection']}>
        <Prospection />
      </MemoryRouter>,
    )
    await screen.findByText('ACME')
    fireEvent.click(screen.getByRole('button', { name: 'Email' }))
    fireEvent.change(screen.getByLabelText('To'), { target: { value: 'to@example.com' } })
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Hi' } })
    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'Hello' } })
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }))
    expect(await screen.findByText('Envoyé')).toBeInTheDocument()
  })
})
