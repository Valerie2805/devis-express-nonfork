import { describe, expect, it, afterEach } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import SiteShell from './SiteShell'
import { THEMES } from '@/site/themes'

describe('SiteShell theme', () => {
  afterEach(() => {
    cleanup()
  })

  it('applique le theme depuis ?theme=', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/site/b1?theme=ocean']}>
        <SiteShell businessId="b1" tradeId="t1" pageType="home" companyName="ACME" phone="+33123456789" appearance={{ theme_id: 'terra' }}>
          <div>content</div>
        </SiteShell>
      </MemoryRouter>,
    )

    const root = container.querySelector('.site-theme') as HTMLElement
    expect(root).toBeTruthy()
    expect(root.style.getPropertyValue('--bg')).toBe(THEMES.ocean.vars.bg)
    expect(root.style.getPropertyValue('--primary')).toBe(THEMES.ocean.vars.primary)
  })

  it('fallback sur appearance.theme_id si ?theme absent', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/site/b1']}>
        <SiteShell businessId="b1" tradeId="t1" pageType="home" companyName="ACME" phone="+33123456789" appearance={{ theme_id: 'cherry' }}>
          <div>content</div>
        </SiteShell>
      </MemoryRouter>,
    )

    const root = container.querySelector('.site-theme') as HTMLElement
    expect(root.style.getPropertyValue('--bg')).toBe(THEMES.cherry.vars.bg)
  })
})

