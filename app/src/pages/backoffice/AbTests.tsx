import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import BackofficeShell from '@/components/backoffice/BackofficeShell'
import BackButton from '@/components/BackButton'
import { apiFetch, authHeaders } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

const EXP_KEYS = ['hero', 'services', 'zones', 'tarifs', 'quote_form'] as const
type ExpKey = (typeof EXP_KEYS)[number]

function deepMerge(base: any, override: any): any {
  if (override === null || override === undefined) return base
  if (Array.isArray(override)) return override
  if (typeof override !== 'object' || typeof base !== 'object' || base === null || Array.isArray(base)) return override
  const out: any = { ...base }
  for (const [k, v] of Object.entries(override)) out[k] = deepMerge(base?.[k], v)
  return out
}

export default function AbTests() {
  const { businessId = '' } = useParams()
  const { token } = useAuthStore()
  const [config, setConfig] = useState<any>(null)
  const [stats, setStats] = useState<any>(null)
  const [site, setSite] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expCfg, setExpCfg] = useState<Record<string, any>>({})
  const [draft, setDraft] = useState<any>(null)
  const draftReady = useMemo(() => draft && typeof draft === 'object', [draft])
  const [heroBLoading, setHeroBLoading] = useState(false)
  const [heroBError, setHeroBError] = useState<string | null>(null)
  const [heroB, setHeroB] = useState<{ mode: 'rules' | 'ai'; h1: string; subtitle: string; ctas?: string[] } | null>(null)
  const [applyWinnerLoading, setApplyWinnerLoading] = useState(false)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.all([
      apiFetch<{ config: any }>(`/api/v1/backoffice/${businessId}/settings`, { headers: { ...authHeaders(token) } }),
      apiFetch<any>(`/api/v1/backoffice/${businessId}/dashboard?range=last_7_days`, { headers: { ...authHeaders(token) } }),
      apiFetch<any>(`/api/v1/site/${businessId}/config`),
    ])
      .then(([c, d, s]) => {
        if (!alive) return
        setConfig(c.config)
        setStats(d)
        setSite(s)

        const raw = (c.config?.settings?.ab_tests?.experiments || {}) as any
        const legacyHero = c.config?.settings?.ab_tests?.hero_variant
        const next: Record<string, any> = {}
        for (const k of EXP_KEYS) {
          const cur = raw?.[k] && typeof raw[k] === 'object' ? raw[k] : {}
          const version = Number.isFinite(Number(cur.version)) ? Number(cur.version) : 1
          const id = typeof cur.id === 'string' && cur.id.trim() ? cur.id.trim() : `${k}_v${version}`
          const forced = k === 'hero' && (legacyHero === 'A' || legacyHero === 'B') ? legacyHero : cur.forced_variant
          const forced_variant = forced === 'A' || forced === 'B' ? forced : null
          const allocationA = Number(cur?.allocation?.A)
          next[k] = {
            enabled: cur.enabled === false ? false : true,
            version,
            id,
            forced_variant,
            allocation: {
              A: Number.isFinite(allocationA) && allocationA >= 0 && allocationA <= 1 ? allocationA : 0.5,
            },
          }
        }
        setExpCfg(next)
        setError(null)
      })
      .catch((e) => {
        if (!alive) return
        setError(e instanceof Error ? e.message : 'Erreur')
      })
      .finally(() => {
        if (!alive) return
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [businessId, token])

  useEffect(() => {
    if (!site || draftReady) return
    const sc = site?.content?.site_copy || {}
    const tc = site?.content?.tarifs_common || {}
    const t = site?.content?.tarifs || {}

    const heroB = sc?.hero?.variants?.B || {}
    const servicesBIntro = sc?.pages?.services?.page_intro?.variants?.B || {}
    const servicesBCta = sc?.pages?.services?.quote_form_cta?.variants?.B || {}
    const zonesBIntro = sc?.pages?.zones?.page_intro?.variants?.B || {}
    const zonesBCta = sc?.pages?.zones?.quote_form_cta?.variants?.B || {}
    const qfHomeB = sc?.pages?.home?.quote_form?.variants?.B || {}
    const qfTarifsB = tc?.page?.sections?.quote_form?.variants?.B || {}
    const tarifsHeroB = tc?.page?.hero?.variants?.B || {}
    const tarifsCtaB = tc?.page?.sections?.quote_form_cta?.variants?.B || {}
    const tarifsTradeHeroB = t?.hero?.variants?.B || {}

    setDraft({
      hero: {
        h1: String(heroB.h1 || ''),
        subtitle: String(heroB.subtitle || ''),
        ctas: Array.isArray(heroB.ctas) ? heroB.ctas.map((x: any) => String(x)).slice(0, 3) : [],
      },
      services: {
        headline: String(servicesBIntro.headline || ''),
        subtitle: String(servicesBIntro.subtitle || ''),
        cta_text: String(servicesBCta.text || ''),
        cta: String(servicesBCta.cta || ''),
      },
      zones: {
        headline: String(zonesBIntro.headline || ''),
        subtitle: String(zonesBIntro.subtitle || ''),
        cta_text: String(zonesBCta.text || ''),
        cta: String(zonesBCta.cta || ''),
      },
      quote_form: {
        title: String(qfHomeB.title || ''),
        subtitle: String(qfHomeB.subtitle || ''),
        tarifs_title: String(qfTarifsB.title || ''),
        tarifs_subtitle: String(qfTarifsB.subtitle || ''),
      },
      tarifs: {
        common_h1: String(tarifsHeroB.h1 || ''),
        common_subtitle: String(tarifsHeroB.subtitle || ''),
        common_ctas: Array.isArray(tarifsHeroB.ctas) ? tarifsHeroB.ctas.map((x: any) => String(x)).slice(0, 3) : [],
        cta_text: String(tarifsCtaB.text || ''),
        cta: String(tarifsCtaB.cta || ''),
        trade_h1: String(tarifsTradeHeroB.h1 || ''),
        trade_subtitle: String(tarifsTradeHeroB.subtitle || ''),
      },
    })
  }, [site, draftReady])

  function buildExperiments(from: any) {
    return Object.fromEntries(
      EXP_KEYS.map((k) => [
        k,
        {
          enabled: from?.[k]?.enabled === false ? false : true,
          version: Number(from?.[k]?.version || 1),
          id: String(from?.[k]?.id || `${k}_v${Number(from?.[k]?.version || 1)}`),
          forced_variant: from?.[k]?.forced_variant === 'A' || from?.[k]?.forced_variant === 'B' ? from[k].forced_variant : null,
          allocation: { A: Number(from?.[k]?.allocation?.A ?? 0.5) },
        },
      ]),
    )
  }

  async function saveExperiments() {
    setSaving(true)
    try {
      const experiments = buildExperiments(expCfg)
      const next = await apiFetch<{ config: any }>(`/api/v1/backoffice/${businessId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({
          settings: {
            ...(config?.settings || {}),
            ab_tests: {
              ...(config?.settings?.ab_tests || {}),
              hero_variant: null,
              experiments,
            },
          },
        }),
      })
      setConfig(next.config)
    } finally {
      setSaving(false)
    }
  }

  async function refresh() {
    const [d, s] = await Promise.all([
      apiFetch<any>(`/api/v1/backoffice/${businessId}/dashboard?range=last_7_days`, { headers: { ...authHeaders(token) } }),
      apiFetch<any>(`/api/v1/site/${businessId}/config`),
    ])
    setStats(d)
    setSite(s)
  }

  async function publishExperiment(key: ExpKey, overrides: { site_copy_override?: any; tarifs_common_override?: any; tarifs_override?: any }) {
    setSaving(true)
    try {
      const cur = expCfg?.[key] || {}
      const nextV = Number(cur.version || 1) + 1
      const nextExpCfg = { ...(expCfg || {}), [key]: { ...cur, version: nextV, id: `${key}_v${nextV}`, forced_variant: null } }
      const experiments = buildExperiments(nextExpCfg)

      const body: any = {
        settings: {
          ...(config?.settings || {}),
          ab_tests: {
            ...(config?.settings?.ab_tests || {}),
            hero_variant: null,
            experiments,
          },
        },
      }
      if (overrides.site_copy_override) body.site_copy_override = overrides.site_copy_override
      if (overrides.tarifs_common_override) body.tarifs_common_override = overrides.tarifs_common_override
      if (overrides.tarifs_override) body.tarifs_override = overrides.tarifs_override

      const next = await apiFetch<{ config: any }>(`/api/v1/backoffice/${businessId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify(body),
      })
      setConfig(next.config)
      setExpCfg(nextExpCfg)
      await refresh()
    } finally {
      setSaving(false)
    }
  }

  async function forceWinner(key: ExpKey) {
    const sig = stats?.experiments?.[key]?.significance
    const winner = sig?.winner === 'A' || sig?.winner === 'B' ? sig.winner : null
    if (!winner || !sig?.significant) return
    setSaving(true)
    try {
      const nextExpCfg = { ...(expCfg || {}), [key]: { ...(expCfg?.[key] || {}), forced_variant: winner } }
      const experiments = buildExperiments(nextExpCfg)
      const next = await apiFetch<{ config: any }>(`/api/v1/backoffice/${businessId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({
          settings: {
            ...(config?.settings || {}),
            ab_tests: {
              ...(config?.settings?.ab_tests || {}),
              hero_variant: null,
              experiments,
            },
          },
        }),
      })
      setConfig(next.config)
      setExpCfg(nextExpCfg)
      await refresh()
    } finally {
      setSaving(false)
    }
  }

  async function generateHeroB() {
    setHeroBLoading(true)
    setHeroBError(null)
    try {
      const out = await apiFetch<{ mode: 'rules' | 'ai'; h1: string; subtitle: string; ctas?: string[] }>(`/api/v1/backoffice/${businessId}/ai/hero_variant_b`, {
        method: 'POST',
        headers: { ...authHeaders(token) },
      })
      setHeroB(out)
    } catch (e) {
      setHeroBError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setHeroBLoading(false)
    }
  }

  async function applyHeroB() {
    if (!heroB) return
    setSaving(true)
    try {
      const nextOverride = {
        ...(config?.site_copy_override || {}),
        hero: {
          ...((config?.site_copy_override || {})?.hero || {}),
          variants: {
            ...(((config?.site_copy_override || {})?.hero || {})?.variants || {}),
            B: {
              ...(((((config?.site_copy_override || {})?.hero || {})?.variants || {}) as any)?.B || {}),
              h1: heroB.h1,
              subtitle: heroB.subtitle,
              ...(Array.isArray(heroB.ctas) && heroB.ctas.length === 3 ? { ctas: heroB.ctas } : {}),
            },
          },
        },
      }

      const nextExpCfg = {
        ...(expCfg || {}),
        hero: { ...(expCfg?.hero || {}), version: Number(expCfg?.hero?.version || 1) + 1, id: `hero_v${Number(expCfg?.hero?.version || 1) + 1}` },
      }
      const experiments = buildExperiments(nextExpCfg)

      const next = await apiFetch<{ config: any }>(`/api/v1/backoffice/${businessId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({
          site_copy_override: nextOverride,
          settings: {
            ...(config?.settings || {}),
            ab_tests: {
              ...(config?.settings?.ab_tests || {}),
              hero_variant: null,
              experiments,
            },
          },
        }),
      })
      setConfig(next.config)
      setExpCfg(nextExpCfg)
    } finally {
      setSaving(false)
    }
  }

  async function applyWinner() {
    const sig = stats?.ab_significance?.hero
    const winner = sig?.winner === 'A' || sig?.winner === 'B' ? sig.winner : null
    if (!winner || !sig?.significant) return
    setApplyWinnerLoading(true)
    try {
      const nextExpCfg = { ...(expCfg || {}), hero: { ...(expCfg?.hero || {}), forced_variant: winner } }
      const experiments = buildExperiments(nextExpCfg)
      const next = await apiFetch<{ config: any }>(`/api/v1/backoffice/${businessId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({
          settings: {
            ...(config?.settings || {}),
            ab_tests: {
              ...(config?.settings?.ab_tests || {}),
              hero_variant: null,
              experiments,
            },
          },
        }),
      })
      setConfig(next.config)
      setExpCfg(nextExpCfg)
    } finally {
      setApplyWinnerLoading(false)
    }
  }

  async function exportCsv() {
    setExporting(true)
    try {
      const res = await fetch(`/api/v1/backoffice/${businessId}/dashboard?range=last_7_days&format=csv`, { headers: { ...authHeaders(token) } })
      const text = await res.text()
      if (!res.ok) throw new Error(text || `HTTP ${res.status}`)
      const blob = new Blob([text], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `ab_${businessId}_last_7_days.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  return (
    <BackofficeShell businessId={businessId}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <BackButton fallbackTo={`/backoffice/${businessId}`} />
          <div>
            <div className="text-lg font-semibold text-white">A/B Tests</div>
            <div className="mt-1 text-xs text-zinc-300">Hero A/B + mesure simple sur 7 jours.</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportCsv}
            disabled={exporting}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white hover:bg-white/10 disabled:opacity-60"
          >
            {exporting ? 'Export…' : 'Exporter CSV'}
          </button>
          <Link to={`/site/${businessId}`} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white hover:bg-white/10">
            Voir le site
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="mt-8 text-sm text-zinc-300">Chargement…</div>
      ) : error ? (
        <div className="mt-8 text-sm text-rose-200">{error}</div>
      ) : (
        <div className="mt-6 grid gap-4">
          <div className="rounded-2xl border border-white/10 bg-zinc-950/40 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-white">Expériences</div>
                <div className="mt-1 text-xs text-zinc-300">Forcer, activer, relancer (version), et définir un split.</div>
              </div>
              <button
                onClick={saveExperiments}
                disabled={saving}
                className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-zinc-100 disabled:opacity-60"
              >
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>

            <div className="mt-4 grid gap-2">
              {EXP_KEYS.map((k) => (
                <div key={k} className="grid gap-2 rounded-xl border border-white/10 bg-white/5 p-3 md:grid-cols-[140px_110px_140px_120px_1fr] md:items-center">
                  <div className="text-sm font-semibold text-white">{k}</div>
                  <label className="flex items-center gap-2 text-xs text-zinc-300">
                    <input
                      type="checkbox"
                      checked={expCfg?.[k]?.enabled !== false}
                      onChange={(e) => setExpCfg((p) => ({ ...(p || {}), [k]: { ...(p?.[k] || {}), enabled: e.target.checked } }))}
                    />
                    Actif
                  </label>
                  <label className="grid gap-1 text-xs text-zinc-300">
                    Forcer
                    <select
                      value={expCfg?.[k]?.forced_variant === 'A' || expCfg?.[k]?.forced_variant === 'B' ? expCfg[k].forced_variant : 'auto'}
                      onChange={(e) =>
                        setExpCfg((p) => ({
                          ...(p || {}),
                          [k]: { ...(p?.[k] || {}), forced_variant: e.target.value === 'A' || e.target.value === 'B' ? e.target.value : null },
                        }))
                      }
                      className="h-9 rounded-xl border border-white/10 bg-zinc-950/40 px-3 text-sm text-white outline-none focus:border-white/25"
                    >
                      <option value="auto" className="bg-zinc-950">
                        Auto
                      </option>
                      <option value="A" className="bg-zinc-950">
                        A
                      </option>
                      <option value="B" className="bg-zinc-950">
                        B
                      </option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs text-zinc-300">
                    Split A
                    <input
                      value={String(expCfg?.[k]?.allocation?.A ?? 0.5)}
                      onChange={(e) => {
                        const n = Number(e.target.value)
                        const v = Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.5
                        setExpCfg((p) => ({ ...(p || {}), [k]: { ...(p?.[k] || {}), allocation: { ...(p?.[k]?.allocation || {}), A: v } } }))
                      }}
                      inputMode="decimal"
                      className="h-9 rounded-xl border border-white/10 bg-zinc-950/40 px-3 text-sm text-white outline-none focus:border-white/25"
                    />
                  </label>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-300">
                    <div>
                      v{Number(expCfg?.[k]?.version || 1)} · {String(expCfg?.[k]?.id || '')}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {stats?.experiments?.[k]?.significance?.significant ? (
                        <button
                          onClick={() => void forceWinner(k)}
                          disabled={saving}
                          className="rounded-xl border border-emerald-300/20 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/15 disabled:opacity-60"
                        >
                          Forcer winner
                        </button>
                      ) : null}
                      <button
                        onClick={() =>
                          setExpCfg((p) => {
                            const cur = p?.[k] || {}
                            const nextV = Number(cur.version || 1) + 1
                            return { ...(p || {}), [k]: { ...cur, version: nextV, id: `${k}_v${nextV}`, forced_variant: null } }
                          })
                        }
                        className="rounded-xl border border-white/10 bg-zinc-950/40 px-3 py-2 text-xs font-semibold text-white hover:bg-white/5"
                      >
                        Nouvelle version
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 text-[11px] text-zinc-400">
              Overrides: <span className="text-zinc-200">?ab_hero=A</span> / <span className="text-zinc-200">?ab_services=B</span> … (legacy: <span className="text-zinc-200">?hero=A</span>)
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-zinc-950/40 p-5">
            <div className="text-sm font-semibold text-white">Variante B (reco IA optionnelle)</div>
            <div className="mt-1 text-xs text-zinc-300">Génère une proposition puis applique-la seulement si tu veux.</div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                onClick={generateHeroB}
                disabled={heroBLoading}
                className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-zinc-100 disabled:opacity-60"
              >
                {heroBLoading ? 'Génération…' : 'Générer'}
              </button>
              {heroB ? (
                <button
                  onClick={applyHeroB}
                  disabled={saving}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-60"
                >
                  Appliquer
                </button>
              ) : null}
              <Link
                to={`/site/${businessId}?hero=B`}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white hover:bg-white/10"
              >
                Voir B
              </Link>
            </div>
            {heroBError ? <div className="mt-3 text-xs text-rose-200">{heroBError}</div> : null}
            {heroB ? (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs uppercase tracking-wider text-zinc-400">H1</div>
                  <div className="mt-2 text-sm text-white">{heroB.h1}</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs uppercase tracking-wider text-zinc-400">Subtitle</div>
                  <div className="mt-2 text-sm text-white">{heroB.subtitle}</div>
                </div>
                {Array.isArray(heroB.ctas) && heroB.ctas.length ? (
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4 md:col-span-2">
                    <div className="text-xs uppercase tracking-wider text-zinc-400">CTA</div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-200">
                      {heroB.ctas.map((c) => (
                        <div key={c} className="rounded-full border border-white/10 bg-zinc-950/40 px-3 py-1">
                          {c}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="mt-3 text-[11px] text-zinc-400">
              Sans config IA, une suggestion “rules” est générée depuis métier/ville/zone.
            </div>
          </div>

          {!draftReady ? null : (
            <div className="rounded-2xl border border-white/10 bg-zinc-950/40 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-white">Éditeur variantes (B)</div>
                  <div className="mt-1 text-xs text-zinc-300">Édite la copie B puis publie (bump version + relance le split).</div>
                </div>
                <Link to={`/site/${businessId}`} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white hover:bg-white/10">
                  Preview
                </Link>
              </div>

              <div className="mt-4 grid gap-4">
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs uppercase tracking-wider text-zinc-400">Hero</div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <label className="grid gap-1 text-xs text-zinc-300 md:col-span-2">
                      H1
                      <input
                        value={draft.hero.h1}
                        onChange={(e) => setDraft((p: any) => ({ ...p, hero: { ...p.hero, h1: e.target.value } }))}
                        className="h-10 rounded-xl border border-white/10 bg-zinc-950/40 px-3 text-sm text-white outline-none focus:border-white/25"
                      />
                    </label>
                    <label className="grid gap-1 text-xs text-zinc-300 md:col-span-2">
                      Subtitle
                      <input
                        value={draft.hero.subtitle}
                        onChange={(e) => setDraft((p: any) => ({ ...p, hero: { ...p.hero, subtitle: e.target.value } }))}
                        className="h-10 rounded-xl border border-white/10 bg-zinc-950/40 px-3 text-sm text-white outline-none focus:border-white/25"
                      />
                    </label>
                    {[0, 1, 2].map((i) => (
                      <label key={i} className="grid gap-1 text-xs text-zinc-300">
                        CTA {i + 1}
                        <input
                          value={String(draft.hero.ctas?.[i] || '')}
                          onChange={(e) =>
                            setDraft((p: any) => {
                              const next = Array.isArray(p.hero.ctas) ? [...p.hero.ctas] : []
                              next[i] = e.target.value
                              return { ...p, hero: { ...p.hero, ctas: next } }
                            })
                          }
                          className="h-10 rounded-xl border border-white/10 bg-zinc-950/40 px-3 text-sm text-white outline-none focus:border-white/25"
                        />
                      </label>
                    ))}
                    <div className="flex items-end justify-end md:col-span-2">
                      <button
                        onClick={() => {
                          const h1 = String(draft?.hero?.h1 || '').trim()
                          const subtitle = String(draft?.hero?.subtitle || '').trim()
                          const ctas = Array.isArray(draft?.hero?.ctas) ? draft.hero.ctas.map((x: any) => String(x).trim()).slice(0, 3) : []
                          setDraft((p: any) => ({ ...p, hero: { ...p.hero, h1, subtitle, ctas } }))
                          const patch = {
                            hero: { variants: { B: { h1, subtitle, ctas } } },
                          }
                          const nextOverride = deepMerge(config?.site_copy_override || {}, patch)
                          void publishExperiment('hero', { site_copy_override: nextOverride })
                        }}
                        disabled={saving}
                        className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-zinc-100 disabled:opacity-60"
                      >
                        Publier hero B
                      </button>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs uppercase tracking-wider text-zinc-400">Services</div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <label className="grid gap-1 text-xs text-zinc-300">
                      Headline
                      <input
                        value={draft.services.headline}
                        onChange={(e) => setDraft((p: any) => ({ ...p, services: { ...p.services, headline: e.target.value } }))}
                        className="h-10 rounded-xl border border-white/10 bg-zinc-950/40 px-3 text-sm text-white outline-none focus:border-white/25"
                      />
                    </label>
                    <label className="grid gap-1 text-xs text-zinc-300">
                      Subtitle
                      <input
                        value={draft.services.subtitle}
                        onChange={(e) => setDraft((p: any) => ({ ...p, services: { ...p.services, subtitle: e.target.value } }))}
                        className="h-10 rounded-xl border border-white/10 bg-zinc-950/40 px-3 text-sm text-white outline-none focus:border-white/25"
                      />
                    </label>
                    <label className="grid gap-1 text-xs text-zinc-300">
                      Bandeau texte
                      <input
                        value={draft.services.cta_text}
                        onChange={(e) => setDraft((p: any) => ({ ...p, services: { ...p.services, cta_text: e.target.value } }))}
                        className="h-10 rounded-xl border border-white/10 bg-zinc-950/40 px-3 text-sm text-white outline-none focus:border-white/25"
                      />
                    </label>
                    <label className="grid gap-1 text-xs text-zinc-300">
                      Bandeau CTA
                      <input
                        value={draft.services.cta}
                        onChange={(e) => setDraft((p: any) => ({ ...p, services: { ...p.services, cta: e.target.value } }))}
                        className="h-10 rounded-xl border border-white/10 bg-zinc-950/40 px-3 text-sm text-white outline-none focus:border-white/25"
                      />
                    </label>
                    <div className="flex items-end justify-end md:col-span-2">
                      <button
                        onClick={() => {
                          const headline = String(draft?.services?.headline || '').trim()
                          const subtitle = String(draft?.services?.subtitle || '').trim()
                          const cta_text = String(draft?.services?.cta_text || '').trim()
                          const cta = String(draft?.services?.cta || '').trim()
                          setDraft((p: any) => ({ ...p, services: { ...p.services, headline, subtitle, cta_text, cta } }))
                          const patch = {
                            pages: {
                              services: {
                                page_intro: { variants: { B: { headline, subtitle } } },
                                quote_form_cta: { variants: { B: { text: cta_text, cta } } },
                              },
                            },
                          }
                          const nextOverride = deepMerge(config?.site_copy_override || {}, patch)
                          void publishExperiment('services', { site_copy_override: nextOverride })
                        }}
                        disabled={saving}
                        className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-zinc-100 disabled:opacity-60"
                      >
                        Publier services B
                      </button>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs uppercase tracking-wider text-zinc-400">Zones</div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <label className="grid gap-1 text-xs text-zinc-300">
                      Headline
                      <input
                        value={draft.zones.headline}
                        onChange={(e) => setDraft((p: any) => ({ ...p, zones: { ...p.zones, headline: e.target.value } }))}
                        className="h-10 rounded-xl border border-white/10 bg-zinc-950/40 px-3 text-sm text-white outline-none focus:border-white/25"
                      />
                    </label>
                    <label className="grid gap-1 text-xs text-zinc-300">
                      Subtitle
                      <input
                        value={draft.zones.subtitle}
                        onChange={(e) => setDraft((p: any) => ({ ...p, zones: { ...p.zones, subtitle: e.target.value } }))}
                        className="h-10 rounded-xl border border-white/10 bg-zinc-950/40 px-3 text-sm text-white outline-none focus:border-white/25"
                      />
                    </label>
                    <label className="grid gap-1 text-xs text-zinc-300">
                      Bandeau texte
                      <input
                        value={draft.zones.cta_text}
                        onChange={(e) => setDraft((p: any) => ({ ...p, zones: { ...p.zones, cta_text: e.target.value } }))}
                        className="h-10 rounded-xl border border-white/10 bg-zinc-950/40 px-3 text-sm text-white outline-none focus:border-white/25"
                      />
                    </label>
                    <label className="grid gap-1 text-xs text-zinc-300">
                      Bandeau CTA
                      <input
                        value={draft.zones.cta}
                        onChange={(e) => setDraft((p: any) => ({ ...p, zones: { ...p.zones, cta: e.target.value } }))}
                        className="h-10 rounded-xl border border-white/10 bg-zinc-950/40 px-3 text-sm text-white outline-none focus:border-white/25"
                      />
                    </label>
                    <div className="flex items-end justify-end md:col-span-2">
                      <button
                        onClick={() => {
                          const headline = String(draft?.zones?.headline || '').trim()
                          const subtitle = String(draft?.zones?.subtitle || '').trim()
                          const cta_text = String(draft?.zones?.cta_text || '').trim()
                          const cta = String(draft?.zones?.cta || '').trim()
                          setDraft((p: any) => ({ ...p, zones: { ...p.zones, headline, subtitle, cta_text, cta } }))
                          const patch = {
                            pages: {
                              zones: {
                                page_intro: { variants: { B: { headline, subtitle } } },
                                quote_form_cta: { variants: { B: { text: cta_text, cta } } },
                              },
                            },
                          }
                          const nextOverride = deepMerge(config?.site_copy_override || {}, patch)
                          void publishExperiment('zones', { site_copy_override: nextOverride })
                        }}
                        disabled={saving}
                        className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-zinc-100 disabled:opacity-60"
                      >
                        Publier zones B
                      </button>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs uppercase tracking-wider text-zinc-400">Formulaire</div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <label className="grid gap-1 text-xs text-zinc-300">
                      Title (site)
                      <input
                        value={draft.quote_form.title}
                        onChange={(e) => setDraft((p: any) => ({ ...p, quote_form: { ...p.quote_form, title: e.target.value } }))}
                        className="h-10 rounded-xl border border-white/10 bg-zinc-950/40 px-3 text-sm text-white outline-none focus:border-white/25"
                      />
                    </label>
                    <label className="grid gap-1 text-xs text-zinc-300">
                      Subtitle (site)
                      <input
                        value={draft.quote_form.subtitle}
                        onChange={(e) => setDraft((p: any) => ({ ...p, quote_form: { ...p.quote_form, subtitle: e.target.value } }))}
                        className="h-10 rounded-xl border border-white/10 bg-zinc-950/40 px-3 text-sm text-white outline-none focus:border-white/25"
                      />
                    </label>
                    <label className="grid gap-1 text-xs text-zinc-300">
                      Title (tarifs)
                      <input
                        value={draft.quote_form.tarifs_title}
                        onChange={(e) => setDraft((p: any) => ({ ...p, quote_form: { ...p.quote_form, tarifs_title: e.target.value } }))}
                        className="h-10 rounded-xl border border-white/10 bg-zinc-950/40 px-3 text-sm text-white outline-none focus:border-white/25"
                      />
                    </label>
                    <label className="grid gap-1 text-xs text-zinc-300">
                      Subtitle (tarifs)
                      <input
                        value={draft.quote_form.tarifs_subtitle}
                        onChange={(e) => setDraft((p: any) => ({ ...p, quote_form: { ...p.quote_form, tarifs_subtitle: e.target.value } }))}
                        className="h-10 rounded-xl border border-white/10 bg-zinc-950/40 px-3 text-sm text-white outline-none focus:border-white/25"
                      />
                    </label>
                    <div className="flex items-end justify-end md:col-span-2">
                      <button
                        onClick={() => {
                          const title = String(draft?.quote_form?.title || '').trim()
                          const subtitle = String(draft?.quote_form?.subtitle || '').trim()
                          const tarifs_title = String(draft?.quote_form?.tarifs_title || '').trim()
                          const tarifs_subtitle = String(draft?.quote_form?.tarifs_subtitle || '').trim()
                          setDraft((p: any) => ({ ...p, quote_form: { ...p.quote_form, title, subtitle, tarifs_title, tarifs_subtitle } }))
                          const patch = {
                            pages: {
                              home: { quote_form: { variants: { B: { title, subtitle } } } },
                              services: { quote_form: { variants: { B: { title, subtitle } } } },
                              zones: { quote_form: { variants: { B: { title, subtitle } } } },
                            },
                          }
                          const nextSiteCopy = deepMerge(config?.site_copy_override || {}, patch)
                          const nextTarifsCommon = deepMerge(config?.tarifs_common_override || {}, {
                            page: { sections: { quote_form: { variants: { B: { title: tarifs_title, subtitle: tarifs_subtitle } } } } },
                          })
                          void publishExperiment('quote_form', { site_copy_override: nextSiteCopy, tarifs_common_override: nextTarifsCommon })
                        }}
                        disabled={saving}
                        className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-zinc-100 disabled:opacity-60"
                      >
                        Publier formulaire B
                      </button>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs uppercase tracking-wider text-zinc-400">Tarifs</div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <label className="grid gap-1 text-xs text-zinc-300 md:col-span-2">
                      Hero h1 (common)
                      <input
                        value={draft.tarifs.common_h1}
                        onChange={(e) => setDraft((p: any) => ({ ...p, tarifs: { ...p.tarifs, common_h1: e.target.value } }))}
                        className="h-10 rounded-xl border border-white/10 bg-zinc-950/40 px-3 text-sm text-white outline-none focus:border-white/25"
                      />
                    </label>
                    <label className="grid gap-1 text-xs text-zinc-300 md:col-span-2">
                      Hero subtitle (common)
                      <input
                        value={draft.tarifs.common_subtitle}
                        onChange={(e) => setDraft((p: any) => ({ ...p, tarifs: { ...p.tarifs, common_subtitle: e.target.value } }))}
                        className="h-10 rounded-xl border border-white/10 bg-zinc-950/40 px-3 text-sm text-white outline-none focus:border-white/25"
                      />
                    </label>
                    {[0, 1, 2].map((i) => (
                      <label key={i} className="grid gap-1 text-xs text-zinc-300">
                        CTA {i + 1}
                        <input
                          value={String(draft.tarifs.common_ctas?.[i] || '')}
                          onChange={(e) =>
                            setDraft((p: any) => {
                              const next = Array.isArray(p.tarifs.common_ctas) ? [...p.tarifs.common_ctas] : []
                              next[i] = e.target.value
                              return { ...p, tarifs: { ...p.tarifs, common_ctas: next } }
                            })
                          }
                          className="h-10 rounded-xl border border-white/10 bg-zinc-950/40 px-3 text-sm text-white outline-none focus:border-white/25"
                        />
                      </label>
                    ))}
                    <label className="grid gap-1 text-xs text-zinc-300">
                      Bandeau texte
                      <input
                        value={draft.tarifs.cta_text}
                        onChange={(e) => setDraft((p: any) => ({ ...p, tarifs: { ...p.tarifs, cta_text: e.target.value } }))}
                        className="h-10 rounded-xl border border-white/10 bg-zinc-950/40 px-3 text-sm text-white outline-none focus:border-white/25"
                      />
                    </label>
                    <label className="grid gap-1 text-xs text-zinc-300">
                      Bandeau CTA
                      <input
                        value={draft.tarifs.cta}
                        onChange={(e) => setDraft((p: any) => ({ ...p, tarifs: { ...p.tarifs, cta: e.target.value } }))}
                        className="h-10 rounded-xl border border-white/10 bg-zinc-950/40 px-3 text-sm text-white outline-none focus:border-white/25"
                      />
                    </label>
                    <label className="grid gap-1 text-xs text-zinc-300 md:col-span-2">
                      Hero h1 (métier)
                      <input
                        value={draft.tarifs.trade_h1}
                        onChange={(e) => setDraft((p: any) => ({ ...p, tarifs: { ...p.tarifs, trade_h1: e.target.value } }))}
                        className="h-10 rounded-xl border border-white/10 bg-zinc-950/40 px-3 text-sm text-white outline-none focus:border-white/25"
                      />
                    </label>
                    <label className="grid gap-1 text-xs text-zinc-300 md:col-span-2">
                      Hero subtitle (métier)
                      <input
                        value={draft.tarifs.trade_subtitle}
                        onChange={(e) => setDraft((p: any) => ({ ...p, tarifs: { ...p.tarifs, trade_subtitle: e.target.value } }))}
                        className="h-10 rounded-xl border border-white/10 bg-zinc-950/40 px-3 text-sm text-white outline-none focus:border-white/25"
                      />
                    </label>
                    <div className="flex items-end justify-end md:col-span-2">
                      <button
                        onClick={() => {
                          const common_h1 = String(draft?.tarifs?.common_h1 || '').trim()
                          const common_subtitle = String(draft?.tarifs?.common_subtitle || '').trim()
                          const cta_text = String(draft?.tarifs?.cta_text || '').trim()
                          const cta = String(draft?.tarifs?.cta || '').trim()
                          const trade_h1 = String(draft?.tarifs?.trade_h1 || '').trim()
                          const trade_subtitle = String(draft?.tarifs?.trade_subtitle || '').trim()
                          const common_ctas = Array.isArray(draft?.tarifs?.common_ctas) ? draft.tarifs.common_ctas.map((x: any) => String(x).trim()).slice(0, 3) : []
                          setDraft((p: any) => ({ ...p, tarifs: { ...p.tarifs, common_h1, common_subtitle, cta_text, cta, trade_h1, trade_subtitle, common_ctas } }))
                          const nextTarifsCommon = deepMerge(config?.tarifs_common_override || {}, {
                            page: {
                              hero: { variants: { B: { h1: common_h1, subtitle: common_subtitle, ctas: common_ctas } } },
                              sections: { quote_form_cta: { variants: { B: { text: cta_text, cta } } } },
                            },
                          })
                          const nextTarifs = deepMerge(config?.tarifs_override || {}, { hero: { variants: { B: { h1: trade_h1, subtitle: trade_subtitle } } } })
                          void publishExperiment('tarifs', { tarifs_common_override: nextTarifsCommon, tarifs_override: nextTarifs })
                        }}
                        disabled={saving}
                        className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-zinc-100 disabled:opacity-60"
                      >
                        Publier tarifs B
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-white/10 bg-zinc-950/40 p-5">
            <div className="text-sm font-semibold text-white">Résultats (7 jours)</div>
            {!stats?.ab_hero?.by_variant ? (
              <div className="mt-3 text-xs text-zinc-400">Pas encore de données.</div>
            ) : (
              <div className="mt-4 grid gap-2 text-sm text-zinc-200 md:grid-cols-2">
                {(['A', 'B'] as const).map((v) => (
                  <div key={v} className="rounded-xl bg-white/5 px-3 py-3">
                    <div className="text-xs text-zinc-400">Variante {v}</div>
                    <div className="mt-2 grid gap-1 text-xs text-zinc-300">
                      <div>Vues hero : <span className="text-white">{stats.ab_hero.by_variant?.[v]?.view_hero ?? 0}</span></div>
                      <div>Clics appel : <span className="text-white">{stats.ab_hero.by_variant?.[v]?.click_call ?? 0}</span></div>
                      <div>Clics WhatsApp : <span className="text-white">{stats.ab_hero.by_variant?.[v]?.click_whatsapp ?? 0}</span></div>
                      <div>Ouvertures devis : <span className="text-white">{stats.ab_hero.by_variant?.[v]?.open_quote_form ?? 0}</span></div>
                      <div>Formulaires : <span className="text-white">{stats.ab_hero.by_variant?.[v]?.submit_quote_form ?? 0}</span></div>
                      <div>
                        Conv. (formulaire / vue) :{' '}
                        <span className="text-white">
                          {stats.ab_hero.conversion?.[v] === null ? '—' : `${Math.round((stats.ab_hero.conversion?.[v] || 0) * 1000) / 10}%`}
                        </span>
                      </div>
                      {stats.ab_hero?.unique?.[v] ? (
                        <>
                          <div>
                            Sessions (vues) : <span className="text-white">{stats.ab_hero.unique[v].view_hero_sessions}</span>
                          </div>
                          <div>
                            Sessions (formulaires) : <span className="text-white">{stats.ab_hero.unique[v].submit_sessions}</span>
                          </div>
                          <div>
                            Conv. unique (sessions) :{' '}
                            <span className="text-white">
                              {stats.ab_hero?.unique_conversion?.[v] === null
                                ? '—'
                                : `${Math.round((Number(stats.ab_hero.unique_conversion?.[v]) || 0) * 1000) / 10}%`}
                            </span>
                          </div>
                        </>
                      ) : null}
                      {stats.ab_hero?.rates?.[v] ? (
                        <>
                          <div>
                            CTR appel :{' '}
                            <span className="text-white">
                              {stats.ab_hero.rates[v].call_per_view === null
                                ? '—'
                                : `${Math.round((Number(stats.ab_hero.rates[v].call_per_view) || 0) * 1000) / 10}%`}
                            </span>
                          </div>
                          <div>
                            CTR WhatsApp :{' '}
                            <span className="text-white">
                              {stats.ab_hero.rates[v].whatsapp_per_view === null
                                ? '—'
                                : `${Math.round((Number(stats.ab_hero.rates[v].whatsapp_per_view) || 0) * 1000) / 10}%`}
                            </span>
                          </div>
                          <div>
                            CTR “Devis” :{' '}
                            <span className="text-white">
                              {stats.ab_hero.rates[v].open_form_per_view === null
                                ? '—'
                                : `${Math.round((Number(stats.ab_hero.rates[v].open_form_per_view) || 0) * 1000) / 10}%`}
                            </span>
                          </div>
                          <div>
                            Conv. (formulaire / ouverture) :{' '}
                            <span className="text-white">
                              {stats.ab_hero.rates[v].submit_per_open_form === null
                                ? '—'
                                : `${Math.round((Number(stats.ab_hero.rates[v].submit_per_open_form) || 0) * 1000) / 10}%`}
                            </span>
                          </div>
                        </>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {stats?.experiments ? (
              <div className="mt-5 rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs uppercase tracking-wider text-zinc-400">Par expérience (id courant)</div>
                <div className="mt-3 grid gap-2 text-xs text-zinc-200 md:grid-cols-5">
                  {(Object.keys(stats.experiments) as string[]).map((k) => {
                    const exp = stats.experiments[k]
                    const a = exp?.unique_conversion?.A
                    const b = exp?.unique_conversion?.B
                    const sig = exp?.significance
                    return (
                      <div key={k} className="rounded-xl border border-white/10 bg-zinc-950/40 px-3 py-3">
                        <div className="text-xs text-zinc-400">{k}</div>
                        <div className="mt-2 grid gap-1 text-xs text-zinc-300">
                          <div>
                            A : <span className="text-white">{a === null || a === undefined ? '—' : `${Math.round(a * 1000) / 10}%`}</span>
                          </div>
                          <div>
                            B : <span className="text-white">{b === null || b === undefined ? '—' : `${Math.round(b * 1000) / 10}%`}</span>
                          </div>
                          <div className="text-zinc-500">{String(exp?.id || '')}</div>
                          <div className="text-zinc-500">
                            {sig?.eligible ? `p=${sig?.p_value === null ? '—' : Math.round(Number(sig.p_value) * 10000) / 10000}` : 'insuffisant'}
                            {sig?.significant ? ` · winner=${sig?.winner}` : ''}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : null}
            {stats?.ab_hero_pages ? (
              <div className="mt-4 grid gap-2 text-xs text-zinc-200 md:grid-cols-4">
                {(['home', 'services', 'zones', 'tarifs'] as const).map((p) => {
                  const page = stats.ab_hero_pages?.[p]
                  const a = page?.unique_conversion?.A
                  const b = page?.unique_conversion?.B
                  return (
                    <div key={p} className="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
                      <div className="text-xs text-zinc-400">{`Page ${p}`}</div>
                      <div className="mt-2 grid gap-1 text-xs text-zinc-300">
                        <div>
                          A : <span className="text-white">{a === null || a === undefined ? '—' : `${Math.round(a * 1000) / 10}%`}</span>
                        </div>
                        <div>
                          B : <span className="text-white">{b === null || b === undefined ? '—' : `${Math.round(b * 1000) / 10}%`}</span>
                        </div>
                        <div className="text-zinc-500">
                          {`${page?.unique?.A?.submit_sessions ?? 0}/${page?.unique?.A?.view_hero_sessions ?? 0} vs ${page?.unique?.B?.submit_sessions ?? 0}/${page?.unique?.B?.view_hero_sessions ?? 0}`}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : null}
            {stats?.ab_quote_form_pages ? (
              <div className="mt-4 grid gap-2 text-xs text-zinc-200 md:grid-cols-4">
                {(['home', 'services', 'zones', 'tarifs'] as const).map((p) => {
                  const page = stats.ab_quote_form_pages?.[p]
                  const a = page?.unique_conversion?.A
                  const b = page?.unique_conversion?.B
                  return (
                    <div key={p} className="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
                      <div className="text-xs text-zinc-400">{`Formulaire ${p}`}</div>
                      <div className="mt-2 grid gap-1 text-xs text-zinc-300">
                        <div>
                          A : <span className="text-white">{a === null || a === undefined ? '—' : `${Math.round(a * 1000) / 10}%`}</span>
                        </div>
                        <div>
                          B : <span className="text-white">{b === null || b === undefined ? '—' : `${Math.round(b * 1000) / 10}%`}</span>
                        </div>
                        <div className="text-zinc-500">
                          {`${page?.unique?.A?.submit_sessions ?? 0}/${page?.unique?.A?.view_sessions ?? 0} vs ${page?.unique?.B?.submit_sessions ?? 0}/${page?.unique?.B?.view_sessions ?? 0}`}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : null}
            {stats?.ab_hero?.submit_by_source ? (
              <div className="mt-4 grid gap-2 text-xs text-zinc-200 md:grid-cols-5">
                {['Google', 'Facebook', 'Instagram', 'Direct', 'Autre'].map((src) => (
                  <div key={src} className="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
                    <div className="text-xs text-zinc-400">{src}</div>
                    <div className="mt-2 grid gap-1 text-xs text-zinc-300">
                      <div>
                        A : <span className="text-white">{stats.ab_hero?.submit_by_source?.A?.[src] ?? 0}</span>
                      </div>
                      <div>
                        B : <span className="text-white">{stats.ab_hero?.submit_by_source?.B?.[src] ?? 0}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            {stats?.ab_hero?.unique_by_source ? (
              <div className="mt-4 grid gap-2 text-xs text-zinc-200 md:grid-cols-5">
                {['Google', 'Facebook', 'Instagram', 'Direct', 'Autre'].map((src) => (
                  <div key={src} className="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
                    <div className="text-xs text-zinc-400">{`${src} (conv. unique)`}</div>
                    <div className="mt-2 grid gap-1 text-xs text-zinc-300">
                      <div>
                        A :{' '}
                        <span className="text-white">
                          {stats.ab_hero?.unique_by_source?.A?.[src]?.conversion === null
                            ? '—'
                            : `${Math.round((Number(stats.ab_hero?.unique_by_source?.A?.[src]?.conversion) || 0) * 1000) / 10}%`}
                        </span>
                        <span className="text-zinc-500">{` (${stats.ab_hero?.unique_by_source?.A?.[src]?.submit_sessions ?? 0}/${stats.ab_hero?.unique_by_source?.A?.[src]?.view_sessions ?? 0})`}</span>
                      </div>
                      <div>
                        B :{' '}
                        <span className="text-white">
                          {stats.ab_hero?.unique_by_source?.B?.[src]?.conversion === null
                            ? '—'
                            : `${Math.round((Number(stats.ab_hero?.unique_by_source?.B?.[src]?.conversion) || 0) * 1000) / 10}%`}
                        </span>
                        <span className="text-zinc-500">{` (${stats.ab_hero?.unique_by_source?.B?.[src]?.submit_sessions ?? 0}/${stats.ab_hero?.unique_by_source?.B?.[src]?.view_sessions ?? 0})`}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            {stats?.ab_hero?.by_variant ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="text-xs text-zinc-300">
                  <span className="text-zinc-400">Suggestion :</span>{' '}
                  {(() => {
                    const aViews = Number(stats?.ab_hero?.by_variant?.A?.view_hero || 0)
                    const bViews = Number(stats?.ab_hero?.by_variant?.B?.view_hero || 0)
                    const aSubmits = Number(stats?.ab_hero?.by_variant?.A?.submit_quote_form || 0)
                    const bSubmits = Number(stats?.ab_hero?.by_variant?.B?.submit_quote_form || 0)
                    const aConv = stats?.ab_hero?.conversion?.A
                    const bConv = stats?.ab_hero?.conversion?.B
                    if (aViews + bViews < 50 || aSubmits + bSubmits < 10) return 'Pas assez de données (min 50 vues et 10 formulaires).'
                    if (aConv === null || bConv === null) return 'Pas assez de données.'
                    return aConv >= bConv ? 'A semble meilleure (conversion plus élevée).' : 'B semble meilleure (conversion plus élevée).'
                  })()}
                </div>
                <button
                  onClick={applyWinner}
                  disabled={applyWinnerLoading || !stats?.ab_hero?.by_variant}
                  className="rounded-xl bg-white px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-zinc-100 disabled:opacity-60"
                >
                  {applyWinnerLoading ? 'Application…' : 'Forcer la meilleure variante'}
                </button>
              </div>
            ) : null}
            <div className="mt-3 text-xs text-zinc-400">Mesure : vues hero, clics CTA, ouvertures devis, formulaires.</div>
          </div>
        </div>
      )}
    </BackofficeShell>
  )
}
