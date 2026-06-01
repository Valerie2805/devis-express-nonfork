import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import Companies from '@/pages/internal/Companies'
import { useInternalAuthStore } from '@/store/internalAuthStore'
import { MemoryRouter } from 'react-router-dom'

describe('Companies type filter', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    useInternalAuthStore.getState().setToken(null)
    cleanup()
  })

  it('appelle l’API avec type=prospect', async () => {
    useInternalAuthStore.getState().setToken('t')
    const fetchMock = vi.fn(async (input: any) => {
      const url = String(input)
      if (!url.includes('/api/v1/internal/companies')) return new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
      return new Response(JSON.stringify({ items: [] }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter initialEntries={['/internal/companies?type=prospect']}>
        <Companies />
      </MemoryRouter>,
    )

    await screen.findByText('Aucun résultat')
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/api/v1/internal/companies?type=prospect'))).toBe(true)
  })

  it('change le filtre Type', async () => {
    useInternalAuthStore.getState().setToken('t')
    const fetchMock = vi.fn(async (input: any) => {
      const url = String(input)
      if (!url.includes('/api/v1/internal/companies')) return new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
      return new Response(JSON.stringify({ items: [] }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter initialEntries={['/internal/companies']}>
        <Companies />
      </MemoryRouter>,
    )
    await screen.findByText('Aucun résultat')
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'prospect' } })
    await waitFor(() => {
      expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/api/v1/internal/companies?type=prospect'))).toBe(true)
    })
  })
})
