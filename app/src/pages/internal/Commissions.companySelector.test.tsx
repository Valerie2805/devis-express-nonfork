import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import Commissions from '@/pages/internal/Commissions'
import { useInternalAuthStore } from '@/store/internalAuthStore'
import { MemoryRouter } from 'react-router-dom'

describe('Commissions company selector', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    useInternalAuthStore.getState().setToken(null)
    cleanup()
  })

  it('propose une liste de company_key (datalist)', async () => {
    useInternalAuthStore.getState().setToken('t')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: any, init?: any) => {
        const url = String(input)
        if (url.includes('/api/v1/internal/commissions') && String(init?.method || 'GET') === 'GET') {
          return new Response(JSON.stringify({ items: [], totals_by_month: {} }), { status: 200 })
        }
        if (url.includes('/api/v1/internal/companies')) {
          return new Response(JSON.stringify({ items: [{ company_key: 'business:b1', name: 'ACME', type: 'business' }] }), { status: 200 })
        }
        return new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
      }),
    )

    render(
      <MemoryRouter initialEntries={['/internal/commissions']}>
        <Commissions />
      </MemoryRouter>,
    )

    const input = await screen.findByLabelText('Company key (optionnel)')
    expect(input).toHaveAttribute('list', 'company-keys')
    await waitFor(() => {
      const opt = document.querySelector('datalist#company-keys option[value="business:b1"]')
      expect(opt).toBeTruthy()
    })
  })
})
