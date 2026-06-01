type ResolveCtx = {
  config: any
  content: any
}

function pickVariant(ctx: ResolveCtx, key: string, fallback: string): string {
  const v = ctx.config?.ab_variants?.[key]
  if (v === 'A' || v === 'B') return v
  return fallback
}

function getByPath(root: any, path: string) {
  if (!root) return undefined
  const parts = path.split('.').filter(Boolean)
  let cur = root
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined
    cur = cur[p]
  }
  return cur
}

function parseSource(source: string) {
  const parts = source.split('->').map((s) => s.trim())
  if (parts.length === 1) return { kind: parts[0], path: '' }
  return { kind: parts[0], path: parts[1] }
}

export function resolveSourceValue(source: string, ctx: ResolveCtx) {
  if (!source) return undefined
  if (source === 'google_reviews') return ctx.content?.google_reviews
  if (source === 'photos_real') return ctx.content?.photos_real

  if (source.startsWith('client.')) {
    if (source === 'client.zone_list') return ctx.config?.zones?.zone_list || []
    if (source === 'client.hero_variant') return pickVariant(ctx, 'hero', ctx.config?.hero_variant || 'A')
    return undefined
  }

  if (source.startsWith('backoffice.')) {
    if (source === 'backoffice.availability') return ctx.config?.availability || {}
    return undefined
  }

  const parsed = parseSource(source)
  if (parsed.kind === 'form_schema.yml') return ctx.content?.form

  if (parsed.kind === 'site_copy.yml') {
    const p = parsed.path.replace(/^trades\.\{trade_id\}\./, '')
    if (p.startsWith('hero.')) {
      const after = p.slice('hero.'.length)
      if (after === 'h1' || after === 'subtitle' || after === 'ctas') {
        const variant = String(pickVariant(ctx, 'hero', String(ctx.config?.hero_variant || 'A')))
        const v = getByPath(ctx.content?.site_copy?.hero?.variants?.[variant], after)
        if (after === 'ctas') {
          if (Array.isArray(v) && v.length) return v
        } else if (v) return v
      }
    }
    if (p.startsWith('pages.')) {
      const parts = p.split('.').filter(Boolean)
      const page = parts[1] || ''
      const section = parts[2] || ''
      const field = parts[3] || ''
      if (page && section && field) {
        let key = 'hero'
        if (section === 'quote_form') key = 'quote_form'
        else if (page === 'services') key = 'services'
        else if (page === 'zones') key = 'zones'
        const variant = String(pickVariant(ctx, key, String(ctx.config?.hero_variant || 'A')))
        const v = getByPath(ctx.content?.site_copy?.pages?.[page]?.[section]?.variants?.[variant], field)
        if (v) return v
      }
    }
    return getByPath(ctx.content?.site_copy, p)
  }

  if (parsed.kind === 'tarifs_transparents.yml') {
    if (parsed.path.startsWith('common.')) {
      const p = parsed.path.replace(/^common\./, '')
      if (p.startsWith('page.hero.')) {
        const after = p.slice('page.hero.'.length)
        if (after === 'ctas' || after === 'h1' || after === 'subtitle') {
          const variant = String(pickVariant(ctx, 'tarifs', String(ctx.config?.hero_variant || 'A')))
          const v = getByPath(ctx.content?.tarifs_common?.page?.hero?.variants?.[variant], after)
          if (after === 'ctas') {
            if (Array.isArray(v) && v.length) return v
          } else if (v) return v
        }
      }
      if (p.startsWith('page.sections.quote_form_cta.')) {
        const after = p.slice('page.sections.quote_form_cta.'.length)
        if (after === 'text' || after === 'cta') {
          const variant = String(pickVariant(ctx, 'tarifs', String(ctx.config?.hero_variant || 'A')))
          const v = getByPath(ctx.content?.tarifs_common?.page?.sections?.quote_form_cta?.variants?.[variant], after)
          if (v) return v
        }
      }
      if (p.startsWith('page.sections.quote_form.')) {
        const after = p.slice('page.sections.quote_form.'.length)
        if (after === 'title' || after === 'subtitle') {
          const variant = String(pickVariant(ctx, 'quote_form', String(ctx.config?.hero_variant || 'A')))
          const v = getByPath(ctx.content?.tarifs_common?.page?.sections?.quote_form?.variants?.[variant], after)
          if (v) return v
        }
      }
      return getByPath(ctx.content?.tarifs_common, p)
    }
    if (parsed.path.startsWith('trades.')) {
      const p = parsed.path.replace(/^trades\.\{trade_id\}\./, '')
      if (p.startsWith('hero.')) {
        const after = p.slice('hero.'.length)
        if (after === 'h1' || after === 'subtitle') {
          const variant = String(pickVariant(ctx, 'tarifs', String(ctx.config?.hero_variant || 'A')))
          const v = getByPath(ctx.content?.tarifs?.hero?.variants?.[variant], after)
          if (v) return v
        }
      }
      return getByPath(ctx.content?.tarifs, p)
    }
  }

  return undefined
}
