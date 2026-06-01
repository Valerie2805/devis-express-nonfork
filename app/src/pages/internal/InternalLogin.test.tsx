import { describe, expect, it, vi, afterEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import InternalLogin from '@/pages/internal/InternalLogin'

describe('InternalLogin', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    try {
      window.localStorage.removeItem('mad_internal_token_v1')
    } catch {}
  })

  it('connecte et navigue vers la prospection', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(JSON.stringify({ token: 't' }), { status: 200 })
      }),
    )

    render(
      <MemoryRouter initialEntries={['/internal/login']}>
        <Routes>
          <Route path="/internal/login" element={<InternalLogin />} />
          <Route path="/internal/prospection" element={<div>Prospection</div>} />
        </Routes>
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'admin@example.com' } })
    fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: 'pw' } })
    fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }))

    expect(await screen.findByText('Prospection')).toBeInTheDocument()
  })
})
