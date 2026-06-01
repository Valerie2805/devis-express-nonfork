import { describe, expect, it, vi, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useBusinessConfig } from './useBusinessConfig'

function Probe({ businessId }: { businessId: string }) {
  const { data, loading, error } = useBusinessConfig(businessId)
  if (loading) return <div>loading</div>
  if (error) return <div>error:{error}</div>
  return (
    <div>
      <div data-testid="h1">{String(data?.content?.site_copy?.hero?.h1 || '')}</div>
      <div data-testid="theme">{String(data?.config?.appearance?.theme_id || '')}</div>
    </div>
  )
}

function installLocalStorageMock() {
  const store = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', {
    value: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => void store.clear(),
    },
    configurable: true,
  })
}

describe('useBusinessConfig preview', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    window.localStorage.clear()
  })

  it('applique le patch localStorage en mode ?preview=1', async () => {
    installLocalStorageMock()
    const businessId = 'demo-business'
    window.localStorage.setItem(
      `site_preview:${businessId}`,
      JSON.stringify({
        updated_at: new Date().toISOString(),
        patch: {
          appearance: { theme_id: 'ocean' },
          site_copy_override: { hero: { h1: 'Override H1' } },
        },
      }),
    )

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            business_id: businessId,
            config: { appearance: { theme_id: 'ivory' } },
            content: { site_copy: { hero: { h1: 'Base H1' } } },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }),
    )

    render(
      <MemoryRouter initialEntries={[`/site/${businessId}?preview=1`]}>
        <Probe businessId={businessId} />
      </MemoryRouter>,
    )

    await act(async () => {
      await Promise.resolve()
    })

    expect(screen.getByTestId('h1').textContent).toBe('Override H1')
    expect(screen.getByTestId('theme').textContent).toBe('ocean')
  })
})
