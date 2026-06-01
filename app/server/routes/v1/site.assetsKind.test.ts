import { describe, expect, it } from 'vitest'
import { normalizeAssetKind } from './site'

describe('normalizeAssetKind', () => {
  it('accepte lead_photo/logo/gallery_photo/hero_image', () => {
    expect(normalizeAssetKind('lead_photo')).toBe('lead_photo')
    expect(normalizeAssetKind('logo')).toBe('logo')
    expect(normalizeAssetKind('gallery_photo')).toBe('gallery_photo')
    expect(normalizeAssetKind('hero_image')).toBe('hero_image')
  })

  it('refuse les valeurs inconnues', () => {
    expect(normalizeAssetKind('x')).toBe(null)
  })
})
