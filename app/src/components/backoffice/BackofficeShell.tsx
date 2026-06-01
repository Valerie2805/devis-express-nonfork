import { Link, NavLink, useNavigate } from 'react-router-dom'
import { LayoutGrid, Settings, ChartLine, CalendarDays, LogOut, ScrollText, CalendarCheck, Monitor, Search, Percent, Menu, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { apiFetch, authHeaders } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

type Props = {
  businessId: string
  children: React.ReactNode
}

export default function BackofficeShell({ businessId, children }: Props) {
  const base = `/backoffice/${businessId}`
  const navigate = useNavigate()
  const { setToken, token } = useAuthStore()
  const [role, setRole] = useState<'owner' | 'staff' | null>(null)
  const [staffPerms, setStaffPerms] = useState<Record<string, any>>({})
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    let alive = true
    if (!token) {
      setRole(null)
      return
    }
    apiFetch<{ role: 'owner' | 'staff' }>(`/api/v1/backoffice/${businessId}/me`, { headers: { ...authHeaders(token) } })
      .then((d) => {
        if (!alive) return
        setRole(d.role)
      })
      .catch(() => {
        if (!alive) return
        setRole(null)
      })
    return () => {
      alive = false
    }
  }, [businessId, token])

  useEffect(() => {
    let alive = true
    if (!token) return
    apiFetch<{ config: any }>(`/api/v1/backoffice/${businessId}/settings`, { headers: { ...authHeaders(token) } })
      .then((d) => {
        if (!alive) return
        ;(window as any).__mad_tracking_enabled = d?.config?.settings?.tracking_enabled !== false
        setStaffPerms(d?.config?.settings?.staff_permissions && typeof d.config.settings.staff_permissions === 'object' ? d.config.settings.staff_permissions : {})
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [businessId, token])

  const canSeeCommissions = role === 'owner' || Boolean(staffPerms.commissions_read)
  const canSeeAudits = role === 'owner' || Boolean(staffPerms.audits_read)
  const canSeeProspection = role === 'owner' || Boolean(staffPerms.prospection_read)
  const mobileCols = 7 + (canSeeProspection ? 1 : 0) + (canSeeCommissions ? 1 : 0) + (canSeeAudits ? 1 : 0)

  return (
    <div className="min-h-dvh bg-zinc-950 text-zinc-50">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-zinc-950/80 backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div>
            <div className="text-xs uppercase tracking-[0.25em] text-zinc-400">Backoffice</div>
            <div className="mt-1 text-sm font-semibold text-white">{businessId}</div>
          </div>
          <button
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-200 hover:bg-white/10"
          >
            {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            Menu
          </button>
        </div>
      </header>

      {mobileMenuOpen ? (
        <div className="fixed inset-0 z-50 bg-zinc-950/90 backdrop-blur md:hidden">
          <div className="mx-auto flex h-full max-w-6xl flex-col px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-white">{businessId}</div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-200 hover:bg-white/10"
              >
                Fermer
              </button>
            </div>
            <div className="mt-4 grid gap-2">
              {[
                { to: base, label: 'Demandes', icon: LayoutGrid, enabled: true },
                { to: `${base}/stats`, label: 'Stats', icon: ChartLine, enabled: true },
                { to: `${base}/sites`, label: 'Sites', icon: Monitor, enabled: true },
                { to: `${base}/prospection`, label: 'Prospection', icon: Search, enabled: canSeeProspection },
                { to: `${base}/commissions`, label: 'Commissions', icon: Percent, enabled: canSeeCommissions },
                { to: `${base}/availability`, label: 'Disponibilités', icon: CalendarDays, enabled: true },
                { to: `${base}/appointments`, label: 'RDV', icon: CalendarCheck, enabled: true },
                { to: `${base}/settings`, label: 'Réglages', icon: Settings, enabled: true },
                { to: `${base}/site-audits`, label: 'Audit IA', icon: ScrollText, enabled: canSeeAudits },
                { to: `${base}/ab`, label: 'A/B Tests', icon: ScrollText, enabled: true },
                { to: `${base}/audit`, label: 'Journal', icon: ScrollText, enabled: role === 'owner' },
              ].map((it) => (
                <button
                  key={it.to}
                  onClick={() => {
                    if (!it.enabled) return
                    setMobileMenuOpen(false)
                    navigate(it.to)
                  }}
                  disabled={!it.enabled}
                  className={cn(
                    'flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-zinc-200 hover:bg-white/10 disabled:opacity-50',
                  )}
                >
                  <it.icon className="h-4 w-4" />
                  {it.label}
                </button>
              ))}
            </div>
            <div className="mt-auto pt-4">
              <button
                onClick={() => {
                  setMobileMenuOpen(false)
                  setToken(null)
                  navigate(`${base}/login`)
                }}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-zinc-200 hover:bg-white/10"
              >
                <LogOut className="h-4 w-4" />
                Déconnexion
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 py-6 md:grid-cols-[240px_1fr]">
        <aside className="hidden rounded-2xl border border-white/10 bg-white/5 p-3 md:block">
          <Link to={base} className="block rounded-xl px-3 py-3">
            <div className="text-xs uppercase tracking-[0.25em] text-zinc-400">Backoffice</div>
            <div className="mt-1 text-sm font-semibold text-white">{businessId}</div>
          </Link>
          <nav className="mt-2 grid gap-1 text-sm">
            <NavLink
              to={base}
              end
              className={({ isActive }) =>
                cn('flex items-center gap-2 rounded-xl px-3 py-2 text-zinc-200 hover:bg-white/5', isActive && 'bg-white/10 text-white')
              }
            >
              <LayoutGrid className="h-4 w-4" />
              Demandes
            </NavLink>
            <NavLink
              to={`${base}/stats`}
              className={({ isActive }) =>
                cn('flex items-center gap-2 rounded-xl px-3 py-2 text-zinc-200 hover:bg-white/5', isActive && 'bg-white/10 text-white')
              }
            >
              <ChartLine className="h-4 w-4" />
              Stats
            </NavLink>
            <NavLink
              to={`${base}/sites`}
              className={({ isActive }) =>
                cn('flex items-center gap-2 rounded-xl px-3 py-2 text-zinc-200 hover:bg-white/5', isActive && 'bg-white/10 text-white')
              }
            >
              <Monitor className="h-4 w-4" />
              Sites
            </NavLink>
            {canSeeProspection ? (
              <NavLink
                to={`${base}/prospection`}
                className={({ isActive }) =>
                  cn('flex items-center gap-2 rounded-xl px-3 py-2 text-zinc-200 hover:bg-white/5', isActive && 'bg-white/10 text-white')
                }
              >
                <Search className="h-4 w-4" />
                Prospection
              </NavLink>
            ) : null}
            {canSeeCommissions ? (
              <NavLink
                to={`${base}/commissions`}
                className={({ isActive }) =>
                  cn('flex items-center gap-2 rounded-xl px-3 py-2 text-zinc-200 hover:bg-white/5', isActive && 'bg-white/10 text-white')
                }
              >
                <Percent className="h-4 w-4" />
                Commissions
              </NavLink>
            ) : null}
            <NavLink
              to={`${base}/availability`}
              className={({ isActive }) =>
                cn('flex items-center gap-2 rounded-xl px-3 py-2 text-zinc-200 hover:bg-white/5', isActive && 'bg-white/10 text-white')
              }
            >
              <CalendarDays className="h-4 w-4" />
              Disponibilités
            </NavLink>
            <NavLink
              to={`${base}/appointments`}
              className={({ isActive }) =>
                cn('flex items-center gap-2 rounded-xl px-3 py-2 text-zinc-200 hover:bg-white/5', isActive && 'bg-white/10 text-white')
              }
            >
              <CalendarCheck className="h-4 w-4" />
              RDV
            </NavLink>
            <NavLink
              to={`${base}/settings`}
              className={({ isActive }) =>
                cn('flex items-center gap-2 rounded-xl px-3 py-2 text-zinc-200 hover:bg-white/5', isActive && 'bg-white/10 text-white')
              }
            >
              <Settings className="h-4 w-4" />
              Réglages
            </NavLink>
            {canSeeAudits ? (
              <NavLink
                to={`${base}/site-audits`}
                className={({ isActive }) =>
                  cn('flex items-center gap-2 rounded-xl px-3 py-2 text-zinc-200 hover:bg-white/5', isActive && 'bg-white/10 text-white')
                }
              >
                <ScrollText className="h-4 w-4" />
                Audit IA
              </NavLink>
            ) : null}
            <NavLink
              to={`${base}/ab`}
              className={({ isActive }) =>
                cn('flex items-center gap-2 rounded-xl px-3 py-2 text-zinc-200 hover:bg-white/5', isActive && 'bg-white/10 text-white')
              }
            >
              <ScrollText className="h-4 w-4" />
              A/B Tests
            </NavLink>
            {role === 'owner' ? (
              <NavLink
                to={`${base}/audit`}
                className={({ isActive }) =>
                  cn('flex items-center gap-2 rounded-xl px-3 py-2 text-zinc-200 hover:bg-white/5', isActive && 'bg-white/10 text-white')
                }
              >
                <ScrollText className="h-4 w-4" />
                Journal
              </NavLink>
            ) : null}
          </nav>
          <button
            onClick={() => {
              setToken(null)
              navigate(`${base}/login`)
            }}
            className="mt-3 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-zinc-200 hover:bg-white/5"
          >
            <LogOut className="h-4 w-4" />
            Déconnexion
          </button>
        </aside>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 md:p-6 pb-24 md:pb-6">{children}</div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-zinc-950/90 backdrop-blur md:hidden">
        <div
          className={cn(
            'mx-auto grid max-w-6xl gap-1 px-2 py-2 text-[11px] text-zinc-200',
            mobileCols === 10 ? 'grid-cols-10' : mobileCols === 9 ? 'grid-cols-9' : mobileCols === 8 ? 'grid-cols-8' : 'grid-cols-7',
          )}
        >
          <NavLink
            to={base}
            end
            className={({ isActive }) =>
              cn('flex flex-col items-center justify-center gap-1 rounded-xl px-2 py-2', isActive ? 'bg-white text-zinc-950' : 'bg-white/5 text-zinc-200')
            }
          >
            <LayoutGrid className="h-4 w-4" />
            Demandes
          </NavLink>
          <NavLink
            to={`${base}/stats`}
            className={({ isActive }) =>
              cn('flex flex-col items-center justify-center gap-1 rounded-xl px-2 py-2', isActive ? 'bg-white text-zinc-950' : 'bg-white/5 text-zinc-200')
            }
          >
            <ChartLine className="h-4 w-4" />
            Stats
          </NavLink>
          <NavLink
            to={`${base}/sites`}
            className={({ isActive }) =>
              cn('flex flex-col items-center justify-center gap-1 rounded-xl px-2 py-2', isActive ? 'bg-white text-zinc-950' : 'bg-white/5 text-zinc-200')
            }
          >
            <Monitor className="h-4 w-4" />
            Sites
          </NavLink>
          {canSeeProspection ? (
            <NavLink
              to={`${base}/prospection`}
              className={({ isActive }) =>
                cn('flex flex-col items-center justify-center gap-1 rounded-xl px-2 py-2', isActive ? 'bg-white text-zinc-950' : 'bg-white/5 text-zinc-200')
              }
            >
              <Search className="h-4 w-4" />
              Prospection
            </NavLink>
          ) : null}
          {canSeeCommissions ? (
            <NavLink
              to={`${base}/commissions`}
              className={({ isActive }) =>
                cn('flex flex-col items-center justify-center gap-1 rounded-xl px-2 py-2', isActive ? 'bg-white text-zinc-950' : 'bg-white/5 text-zinc-200')
              }
            >
              <Percent className="h-4 w-4" />
              Commis.
            </NavLink>
          ) : null}
          <NavLink
            to={`${base}/availability`}
            className={({ isActive }) =>
              cn('flex flex-col items-center justify-center gap-1 rounded-xl px-2 py-2', isActive ? 'bg-white text-zinc-950' : 'bg-white/5 text-zinc-200')
            }
          >
            <CalendarDays className="h-4 w-4" />
            Dispo
          </NavLink>
          <NavLink
            to={`${base}/appointments`}
            className={({ isActive }) =>
              cn('flex flex-col items-center justify-center gap-1 rounded-xl px-2 py-2', isActive ? 'bg-white text-zinc-950' : 'bg-white/5 text-zinc-200')
            }
          >
            <CalendarCheck className="h-4 w-4" />
            RDV
          </NavLink>
          <NavLink
            to={`${base}/settings`}
            className={({ isActive }) =>
              cn('flex flex-col items-center justify-center gap-1 rounded-xl px-2 py-2', isActive ? 'bg-white text-zinc-950' : 'bg-white/5 text-zinc-200')
            }
          >
            <Settings className="h-4 w-4" />
            Réglages
          </NavLink>
          {canSeeAudits ? (
            <NavLink
              to={`${base}/site-audits`}
              className={({ isActive }) =>
                cn('flex flex-col items-center justify-center gap-1 rounded-xl px-2 py-2', isActive ? 'bg-white text-zinc-950' : 'bg-white/5 text-zinc-200')
              }
            >
              <ScrollText className="h-4 w-4" />
              Audit
            </NavLink>
          ) : null}
          <NavLink
            to={`${base}/ab`}
            className={({ isActive }) =>
              cn('flex flex-col items-center justify-center gap-1 rounded-xl px-2 py-2', isActive ? 'bg-white text-zinc-950' : 'bg-white/5 text-zinc-200')
            }
          >
            <ScrollText className="h-4 w-4" />
            A/B
          </NavLink>
        </div>
      </div>
    </div>
  )
}
