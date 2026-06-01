import { NavLink, useNavigate } from 'react-router-dom'
import { useInternalAuthStore } from '@/store/internalAuthStore'
import { cn } from '@/lib/utils'

type Props = {
  children: React.ReactNode
}

export default function InternalShell({ children }: Props) {
  const navigate = useNavigate()
  const { setToken } = useInternalAuthStore()

  return (
    <div className="min-h-dvh bg-zinc-950 text-zinc-50">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-zinc-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-3">
          <div className="text-xs uppercase tracking-[0.25em] text-zinc-400">Interne</div>
          <nav className="flex flex-wrap items-center gap-1 text-xs">
            <NavLink
              to="/internal/prospection"
              className={({ isActive }) => cn('rounded-lg px-3 py-2 text-zinc-200 hover:bg-white/5', isActive && 'bg-white/10 text-white')}
            >
              Prospection
            </NavLink>
            <NavLink
              to="/internal/inbox"
              className={({ isActive }) => cn('rounded-lg px-3 py-2 text-zinc-200 hover:bg-white/5', isActive && 'bg-white/10 text-white')}
            >
              Inbox
            </NavLink>
            <NavLink
              to="/internal/companies"
              className={({ isActive }) => cn('rounded-lg px-3 py-2 text-zinc-200 hover:bg-white/5', isActive && 'bg-white/10 text-white')}
            >
              Entreprises
            </NavLink>
            <NavLink
              to="/internal/commissions"
              className={({ isActive }) => cn('rounded-lg px-3 py-2 text-zinc-200 hover:bg-white/5', isActive && 'bg-white/10 text-white')}
            >
              Commissions
            </NavLink>
          </nav>
          <button
            type="button"
            onClick={() => {
              setToken(null)
              navigate('/internal/login')
            }}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-zinc-100 hover:bg-white/10"
          >
            Déconnexion
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-6">{children}</main>
    </div>
  )
}

