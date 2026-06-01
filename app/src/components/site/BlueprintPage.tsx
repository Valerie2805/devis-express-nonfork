import SiteShell from '@/components/site/SiteShell'
import QuoteForm from '@/components/site/QuoteForm'
import { track } from '@/utils/tracking'
import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { resolveSourceValue } from '@/components/site/blueprintRuntime'
import { getHeroVariant } from '@/utils/ab'

type Props = {
  businessId: string
  pageKey: 'home' | 'services' | 'zones' | 'tarifs'
  config: any
  content: any
}

function ctaGroup(
  businessId: string,
  tradeId: string,
  pageType: string,
  phone: string,
  whatsappPhone: string,
  heroVariant: string,
  labels?: string[],
) {
  const callLabel = typeof labels?.[0] === 'string' ? labels[0] : 'Appeler'
  const whatsappLabel = typeof labels?.[1] === 'string' ? labels[1] : 'WhatsApp'
  const quoteLabel = typeof labels?.[2] === 'string' ? labels[2] : 'Devis express'
  const base = `/site/${businessId}`
  const devisHref = pageType === 'home' ? '#devis' : `${base}#devis`
  return (
    <div className="grid w-full gap-2 md:w-72">
      <a
        href={`tel:${phone}`}
        onClick={() =>
          void track(businessId, tradeId, 'click_call', {
            page_type: pageType,
            page_path: window.location.pathname,
            properties: { cta_id: 'hero', variant: heroVariant, label: callLabel },
          }).catch(() => {})
        }
        className="site-primary px-4 py-4 text-center text-sm font-semibold hover:opacity-95"
      >
        {callLabel}
      </a>
      <a
        href={`https://wa.me/${whatsappPhone.replace('+', '')}`}
        onClick={() =>
          void track(businessId, tradeId, 'click_whatsapp', {
            page_type: pageType,
            page_path: window.location.pathname,
            properties: { cta_id: 'hero', variant: heroVariant, label: whatsappLabel },
          }).catch(() => {})
        }
        className="site-btn-secondary px-4 py-4 text-center text-sm font-semibold hover:opacity-95"
      >
        {whatsappLabel}
      </a>
      <Link
        to={devisHref}
        onClick={() =>
          void track(businessId, tradeId, 'open_quote_form', {
            page_type: pageType,
            page_path: window.location.pathname,
            properties: { trigger: 'cta_click', variant: heroVariant, label: quoteLabel },
          }).catch(() => {})
        }
        className="site-btn-secondary px-4 py-4 text-center text-sm font-semibold hover:opacity-95"
      >
        {quoteLabel}
      </Link>
    </div>
  )
}

function asArray<T>(v: any): T[] {
  return Array.isArray(v) ? (v as T[]) : []
}

function sectionWrapperClass(sectionKey: string) {
  if (sectionKey === 'hero') return 'site-hero site-card p-6 md:p-10'
  if (sectionKey === 'proof_bar') return 'mt-6 site-card p-4'
  return 'mt-6 site-card p-5 md:p-6'
}

function renderFaq(items: any[], variant: string, limit?: number) {
  const list = typeof limit === 'number' ? items.slice(0, limit) : items
  if (variant === 'accordion') {
    return (
      <div className="mt-4 grid gap-2">
        {list.map((item: any) => (
          <details key={item.q} className="site-card p-4">
            <summary className="site-display cursor-pointer text-sm font-medium">{item.q}</summary>
            <div className="site-muted mt-2 text-xs leading-relaxed">{item.a}</div>
          </details>
        ))}
      </div>
    )
  }
  if (variant === 'two_columns') {
    const mid = Math.ceil(list.length / 2)
    const left = list.slice(0, mid)
    const right = list.slice(mid)
    return (
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {[left, right].map((col, idx) => (
          <div key={idx} className="grid gap-2">
            {col.map((item: any) => (
              <div key={item.q} className="site-card p-4">
                <div className="site-display text-sm font-medium">{item.q}</div>
                <div className="site-muted mt-1 text-xs leading-relaxed">{item.a}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    )
  }
  return (
    <div className="mt-4 grid gap-3 md:grid-cols-2">
      {list.map((item: any) => (
        <div key={item.q} className="site-card p-4">
          <div className="site-display text-sm font-medium">{item.q}</div>
          <div className="site-muted mt-1 text-xs leading-relaxed">{item.a}</div>
        </div>
      ))}
    </div>
  )
}

export default function BlueprintPage({ businessId, pageKey, config, content }: Props) {
  const phone = config.phone_e164
  const whatsappPhone = config.whatsapp_e164 || config.phone_e164
  const companyName = config.company_name
  const logoUrl = config.logo_url || null
  const heroImageUrl = config?.branding?.hero_image_url ? String(config.branding.hero_image_url) : null
  const tradeId = config.trade_id
  const pageType = pageKey
  const heroStyleVariant = String(config?.appearance?.sections?.hero?.variant || 'classic')
  const pricingStyleVariant = String(config?.appearance?.sections?.pricing?.variant || 'cards')
  const servicesStyleVariant = String(config?.appearance?.sections?.services?.variant || 'grid')
  const zonesStyleVariant = String(config?.appearance?.sections?.zones?.variant || 'chips')
  const reviewsStyleVariant = String(config?.appearance?.sections?.reviews?.variant || 'cards')
  const faqStyleVariant = String(config?.appearance?.sections?.faq?.variant || 'cards')
  const experiments = (content?.ab?.experiments && typeof content.ab.experiments === 'object' ? content.ab.experiments : {}) as Record<
    string,
    { id: string; variant: string; version: number }
  >

  const heroVariant =
    config?.settings?.ab_tests?.hero_variant === 'A' || config?.settings?.ab_tests?.hero_variant === 'B'
      ? config.settings.ab_tests.hero_variant
      : experiments?.hero?.variant === 'A' || experiments?.hero?.variant === 'B'
        ? experiments.hero.variant
        : content?.ab?.hero_variant === 'A' || content?.ab?.hero_variant === 'B'
          ? content.ab.hero_variant
          : getHeroVariant()

  const abVariants = {
    hero: heroVariant,
    services: experiments?.services?.variant === 'A' || experiments?.services?.variant === 'B' ? experiments.services.variant : heroVariant,
    zones: experiments?.zones?.variant === 'A' || experiments?.zones?.variant === 'B' ? experiments.zones.variant : heroVariant,
    tarifs: experiments?.tarifs?.variant === 'A' || experiments?.tarifs?.variant === 'B' ? experiments.tarifs.variant : heroVariant,
    quote_form:
      experiments?.quote_form?.variant === 'A' || experiments?.quote_form?.variant === 'B' ? experiments.quote_form.variant : heroVariant,
  }

  ;(window as any).__mad_hero_variant = heroVariant
  ;(window as any).__mad_experiments = experiments
  ;(window as any).__mad_ab_variants = abVariants
  ;(window as any).__mad_page_type = pageType
  ;(window as any).__mad_tracking_enabled = config?.settings?.tracking_enabled !== false

  useEffect(() => {
    void track(businessId, tradeId, 'view_page', { page_type: pageType, page_path: window.location.pathname }).catch(() => {})
  }, [businessId, tradeId, pageType])

  useEffect(() => {
    const t = content?.blueprints?.global?.seo?.titles?.[pageKey]
    if (typeof t === 'string' && t.trim()) document.title = t
  }, [content, pageKey])

  useEffect(() => {
    void track(businessId, tradeId, 'view_hero', {
      page_type: pageType,
      page_path: window.location.pathname,
      properties: { variant: heroVariant },
    }).catch(() => {})
  }, [businessId, tradeId, pageType, heroVariant])

  const blueprint = content.blueprints?.pages?.[pageKey]
  const sectionsOrder: string[] = blueprint?.sections_order || []

  return (
    <SiteShell
      businessId={businessId}
      tradeId={tradeId}
      pageType={pageType}
      companyName={companyName}
      phone={phone}
      whatsappPhone={whatsappPhone}
      logoUrl={logoUrl}
      appearance={config?.appearance || null}
    >
      {sectionsOrder.map((sectionKey) => {
        const sectionDef = blueprint?.sections?.[sectionKey]
        const components = asArray<any>(sectionDef?.components)
        const ctx = { config: { ...config, hero_variant: heroVariant, ab_variants: abVariants }, content }

        const rendered = components
          .map((comp, idx) => {
            const type = String(comp.type || '')

            if (type === 'headline') {
              const resolved = comp.source ? resolveSourceValue(String(comp.source), ctx) : undefined
              const v = resolved || comp.text
              if (!v) return null
              const Tag = sectionKey === 'hero' || sectionKey === 'page_intro' ? 'h1' : 'h2'
              return (
                <Tag
                  key={idx}
                  className={sectionKey === 'hero' ? 'site-display text-2xl font-semibold tracking-tight md:text-4xl' : 'site-display text-base font-semibold'}
                >
                  {String(v)}
                </Tag>
              )
            }

            if (type === 'subtitle') {
              const resolved = comp.source ? resolveSourceValue(String(comp.source), ctx) : undefined
              const v = resolved || comp.text
              if (!v) return null
              return (
                <p key={idx} className={sectionKey === 'hero' ? 'site-muted mt-3 text-sm leading-relaxed md:text-base' : 'site-muted mt-2 text-sm'}>
                  {String(v)}
                </p>
              )
            }

            if (type === 'cta_group') return null

            if (type === 'trust_mini') {
              const items = asArray<string>(comp.items)
              if (!items.length) return null
              return (
                <div key={idx} className="site-muted mt-5 flex flex-wrap items-center gap-2 text-xs">
                  {items.map((it) => (
                    <span key={it} className="site-badge px-3 py-1">
                      {it}
                    </span>
                  ))}
                </div>
              )
            }

            if (type === 'rating_summary') {
              const v = comp.source ? resolveSourceValue(String(comp.source), ctx) : null
              const avg = typeof v?.rating_avg === 'number' ? v.rating_avg : null
              const count = typeof v?.rating_count === 'number' ? v.rating_count : null
              return (
                <div key={idx} className="site-badge px-3 py-2 text-xs">
                  {avg === null || count === null ? 'Avis clients' : `${avg.toFixed(1)} / 5 • ${count} avis`}
                </div>
              )
            }

            if (type === 'badges') {
              const items = asArray<string>(comp.items)
              if (!items.length) return null
              return (
                <div key={idx} className="flex flex-wrap items-center gap-2">
                  {items.map((b) => (
                    <span key={b} className="site-badge px-3 py-1 text-xs">
                      {b}
                    </span>
                  ))}
                </div>
              )
            }

            if (type === 'service_area') {
              const text = comp.text ? String(comp.text) : `Intervention sur ${config.zone_label}`
              return (
                <div key={idx} className="site-muted text-xs">
                  {text}
                </div>
              )
            }

            if (type === 'cards') {
              const src = comp.source ? resolveSourceValue(String(comp.source), ctx) : []
              const items = asArray<string>(src)
              const limit = typeof comp.limit === 'number' ? comp.limit : undefined
              const list = limit ? items.slice(0, limit) : items
              if (!list.length) return null
              if (pageKey === 'tarifs' && pricingStyleVariant === 'table') {
                return (
                  <div key={idx} className="mt-5 grid gap-2">
                    {list.map((s) => (
                      <div key={s} className="site-card p-4">
                        <div className="site-display text-sm font-semibold">{s}</div>
                        <div className="site-muted mt-1 text-xs">Tarif annoncé avant intervention • Réponse rapide</div>
                      </div>
                    ))}
                  </div>
                )
              }
              return (
                <div key={idx} className={pageKey === 'tarifs' && pricingStyleVariant === 'minimal' ? 'mt-6 grid gap-3 md:grid-cols-2' : 'mt-6 grid gap-3 md:grid-cols-3'}>
                  {list.map((s) => (
                    <div key={s} className={pageKey === 'tarifs' && pricingStyleVariant === 'minimal' ? 'site-card p-4' : 'site-card p-4'}>
                      <div className="site-display text-sm font-semibold">{s}</div>
                      <div className="site-muted mt-1 text-xs">Réponse rapide • Devis clair</div>
                    </div>
                  ))}
                </div>
              )
            }

            if (type === 'next_available_slot') {
              const v = comp.source ? resolveSourceValue(String(comp.source), ctx) : null
              const nextSlot = typeof v === 'object' && v ? v.next_slot_text : null
              if (!nextSlot) return null
              return (
                <div key={idx} className="mt-4 site-card p-4">
                  <div className="site-muted text-xs uppercase tracking-wider">Prochaine disponibilité</div>
                  <div className="site-display mt-2 text-sm font-semibold">{String(nextSlot)}</div>
                </div>
              )
            }

            if (type === 'steps') {
              const steps = asArray<any>(comp.steps)
              if (!steps.length) return null
              return (
                <div key={idx} className="mt-4 grid gap-3 md:grid-cols-3">
                  {steps.map((s) => (
                    <div key={s.title} className="site-card p-4">
                      <div className="site-display text-sm font-semibold">{s.title}</div>
                      <div className="site-muted mt-1 text-xs">{s.text}</div>
                    </div>
                  ))}
                </div>
              )
            }

            if (type === 'faq') {
              const fromSource = comp.source ? resolveSourceValue(String(comp.source), ctx) : undefined
              const fromItemsSource = comp.items_source ? resolveSourceValue(String(comp.items_source), ctx) : undefined
              const items = asArray<any>(fromItemsSource || fromSource || comp.items || [])
              if (!items.length) return null
              const limit = typeof comp.limit === 'number' ? comp.limit : undefined
              const variant = sectionKey === 'faq' ? faqStyleVariant : 'cards'
              return <div key={idx}>{renderFaq(items, variant, limit)}</div>
            }

            if (type === 'form_embed') {
              const tResolved = comp.title_source ? resolveSourceValue(String(comp.title_source), ctx) : undefined
              const stResolved = comp.subtitle_source ? resolveSourceValue(String(comp.subtitle_source), ctx) : undefined
              const t = tResolved ? String(tResolved) : comp.title ? String(comp.title) : undefined
              const st = stResolved ? String(stResolved) : comp.subtitle ? String(comp.subtitle) : undefined
              return (
                <div key={idx} id="devis">
                  <QuoteForm
                    businessId={businessId}
                    tradeId={tradeId}
                    cityDefault={config.city}
                    zoneList={config?.zones?.zone_list || []}
                    formSpec={content.form}
                    title={t}
                    subtitle={st}
                  />
                </div>
              )
            }

            if (type === 'reviews_list') {
              const v = comp.source ? resolveSourceValue(String(comp.source), ctx) : null
              const reviews = asArray<any>(v?.reviews)
              const limit = typeof comp.limit === 'number' ? comp.limit : 3
              const list = reviews.slice(0, limit)
              if (!list.length) return null
              if (sectionKey === 'reviews' && reviewsStyleVariant === 'compact') {
                return (
                  <div key={idx} className="mt-4 grid gap-2">
                    {list.map((r) => (
                      <div key={`${r.author_name}-${r.created_at}`} className="site-card p-4">
                        <div className="site-muted flex items-center justify-between text-xs">
                          <div className="site-display font-semibold">{r.author_name}</div>
                          <div>{'★'.repeat(Math.max(0, Math.min(5, Number(r.rating || 0))))}</div>
                        </div>
                        <div className="mt-2 text-xs leading-relaxed">{r.text}</div>
                      </div>
                    ))}
                  </div>
                )
              }
              if (sectionKey === 'reviews' && reviewsStyleVariant === 'carousel_like') {
                return (
                  <div key={idx} className="mt-4 -mx-4 overflow-x-auto px-4">
                    <div className="flex gap-3">
                      {list.map((r) => (
                        <div key={`${r.author_name}-${r.created_at}`} className="site-card w-72 shrink-0 p-4">
                          <div className="site-muted flex items-center justify-between text-xs">
                            <div className="site-display font-semibold">{r.author_name}</div>
                            <div>{'★'.repeat(Math.max(0, Math.min(5, Number(r.rating || 0))))}</div>
                          </div>
                          <div className="mt-2 text-xs leading-relaxed">{r.text}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              }
              return (
                <div key={idx} className="mt-4 grid gap-3 md:grid-cols-3">
                  {list.map((r) => (
                    <div key={`${r.author_name}-${r.created_at}`} className="site-card p-4">
                      <div className="site-muted flex items-center justify-between text-xs">
                        <div className="site-display font-semibold">{r.author_name}</div>
                        <div>{'★'.repeat(Math.max(0, Math.min(5, Number(r.rating || 0))))}</div>
                      </div>
                      <div className="mt-2 text-xs leading-relaxed">{r.text}</div>
                    </div>
                  ))}
                </div>
              )
            }

            if (type === 'photo_strip') {
              const v = comp.source ? resolveSourceValue(String(comp.source), ctx) : null
              const urls = asArray<string>(v)
              const limit = typeof comp.limit === 'number' ? comp.limit : 6
              const list = urls.slice(0, limit)
              if (!list.length) return null
              return (
                <div key={idx} className="mt-4 grid gap-2 md:grid-cols-6">
                  {list.map((url) => (
                    <a key={url} href={url} target="_blank" className="site-card group block overflow-hidden">
                      <img src={url} alt="" className="aspect-[4/3] w-full object-cover opacity-90 transition group-hover:opacity-100" />
                    </a>
                  ))}
                </div>
              )
            }

            if (type === 'service_list') {
              const src = comp.source ? resolveSourceValue(String(comp.source), ctx) : []
              const items = asArray<string>(src)
              if (!items.length) return null
              const tpl = comp.per_service_template?.components
              const tplComps = asArray<any>(tpl)
              if (sectionKey === 'services' && servicesStyleVariant === 'list') {
                return (
                  <div key={idx} className="mt-4">
                    <ul className="grid gap-2">
                      {items.map((s) => (
                        <li key={s} className="site-card flex items-center justify-between gap-3 p-4">
                          <div className="site-display text-sm font-semibold">{s}</div>
                          <a
                            href="#devis"
                            onClick={() =>
                              void track(businessId, tradeId, 'open_quote_form', {
                                page_type: pageType,
                                page_path: window.location.pathname,
                                properties: { trigger: 'cta_click', label: s },
                              }).catch(() => {})
                            }
                            className="site-link text-xs"
                          >
                            Devis
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              }
              if (sectionKey === 'services' && servicesStyleVariant === 'split') {
                return (
                  <div key={idx} className="mt-4 grid gap-3">
                    {items.map((s) => (
                      <div key={s} className="site-card p-4">
                        <div className="grid gap-3 md:grid-cols-[1fr_200px] md:items-start">
                          <div>
                            <div className="site-display text-sm font-semibold">{s}</div>
                            <div className="site-muted mt-1 text-xs">Tarif annoncé avant intervention • Réponse rapide</div>
                          </div>
                          <div className="flex md:justify-end">
                            <a
                              href="#devis"
                              onClick={() =>
                                void track(businessId, tradeId, 'open_quote_form', {
                                  page_type: pageType,
                                  page_path: window.location.pathname,
                                  properties: { trigger: 'cta_click', label: `Devis ${s}` },
                                }).catch(() => {})
                              }
                              className="site-primary inline-flex px-4 py-2 text-xs font-semibold hover:opacity-95"
                            >
                              Demander un devis
                            </a>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              }
              return (
                <div key={idx} className="mt-4 grid gap-3">
                  {items.map((s) => (
                    <div key={s} className="site-card p-4">
                      <div className="site-display text-sm font-semibold">{s}</div>
                      {tplComps.length
                        ? tplComps.map((c, cidx) => {
                            const t = String(c?.type || '')
                            if (t === 'when_to_call') return <div key={cidx} className="site-muted mt-1 text-xs">{String(c.text || '')}</div>
                            if (t === 'how_we_work') return <div key={cidx} className="site-muted mt-1 text-xs">{String(c.text || '')}</div>
                            if (t === 'cta_inline') {
                              const label = String(c.label || 'Demander un devis')
                              return (
                                <div key={cidx} className="mt-3">
                                  <a
                                    href="#devis"
                                    onClick={() =>
                                      void track(businessId, tradeId, 'open_quote_form', {
                                        page_type: pageType,
                                        page_path: window.location.pathname,
                                        properties: { trigger: 'cta_click', label },
                                      }).catch(() => {})
                                    }
                                    className="site-primary inline-flex px-4 py-2 text-xs font-semibold hover:opacity-95"
                                  >
                                    {label}
                                  </a>
                                </div>
                              )
                            }
                            return null
                          })
                        : (
                            <>
                              <div className="site-muted mt-1 text-xs">Tarif annoncé avant intervention</div>
                              <div className="mt-3">
                                <a
                                  href="#devis"
                                  onClick={() =>
                                    void track(businessId, tradeId, 'open_quote_form', {
                                      page_type: pageType,
                                      page_path: window.location.pathname,
                                      properties: { trigger: 'cta_click', label: 'Demander un devis' },
                                    }).catch(() => {})
                                  }
                                  className="site-primary inline-flex px-4 py-2 text-xs font-semibold hover:opacity-95"
                                >
                                  Demander un devis
                                </a>
                              </div>
                            </>
                          )}
                    </div>
                  ))}
                </div>
              )
            }

            if (type === 'area_list') {
              const src = comp.source ? resolveSourceValue(String(comp.source), ctx) : []
              const zones = asArray<string>(src)
              if (!zones.length) return null
              if (sectionKey === 'zones' && zonesStyleVariant === 'columns') {
                return (
                  <div key={idx} className="mt-4 site-card p-4">
                    <ul className="site-muted columns-2 gap-6 text-sm md:columns-3">
                      {zones.map((z) => (
                        <li key={z} className="mb-2 break-inside-avoid">
                          {z}
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              }
              if (sectionKey === 'zones' && zonesStyleVariant === 'mapless') {
                return (
                  <div key={idx} className="mt-4 site-card p-4">
                    <div className="site-muted text-xs">Zone d’intervention (indicatif) :</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {zones.map((z) => (
                        <div key={z} className="site-badge px-3 py-2 text-sm">
                          {z}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              }
              return (
                <div key={idx} className="mt-4 grid gap-2 text-sm md:grid-cols-3">
                  {zones.map((z) => (
                    <div key={z} className="site-badge px-3 py-2">
                      {z}
                    </div>
                  ))}
                </div>
              )
            }

            if (type === 'cta_banner') {
              const textResolved = comp.text_source ? resolveSourceValue(String(comp.text_source), ctx) : undefined
              const ctaResolved = comp.cta_source ? resolveSourceValue(String(comp.cta_source), ctx) : undefined
              const text = String(textResolved || comp.text || '')
              const cta = String(ctaResolved || comp.cta || 'Devis en 30 secondes')
              return (
                <div key={idx} className="mt-4 site-card flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="text-sm">{text}</div>
                  <a
                    href="#devis"
                    onClick={() =>
                      void track(businessId, tradeId, 'open_quote_form', {
                        page_type: pageType,
                        page_path: window.location.pathname,
                        properties: { trigger: 'cta_click', label: cta },
                      }).catch(() => {})
                    }
                    className="site-primary inline-flex px-4 py-2 text-xs font-semibold hover:opacity-95"
                  >
                    {cta}
                  </a>
                </div>
              )
            }

            if (type === 'bullets') {
              const title = comp.title_source ? resolveSourceValue(String(comp.title_source), ctx) : null
              const bullets = comp.bullets_source ? resolveSourceValue(String(comp.bullets_source), ctx) : null
              const list = asArray<string>(bullets)
              if (!title && !list.length) return null
              return (
                <div key={idx} className="mt-4 site-card p-4">
                  {title ? <div className="site-display text-sm font-semibold">{String(title)}</div> : null}
                  {list.length ? (
                    <ul className="site-muted mt-2 list-disc space-y-1 pl-5 text-xs">
                      {list.map((b) => (
                        <li key={b}>{b}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              )
            }

            if (type === 'blocks') {
              const src = comp.source ? resolveSourceValue(String(comp.source), ctx) : []
              const blocks = asArray<any>(src)
              if (!blocks.length) return null
              return (
                <div key={idx} className="mt-4 grid gap-3 md:grid-cols-3">
                  {blocks.map((b) => (
                    <div key={b.title} className="site-card p-4">
                      <div className="site-muted text-xs uppercase tracking-wider">{b.title}</div>
                      <div className="mt-2 text-xs">{b.content}</div>
                    </div>
                  ))}
                </div>
              )
            }

            if (type === 'two_columns') {
              const leftTitle = comp.left?.title_source ? resolveSourceValue(String(comp.left.title_source), ctx) : null
              const leftBullets = comp.left?.bullets_source ? resolveSourceValue(String(comp.left.bullets_source), ctx) : null
              const rightTitle = comp.right?.title_source ? resolveSourceValue(String(comp.right.title_source), ctx) : null
              const rightBullets = comp.right?.bullets_source ? resolveSourceValue(String(comp.right.bullets_source), ctx) : null
              const leftList = asArray<string>(leftBullets)
              const rightList = asArray<string>(rightBullets)
              if (!leftTitle && !rightTitle && !leftList.length && !rightList.length) return null
              return (
                <div key={idx} className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="site-card p-4">
                    {leftTitle ? <div className="site-display text-sm font-semibold">{String(leftTitle)}</div> : null}
                    {leftList.length ? (
                      <ul className="site-muted mt-2 list-disc space-y-1 pl-5 text-xs">
                        {leftList.map((b) => (
                          <li key={b}>{b}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  <div className="site-card p-4">
                    {rightTitle ? <div className="site-display text-sm font-semibold">{String(rightTitle)}</div> : null}
                    {rightList.length ? (
                      <ul className="site-muted mt-2 list-disc space-y-1 pl-5 text-xs">
                        {rightList.map((b) => (
                          <li key={b}>{b}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </div>
              )
            }

            return null
          })
          .filter(Boolean)

        if (!rendered.length && (sectionKey === 'quote_form' || sectionKey === 'quote_form_cta')) {
          return (
            <div key={sectionKey} id="devis" className="mt-10">
              <QuoteForm businessId={businessId} tradeId={tradeId} cityDefault={config.city} zoneList={config?.zones?.zone_list || []} formSpec={content.form} />
            </div>
          )
        }

        if (!rendered.length) return null

        if (sectionKey === 'hero') {
          const heroCtas = asArray<string>(
            resolveSourceValue(pageKey === 'tarifs' ? 'tarifs_transparents.yml -> common.page.hero.ctas' : 'site_copy.yml -> trades.{trade_id}.hero.ctas', ctx),
          )
          const heroBg = heroImageUrl ? <div className="site-hero-bg" style={{ backgroundImage: `url(${heroImageUrl})` }} /> : null
          const heroSectionClass = `${sectionWrapperClass(sectionKey)}${heroBg ? ' site-hero-has-bg' : ''}`
          if (heroStyleVariant === 'centered') {
            return (
              <section key={sectionKey} className={heroSectionClass}>
                {heroBg}
                <div className="mx-auto grid max-w-3xl gap-6 text-center">
                  <div>{rendered}</div>
                  <div className="mx-auto w-full md:max-w-md">{ctaGroup(businessId, tradeId, pageType, phone, whatsappPhone, heroVariant, heroCtas)}</div>
                </div>
              </section>
            )
          }
          if (heroStyleVariant === 'split') {
            return (
              <section key={sectionKey} className={heroSectionClass}>
                {heroBg}
                <div className="grid gap-6 md:grid-cols-[1fr_320px] md:items-start">
                  <div className="max-w-2xl">{rendered}</div>
                  <div className="grid gap-3">
                    {ctaGroup(businessId, tradeId, pageType, phone, whatsappPhone, heroVariant, heroCtas)}
                  </div>
                </div>
              </section>
            )
          }
          return (
            <section key={sectionKey} className={heroSectionClass}>
              {heroBg}
              <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                <div className="max-w-2xl">{rendered}</div>
                <div className="grid gap-3 md:w-72">
                  {ctaGroup(businessId, tradeId, pageType, phone, whatsappPhone, heroVariant, heroCtas)}
                </div>
              </div>
            </section>
          )
        }

        if (sectionKey === 'proof_bar') {
          return (
            <section key={sectionKey} className={sectionWrapperClass(sectionKey)}>
              <div className="flex flex-wrap items-center justify-between gap-3">{rendered}</div>
            </section>
          )
        }

        return (
          <section key={sectionKey} className={sectionWrapperClass(sectionKey)}>
            {rendered}
          </section>
        )
      })}
    </SiteShell>
  )
}
