import { describe, expect, it, vi, afterEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { render, screen, cleanup } from '@testing-library/react'
import BlueprintPage from './BlueprintPage'

describe('BlueprintPage hero background', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    cleanup()
  })

  it('rend un fond hero quand branding.hero_image_url est défini', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 204 })),
    )
    window.history.pushState({}, '', '/site/b1')

    render(
      <MemoryRouter initialEntries={['/site/b1']}>
        <BlueprintPage
          businessId="b1"
          pageKey="home"
          config={{
            phone_e164: '+33123456789',
            whatsapp_e164: '+33123456789',
            company_name: 'ACME',
            trade_id: 't1',
            branding: { hero_image_url: 'https://example.com/hero.jpg' },
            appearance: { sections: { hero: { variant: 'classic' } } },
          }}
          content={{
            blueprints: {
              global: { seo: { titles: { home: 'Titre Home' } } },
              pages: { home: { sections_order: ['hero'], sections: { hero: { components: [{ type: 'headline', text: 'Hello' }] } } } },
            },
            ab: { experiments: {} },
          }}
        />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Hello')).toBeInTheDocument()
    expect(document.querySelector('.site-hero-bg')).toBeTruthy()
    expect(document.querySelector('.site-hero')?.className.includes('site-hero-has-bg')).toBe(true)
    expect(document.querySelector('img')).toBeNull()
  })
})
