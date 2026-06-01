import { describe, expect, it, vi, afterEach } from 'vitest'
import { fireEvent, render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import SiteShell from './SiteShell'

describe('SiteShell tracking', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    cleanup()
  })

  it('track open_quote_form sur le CTA Devis du footer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: any, init?: any) => {
        const url = String(input)
        if (!url.includes('/api/v1/analytics/b1/events')) return new Response('{}', { status: 200 })
        return new Response('{}', { status: 200 })
      }),
    )

    render(
      <MemoryRouter>
        <SiteShell businessId="b1" tradeId="t1" pageType="home" companyName="ACME" phone="+33123456789">
          <div>content</div>
        </SiteShell>
      </MemoryRouter>,
    )

    const links = screen.getAllByRole('link', { name: 'Devis' })
    const footerLink = links.find((l) => l.closest('footer'))
    expect(footerLink).toBeTruthy()
    fireEvent.click(footerLink!)

    const calls = (fetch as any).mock.calls
    const analyticsCall = calls.find((c: any[]) => String(c[0]).includes('/api/v1/analytics/b1/events'))
    expect(analyticsCall).toBeTruthy()
    const body = JSON.parse(String(analyticsCall[1]?.body || '{}'))
    expect(body.name).toBe('open_quote_form')
    expect(body.properties?.cta_id).toBe('footer')
  })
})
