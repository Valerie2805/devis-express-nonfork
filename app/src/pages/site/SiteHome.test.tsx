import { describe, expect, it, vi, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import SiteHome from '@/pages/site/SiteHome'

describe('SiteHome', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('affiche une erreur si la config site ne répond pas', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn((_input: RequestInfo, init?: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          )
        })
      }),
    )

    render(
      <MemoryRouter initialEntries={['/site/demo-business']}>
        <Routes>
          <Route path="/site/:businessId" element={<SiteHome />} />
        </Routes>
      </MemoryRouter>,
    )

    await act(async () => {
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(15000)
    })

    expect(screen.getByText('Délai dépassé')).toBeInTheDocument()
  })
})
