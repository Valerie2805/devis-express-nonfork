import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import BackofficeShell from '@/components/backoffice/BackofficeShell'
import BackButton from '@/components/BackButton'
import { apiFetch, authHeaders } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

type Item = {
  lead_id: string
  first_name: string
  city: string
  month: string
  won_at: string
  months?: string[]
  by_month?: Array<{ month: string; amount_cents: number; commission_cents: number }>
  amount_cents: number
  rate_pct: number
  commission_cents: number
}

type Resp = {
  items: Item[]
  totals_by_month: Record<string, { revenue_cents: number; commission_cents: number; count: number }>
  default_rate_pct: number
}

function eur(cents: number) {
  const v = Number(cents || 0) / 100
  return v.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })
}

export default function Commissions() {
  const { businessId = '' } = useParams()
  const { token } = useAuthStore()
  const [data, setData] = useState<Resp | null>(null)
  const [me, setMe] = useState<{ role: 'owner' | 'staff' } | null>(null)
  const [staffPerms, setStaffPerms] = useState<Record<string, any>>({})
  const [draftRates, setDraftRates] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [rangeFrom, setRangeFrom] = useState('')
  const [rangeTo, setRangeTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedLead, setExpandedLead] = useState<string | null>(null)

  const title = useMemo(() => 'Commissions', [])
  const canWrite = me?.role === 'owner' || Boolean(staffPerms.commissions_write)

  async function load(signal?: AbortSignal) {
    const qs = new URLSearchParams()
    if (rangeFrom.trim()) qs.set('from', rangeFrom.trim())
    if (rangeTo.trim()) qs.set('to', rangeTo.trim())
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    const d = await apiFetch<Resp>(`/api/v1/backoffice/${businessId}/commissions${suffix}`, { headers: { ...authHeaders(token) }, signal })
    setData(d)
    const next: Record<string, string> = {}
    for (const it of d.items || []) next[it.lead_id] = String(it.rate_pct)
    setDraftRates(next)
  }

  useEffect(() => {
    const controller = new AbortController()
    if (!token) return () => controller.abort()
    setLoading(true)
    load(controller.signal)
      .then(() => setError(null))
      .catch((e) => setError(e instanceof Error ? e.message : 'Erreur'))
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [businessId, token, rangeFrom, rangeTo])

  useEffect(() => {
    let alive = true
    if (!token) return
    Promise.all([
      apiFetch<{ role: 'owner' | 'staff' }>(`/api/v1/backoffice/${businessId}/me`, { headers: { ...authHeaders(token) } }),
      apiFetch<{ config: any }>(`/api/v1/backoffice/${businessId}/settings`, { headers: { ...authHeaders(token) } }),
    ])
      .then(([meRes, settingsRes]) => {
        if (!alive) return
        setMe(meRes)
        const sp = settingsRes?.config?.settings?.staff_permissions
        setStaffPerms(sp && typeof sp === 'object' ? sp : {})
      })
      .catch(() => {
        if (!alive) return
        setMe(null)
        setStaffPerms({})
      })
    return () => {
      alive = false
    }
  }, [businessId, token])

  const totalsSorted = useMemo(() => {
    const raw = data?.totals_by_month || {}
    return Object.entries(raw).sort((a, b) => b[0].localeCompare(a[0]))
  }, [data])

  return (
    <BackofficeShell businessId={businessId}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <BackButton fallbackTo={`/backoffice/${businessId}`} />
          <div>
            <div className="text-xs uppercase tracking-wider text-zinc-400">{title}</div>
            <div className="mt-1 text-sm text-zinc-200">CA (leads gagnés) × % commission par lead</div>
            {!canWrite && me?.role === 'staff' ? <div className="mt-1 text-xs text-zinc-400">Lecture seule (permissions staff).</div> : null}
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-xs text-zinc-300">
            De (YYYY-MM)
            <input
              value={rangeFrom}
              onChange={(e) => setRangeFrom(e.target.value)}
              className="h-9 w-28 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
            />
          </label>
          <label className="grid gap-1 text-xs text-zinc-300">
            À (YYYY-MM)
            <input
              value={rangeTo}
              onChange={(e) => setRangeTo(e.target.value)}
              className="h-9 w-28 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
            />
          </label>
        </div>
      </div>

      {error ? <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-rose-200">{error}</div> : null}
      {loading ? <div className="mt-6 text-sm text-zinc-300">Chargement…</div> : null}

      {!loading && data ? (
        <>
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {totalsSorted.slice(0, 6).map(([m, t]) => (
              <div key={m} className="rounded-2xl border border-white/10 bg-zinc-950/40 p-4">
                <div className="text-xs text-zinc-400">{m}</div>
                <div className="mt-1 text-sm text-zinc-200">
                  Commission : <span className="font-semibold text-white">{eur(t.commission_cents)}</span>
                </div>
                <div className="mt-1 text-xs text-zinc-400">
                  CA : {eur(t.revenue_cents)} · {t.count} lead(s)
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 text-sm font-semibold text-white">Leads</div>
          <div className="mt-3 grid gap-2">
            {data.items.map((it) => (
              <div key={it.lead_id} className="rounded-2xl border border-white/10 bg-zinc-950/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">
                      {it.first_name} <span className="text-zinc-400">({it.city})</span>
                    </div>
                    <div className="mt-1 text-xs text-zinc-300">
                      {(it.months && it.months.length ? it.months.join(' · ') : it.month) || '—'} · CA {eur(it.amount_cents)} · Commission{' '}
                      <span className="font-semibold text-white">{eur(it.commission_cents)}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="grid gap-1 text-xs text-zinc-300">
                      Taux (%)
                      <input
                        aria-label={`Taux ${it.lead_id}`}
                        inputMode="numeric"
                        value={draftRates[it.lead_id] ?? String(it.rate_pct)}
                        onChange={(e) => setDraftRates((s) => ({ ...s, [it.lead_id]: e.target.value }))}
                        disabled={!canWrite}
                        className="h-10 w-24 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
                      />
                    </label>
                    {canWrite ? (
                      <button
                        type="button"
                        aria-label={`Enregistrer ${it.lead_id}`}
                        onClick={async () => {
                          if (!token) return
                          const v = Number(draftRates[it.lead_id])
                          setSaving((s) => ({ ...s, [it.lead_id]: true }))
                          try {
                            await apiFetch(`/api/v1/backoffice/${businessId}/leads/${it.lead_id}/commission_rate`, {
                              method: 'PUT',
                              headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
                              body: JSON.stringify({ rate_pct: v }),
                            })
                            await load()
                          } catch (e) {
                            setError(e instanceof Error ? e.message : 'Erreur')
                          } finally {
                            setSaving((s) => ({ ...s, [it.lead_id]: false }))
                          }
                        }}
                        disabled={Boolean(saving[it.lead_id])}
                        className="h-10 rounded-xl bg-white px-4 text-xs font-semibold text-zinc-950 disabled:opacity-60"
                      >
                        Enregistrer
                      </button>
                    ) : null}
                    {it.by_month && it.by_month.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => setExpandedLead((prev) => (prev === it.lead_id ? null : it.lead_id))}
                        className="h-10 rounded-xl border border-white/10 bg-white/5 px-4 text-xs font-semibold text-zinc-200 hover:bg-white/10"
                      >
                        Détails
                      </button>
                    ) : null}
                  </div>
                </div>
                {expandedLead === it.lead_id && it.by_month ? (
                  <div className="mt-3 grid gap-2">
                    {it.by_month.map((m) => (
                      <div key={m.month} className="rounded-xl border border-white/10 bg-zinc-950/30 px-3 py-2 text-xs text-zinc-200">
                        {m.month} · CA {eur(m.amount_cents)} · Commission {eur(m.commission_cents)}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
            {data.items.length === 0 ? <div className="text-sm text-zinc-300">Aucun lead gagné.</div> : null}
          </div>
        </>
      ) : null}
    </BackofficeShell>
  )
}
