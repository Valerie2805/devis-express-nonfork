import { Link } from 'react-router-dom'
import { ArrowRight, BadgeCheck, BarChart3, Building2, FileText, Inbox as InboxIcon, LayoutDashboard, MousePointerClick } from 'lucide-react'

export default function Landing() {
  const isDemo = import.meta.env.VITE_DEMO_MODE !== 'false'
  return (
    <div className="relative min-h-dvh overflow-hidden bg-zinc-950 text-zinc-50">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="absolute -right-28 top-10 h-80 w-80 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="absolute bottom-0 left-1/2 h-96 w-[44rem] -translate-x-1/2 rounded-full bg-fuchsia-500/10 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.10),transparent_55%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.15),rgba(0,0,0,0.85))]" />
      </div>

      <div className="relative mx-auto max-w-5xl px-6 py-14 md:py-20">
        <div className="flex flex-col gap-12">
          <div className="flex items-start justify-between gap-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-200">
              <BadgeCheck className="h-4 w-4 text-emerald-300" />
              Machine à Devis
            </div>
            <div className="hidden items-center gap-2 text-xs text-zinc-300 md:flex">
              <MousePointerClick className="h-4 w-4" />
              Démo interactive
            </div>
          </div>

          <div className="grid gap-10 lg:grid-cols-12 lg:items-start">
            <div className="lg:col-span-7">
              <h1 className="text-4xl font-semibold tracking-tight md:text-6xl">
                <span className="block">Générateur de devis</span>
                <span className="mt-2 block bg-gradient-to-r from-zinc-100 via-zinc-100 to-zinc-300 bg-clip-text text-transparent">
                  + backoffice complet
                </span>
              </h1>
              <p className="mt-5 max-w-2xl text-sm leading-7 text-zinc-300 md:text-base md:leading-8">
                {isDemo
                  ? 'Démo MVP : site public, formulaire “Devis 30s”, inbox backoffice et stats. Connexion backoffice : owner / demo (owner) ou emilie / demo (staff).'
                  : 'Site public, formulaire “Devis 30s”, inbox backoffice et stats.'}
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  to="/site/demo-business"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-zinc-950 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                >
                  Ouvrir le site public
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/backoffice/demo-business/login"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                >
                  <LayoutDashboard className="h-4 w-4" />
                  Backoffice
                </Link>
                <Link
                  to="/admin/create"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-zinc-950/40 px-5 py-3 text-sm font-semibold text-zinc-100 hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                >
                  <Building2 className="h-4 w-4" />
                  Créer un business
                </Link>
              </div>

              <div className="mt-6 text-xs text-zinc-400">
                <span className="font-mono">/site/demo-business</span>
                <span className="mx-2 text-white/10">•</span>
                <span className="font-mono">/backoffice/demo-business/login</span>
              </div>
            </div>

            <div className="lg:col-span-5">
              <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_24px_60px_-40px_rgba(0,0,0,0.8)]">
                <div className="text-sm font-semibold text-white">Points clés</div>
                <div className="mt-4 grid gap-3 text-sm text-zinc-300">
                  <div className="flex gap-3 rounded-2xl border border-white/10 bg-zinc-950/30 p-4">
                    <div className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-200">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="font-semibold text-zinc-100">Formulaire “Devis 30s”</div>
                      <div className="mt-1 text-xs leading-6 text-zinc-300">Parcours court, pensé pour convertir.</div>
                    </div>
                  </div>
                  <div className="flex gap-3 rounded-2xl border border-white/10 bg-zinc-950/30 p-4">
                    <div className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-200">
                      <InboxIcon className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="font-semibold text-zinc-100">Inbox + suivi</div>
                      <div className="mt-1 text-xs leading-6 text-zinc-300">Gestion des leads et historique.</div>
                    </div>
                  </div>
                  <div className="flex gap-3 rounded-2xl border border-white/10 bg-zinc-950/30 p-4">
                    <div className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-fuchsia-500/15 text-fuchsia-200">
                      <BarChart3 className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="font-semibold text-zinc-100">Stats & automatisations</div>
                      <div className="mt-1 text-xs leading-6 text-zinc-300">Pilotage, rétention et tâches cron.</div>
                    </div>
                  </div>
                </div>

                {isDemo ? (
                  <div className="mt-6 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-xs text-emerald-100">
                    Identifiants démo : <span className="font-semibold">owner / demo</span> (owner) ou{' '}
                    <span className="font-semibold">emilie / demo</span> (staff)
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-white/10 pt-8 text-xs text-zinc-400 md:flex-row md:items-center md:justify-between">
            <div>DevisExpress</div>
            <div className="text-zinc-500">React • Vite • Express • SQLite/Postgres</div>
          </div>
        </div>
      </div>
    </div>
  )
}
