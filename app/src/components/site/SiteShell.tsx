import { useEffect } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Phone, MessageCircle, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { track } from '@/utils/tracking'
import { getTheme } from '@/site/themes'

type Props = {
  businessId: string
  tradeId: string
  pageType: string
  companyName: string
  phone: string
  whatsappPhone?: string
  logoUrl?: string | null
  appearance?: any
  children: React.ReactNode
}

export default function SiteShell({ businessId, tradeId, pageType, companyName, phone, whatsappPhone, logoUrl, appearance, children }: Props) {
  const base = `/site/${businessId}`
  const wa = whatsappPhone || phone
  const footerVariant = String(appearance?.sections?.footer?.variant || 'rich')
  const location = useLocation()
  const devisHref = location.pathname === base ? '#devis' : `${base}#devis`
  const themeFromUrl = (() => {
    const params = new URLSearchParams(location.search || '')
    const v = params.get('theme')
    return v ? String(v) : null
  })()
  const theme = getTheme(themeFromUrl || appearance?.theme_id)
  const themeVars = { ...theme.vars, ...((appearance as any)?.theme_vars_override || {}) }
  const themeStyle = {
    ['--bg' as any]: themeVars.bg,
    ['--surface' as any]: themeVars.surface,
    ['--surface2' as any]: themeVars.surface2,
    ['--text' as any]: themeVars.text,
    ['--muted' as any]: themeVars.muted,
    ['--border' as any]: themeVars.border,
    ['--primary' as any]: themeVars.primary,
    ['--primary-contrast' as any]: themeVars.primaryContrast,
    ['--accent' as any]: themeVars.accent,
    ['--accent-glow' as any]: themeVars.accentGlow,
    ['--btn-primary-bg' as any]: themeVars.btnPrimaryBg,
    ['--btn-primary-text' as any]: themeVars.btnPrimaryText,
    ['--btn-primary-border' as any]: themeVars.btnPrimaryBorder,
    ['--btn-primary-shadow' as any]: themeVars.btnPrimaryShadow,
    ['--btn-primary-radius' as any]: themeVars.btnPrimaryRadius,
    ['--btn-secondary-bg' as any]: themeVars.btnSecondaryBg,
    ['--btn-secondary-text' as any]: themeVars.btnSecondaryText,
    ['--btn-secondary-border' as any]: themeVars.btnSecondaryBorder,
    ['--btn-secondary-shadow' as any]: themeVars.btnSecondaryShadow,
    ['--btn-secondary-radius' as any]: themeVars.btnSecondaryRadius,
    ['--card-bg' as any]: themeVars.cardBg,
    ['--card-border' as any]: themeVars.cardBorder,
    ['--card-shadow' as any]: themeVars.cardShadow,
    ['--card-radius' as any]: themeVars.cardRadius,
    ['--card-backdrop' as any]: themeVars.cardBackdrop,
    ['--badge-bg' as any]: themeVars.badgeBg,
    ['--badge-border' as any]: themeVars.badgeBorder,
    ['--badge-text' as any]: themeVars.badgeText,
    ['--badge-radius' as any]: themeVars.badgeRadius,
    ['--link' as any]: themeVars.link,
    ['--link-hover' as any]: themeVars.linkHover,
    ['--hero-overlay' as any]: themeVars.heroOverlay,
    ['--radius' as any]: themeVars.radius,
    ['--shadow' as any]: themeVars.shadow,
    ['--font-sans' as any]: themeVars.fontSans,
    ['--font-display' as any]: themeVars.fontDisplay,
  }

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (location.hash !== '#devis') return
    const el = document.getElementById('devis')
    if (!el) return
    try {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } catch {
      el.scrollIntoView()
    }
  }, [location.hash, location.pathname])

  return (
    <div className="min-h-dvh site-theme" style={themeStyle as any}>
      <header className="sticky top-0 z-30 border-b site-border site-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link to={base} className="flex items-center gap-3">
            {logoUrl ? (
              <img src={logoUrl} alt={companyName} className="h-8 w-8 rounded-lg object-contain site-surface2" />
            ) : null}
            <span className="text-sm font-medium tracking-wide">{companyName}</span>
            <span className="text-[10px] uppercase tracking-[0.2em] site-muted">DevisExpress</span>
          </Link>
          <nav className="hidden items-center gap-4 text-sm site-muted md:flex">
            <NavLink
              to={base}
              end
              className={({ isActive }) =>
                cn('rounded-md px-2 py-1 hover:opacity-80', isActive && 'font-semibold text-[color:var(--text)]')
              }
            >
              Accueil
            </NavLink>
            <NavLink
              to={`${base}/services`}
              className={({ isActive }) =>
                cn('rounded-md px-2 py-1 hover:opacity-80', isActive && 'font-semibold text-[color:var(--text)]')
              }
            >
              Services
            </NavLink>
            <NavLink
              to={`${base}/zones`}
              className={({ isActive }) =>
                cn('rounded-md px-2 py-1 hover:opacity-80', isActive && 'font-semibold text-[color:var(--text)]')
              }
            >
              Zones
            </NavLink>
            <NavLink
              to={`${base}/tarifs`}
              className={({ isActive }) =>
                cn('rounded-md px-2 py-1 hover:opacity-80', isActive && 'font-semibold text-[color:var(--text)]')
              }
            >
              Tarifs
            </NavLink>
          </nav>
          <div className="flex items-center gap-2">
            <a
              href={`tel:${phone}`}
              onClick={() =>
                void track(businessId, tradeId, 'click_call', {
                  page_type: pageType,
                  page_path: window.location.pathname,
                  properties: { cta_id: 'header' },
                }).catch(() => {})
              }
              className="inline-flex items-center gap-2 site-primary px-3 py-2 text-xs font-semibold hover:opacity-95"
            >
              <Phone className="h-4 w-4" />
              Appeler
            </a>
            <a
              href={`https://wa.me/${wa.replace('+', '')}`}
              onClick={() =>
                void track(businessId, tradeId, 'click_whatsapp', {
                  page_type: pageType,
                  page_path: window.location.pathname,
                  properties: { cta_id: 'header' },
                }).catch(() => {})
              }
              className="inline-flex items-center gap-2 site-btn-secondary px-2 py-2 text-xs font-semibold hover:opacity-95 sm:px-3"
            >
              <MessageCircle className="h-4 w-4" />
              <span className="hidden sm:inline">WhatsApp</span>
            </a>
            <Link
              to={devisHref}
              onClick={() =>
                void track(businessId, tradeId, 'open_quote_form', {
                  page_type: pageType,
                  page_path: window.location.pathname,
                  properties: { cta_id: 'header', trigger: 'cta_click' },
                }).catch(() => {})
              }
              className="inline-flex items-center gap-2 site-btn-secondary px-2 py-2 text-xs font-semibold hover:opacity-95 sm:px-3"
            >
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Demande</span>
            </Link>
          </div>
        </div>
        <div className="mx-auto max-w-5xl px-4 pb-3 md:hidden">
          <nav className="flex flex-wrap items-center gap-2 text-xs site-muted">
            <NavLink
              to={base}
              end
              className={({ isActive }) =>
                cn(
                  'rounded-xl border border-transparent px-3 py-2 hover:opacity-90',
                  isActive && 'border-[color:var(--border)] bg-[color:var(--surface2)] text-[color:var(--text)]',
                )
              }
            >
              Accueil
            </NavLink>
            <NavLink
              to={`${base}/services`}
              className={({ isActive }) =>
                cn(
                  'rounded-xl border border-transparent px-3 py-2 hover:opacity-90',
                  isActive && 'border-[color:var(--border)] bg-[color:var(--surface2)] text-[color:var(--text)]',
                )
              }
            >
              Services
            </NavLink>
            <NavLink
              to={`${base}/zones`}
              className={({ isActive }) =>
                cn(
                  'rounded-xl border border-transparent px-3 py-2 hover:opacity-90',
                  isActive && 'border-[color:var(--border)] bg-[color:var(--surface2)] text-[color:var(--text)]',
                )
              }
            >
              Zones
            </NavLink>
            <NavLink
              to={`${base}/tarifs`}
              className={({ isActive }) =>
                cn(
                  'rounded-xl border border-transparent px-3 py-2 hover:opacity-90',
                  isActive && 'border-[color:var(--border)] bg-[color:var(--surface2)] text-[color:var(--text)]',
                )
              }
            >
              Tarifs
            </NavLink>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>

      {footerVariant === 'minimal' ? (
        <footer className="border-t site-border site-surface">
          <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-8 text-xs site-muted md:flex-row md:items-center md:justify-between">
            <div className="text-[color:var(--text)]">{companyName}</div>
            <div className="flex flex-wrap items-center gap-4">
              <a
                href={`tel:${phone}`}
                onClick={() =>
                  void track(businessId, tradeId, 'click_call', {
                    page_type: pageType,
                    page_path: window.location.pathname,
                    properties: { cta_id: 'footer' },
                  }).catch(() => {})
                }
                className="site-link"
              >
                {phone}
              </a>
              <a
                href={`https://wa.me/${wa.replace('+', '')}`}
                onClick={() =>
                  void track(businessId, tradeId, 'click_whatsapp', {
                    page_type: pageType,
                    page_path: window.location.pathname,
                    properties: { cta_id: 'footer' },
                  }).catch(() => {})
                }
                className="site-link"
              >
                WhatsApp
              </a>
              <Link
                to={devisHref}
                onClick={() =>
                  void track(businessId, tradeId, 'open_quote_form', {
                    page_type: pageType,
                    page_path: window.location.pathname,
                    properties: { cta_id: 'footer', trigger: 'cta_click' },
                  }).catch(() => {})
                }
                className="site-link"
              >
                Devis
              </Link>
            </div>
          </div>
        </footer>
      ) : footerVariant === 'contact_focus' ? (
        <footer className="border-t site-border site-surface">
          <div className="mx-auto grid max-w-5xl gap-4 px-4 py-8 md:grid-cols-[1fr_320px] md:items-start">
            <div className="space-y-2">
              <div className="site-display text-base font-semibold text-[color:var(--text)]">{companyName}</div>
              <div className="site-muted text-sm">Réponse rapide • Tarif annoncé avant intervention</div>
              <div className="flex flex-wrap gap-2 pt-2">
                <a
                  href={`tel:${phone}`}
                  onClick={() =>
                    void track(businessId, tradeId, 'click_call', {
                      page_type: pageType,
                      page_path: window.location.pathname,
                      properties: { cta_id: 'footer' },
                    }).catch(() => {})
                  }
                  className="site-primary inline-flex px-4 py-3 text-xs font-semibold hover:opacity-95"
                >
                  Appeler
                </a>
                <a
                  href={`https://wa.me/${wa.replace('+', '')}`}
                  onClick={() =>
                    void track(businessId, tradeId, 'click_whatsapp', {
                      page_type: pageType,
                      page_path: window.location.pathname,
                      properties: { cta_id: 'footer' },
                    }).catch(() => {})
                  }
                  className="site-btn-secondary inline-flex px-4 py-3 text-xs font-semibold hover:opacity-95"
                >
                  WhatsApp
                </a>
              </div>
            </div>
            <div className="site-card p-4 text-xs site-muted">
              <div>Astuce : une photo sur WhatsApp = réponse plus rapide.</div>
              <div className="mt-2">
                <Link
                  to={devisHref}
                  onClick={() =>
                    void track(businessId, tradeId, 'open_quote_form', {
                      page_type: pageType,
                      page_path: window.location.pathname,
                      properties: { cta_id: 'footer', trigger: 'cta_click' },
                    }).catch(() => {})
                  }
                  className="site-link"
                >
                  Faire une demande de devis
                </Link>
              </div>
            </div>
          </div>
        </footer>
      ) : (
        <footer className="border-t site-border site-surface">
          <div className="mx-auto grid max-w-5xl gap-3 px-4 py-8 text-xs site-muted md:grid-cols-2">
            <div className="space-y-1">
              <div className="text-[color:var(--text)]">{companyName}</div>
              <div className="flex flex-wrap items-center gap-2">
                <span>Contact :</span>
                <a
                  href={`tel:${phone}`}
                  onClick={() =>
                    void track(businessId, tradeId, 'click_call', {
                      page_type: pageType,
                      page_path: window.location.pathname,
                      properties: { cta_id: 'footer' },
                    }).catch(() => {})
                  }
                  className="hover:opacity-80"
                >
                  {phone}
                </a>
                <a
                  href={`https://wa.me/${wa.replace('+', '')}`}
                  onClick={() =>
                    void track(businessId, tradeId, 'click_whatsapp', {
                      page_type: pageType,
                      page_path: window.location.pathname,
                      properties: { cta_id: 'footer' },
                    }).catch(() => {})
                  }
                  className="hover:opacity-80"
                >
                  WhatsApp
                </a>
                <Link
                  to={devisHref}
                  onClick={() =>
                    void track(businessId, tradeId, 'open_quote_form', {
                      page_type: pageType,
                      page_path: window.location.pathname,
                      properties: { cta_id: 'footer', trigger: 'cta_click' },
                    }).catch(() => {})
                  }
                  className="hover:opacity-80"
                >
                  Devis
                </Link>
              </div>
            </div>
            <div className="space-y-1 md:text-right">
              <div>Tarif annoncé avant intervention</div>
              <div>Réponse rapide</div>
            </div>
          </div>
        </footer>
      )}

      <div className="fixed inset-x-0 bottom-0 z-40 border-t site-border site-surface md:hidden">
        <div className="mx-auto grid max-w-5xl grid-cols-3 gap-2 px-2 py-2 text-[11px]">
          <a
            href={`tel:${phone}`}
            onClick={() =>
              void track(businessId, tradeId, 'click_call', {
                page_type: pageType,
                page_path: window.location.pathname,
                properties: { cta_id: 'sticky' },
              }).catch(() => {})
            }
            className="flex items-center justify-center gap-2 rounded-xl site-primary px-3 py-3 font-semibold"
          >
            <Phone className="h-4 w-4" />
            Appeler
          </a>
          <a
            href={`https://wa.me/${wa.replace('+', '')}`}
            onClick={() =>
              void track(businessId, tradeId, 'click_whatsapp', {
                page_type: pageType,
                page_path: window.location.pathname,
                properties: { cta_id: 'sticky' },
              }).catch(() => {})
            }
            className="flex items-center justify-center gap-2 site-btn-secondary px-3 py-3 font-semibold hover:opacity-95"
          >
            <MessageCircle className="h-4 w-4" />
            WhatsApp
          </a>
          <Link
            to={devisHref}
            onClick={() =>
              void track(businessId, tradeId, 'open_quote_form', {
                page_type: pageType,
                page_path: window.location.pathname,
                properties: { cta_id: 'sticky', trigger: 'cta_click' },
              }).catch(() => {})
            }
            className="flex items-center justify-center gap-2 site-btn-secondary px-3 py-3 font-semibold hover:opacity-95"
          >
            <FileText className="h-4 w-4" />
            Devis
          </Link>
        </div>
      </div>
    </div>
  )
}
