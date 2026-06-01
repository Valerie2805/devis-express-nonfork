import { useEffect, useMemo, useState } from 'react'
import { apiFetch, authHeaders } from '@/lib/api'
import { useInternalAuthStore } from '@/store/internalAuthStore'
import InternalShell from '@/components/internal/InternalShell'

type Entry = {
  entry_id: string
  month: string
  company_key?: string | null
  ca_eur: number
  rate_pct: number
  charges_pct: number
  commission_gross_eur: number
  charges_amount_eur: number
  commission_net_eur: number
}

export default function Commissions() {
  const { token } = useInternalAuthStore()
  const [items, setItems] = useState<Entry[]>([])
  const [totalsByMonth, setTotalsByMonth] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null)
  const [companyOptions, setCompanyOptions] = useState<{ company_key: string; name: string }[]>([])

  const [month, setMonth] = useState('')
  const [companyKey, setCompanyKey] = useState('')
  const [caEur, setCaEur] = useState('')
  const [ratePct, setRatePct] = useState('10')
  const [chargesPct, setChargesPct] = useState('22')
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState<{ gross: number; charges: number; net: number } | null>(null)

  const calc = useMemo(() => {
    const ca = Number(caEur)
    const r = Number(ratePct)
    const c = Number(chargesPct)
    if (!Number.isFinite(ca) || !Number.isFinite(r) || !Number.isFinite(c)) return null
    const gross = Math.round(ca * (r / 100))
    const charges = Math.round(gross * (c / 100))
    const net = gross - charges
    return { gross, charges, net }
  }, [caEur, ratePct, chargesPct])

  useEffect(() => {
    setPreview(calc)
  }, [calc])

  async function load(signal?: AbortSignal) {
    const d = await apiFetch<{ items: Entry[]; totals_by_month: any }>('/api/v1/internal/commissions', { headers: { ...authHeaders(token) }, signal })
    setItems(Array.isArray(d.items) ? d.items : [])
    setTotalsByMonth(d.totals_by_month && typeof d.totals_by_month === 'object' ? d.totals_by_month : {})
  }

  async function loadCompanies(signal?: AbortSignal) {
    const d = await apiFetch<{ items: { company_key: string; name: string }[] }>('/api/v1/internal/companies', { headers: { ...authHeaders(token) }, signal })
    setCompanyOptions(Array.isArray(d.items) ? d.items.map((it) => ({ company_key: String(it.company_key || ''), name: String(it.name || '') })).filter((it) => it.company_key) : [])
  }

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    Promise.all([load(controller.signal), loadCompanies(controller.signal)])
      .then(() => setError(null))
      .catch((e) => setError(e instanceof Error ? e.message : 'Erreur'))
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [token])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const res = await apiFetch<{ entry: Entry }>('/api/v1/internal/commissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({
          month: month.trim(),
          company_key: companyKey.trim() || undefined,
          ca_eur: Number(caEur),
          rate_pct: Number(ratePct),
          charges_pct: Number(chargesPct),
        }),
      })
      setPreview({ gross: res.entry.commission_gross_eur, charges: res.entry.charges_amount_eur, net: res.entry.commission_net_eur })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  return (
    <InternalShell>
        <div className="text-lg font-semibold">Commissions</div>
        <div className="mt-1 text-xs text-zinc-300">Saisie CA + taux + charges (%, fixe) et suivi par mois.</div>

        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
          <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-xs text-zinc-300">
              Mois (YYYY-MM)
              <input
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="h-10 rounded-xl border border-white/10 bg-zinc-950/40 px-3 text-sm text-white outline-none focus:border-white/25"
              />
            </label>
            <label className="grid gap-1 text-xs text-zinc-300">
              Company key (optionnel)
              <input
                value={companyKey}
                onChange={(e) => setCompanyKey(e.target.value)}
                className="h-10 rounded-xl border border-white/10 bg-zinc-950/40 px-3 text-sm text-white outline-none focus:border-white/25"
                placeholder="business:<id> / prospect:<id>"
                list="company-keys"
              />
            </label>
            <datalist id="company-keys">
              {companyOptions.map((it) => (
                <option key={it.company_key} value={it.company_key}>
                  {it.name}
                </option>
              ))}
            </datalist>
            <label className="grid gap-1 text-xs text-zinc-300">
              CA (€)
              <input
                inputMode="numeric"
                value={caEur}
                onChange={(e) => setCaEur(e.target.value)}
                className="h-10 rounded-xl border border-white/10 bg-zinc-950/40 px-3 text-sm text-white outline-none focus:border-white/25"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1 text-xs text-zinc-300">
                Taux (%)
                <input
                  inputMode="numeric"
                  value={ratePct}
                  onChange={(e) => setRatePct(e.target.value)}
                  className="h-10 rounded-xl border border-white/10 bg-zinc-950/40 px-3 text-sm text-white outline-none focus:border-white/25"
                />
              </label>
              <label className="grid gap-1 text-xs text-zinc-300">
                Charges (%)
                <input
                  inputMode="numeric"
                  value={chargesPct}
                  onChange={(e) => setChargesPct(e.target.value)}
                  className="h-10 rounded-xl border border-white/10 bg-zinc-950/40 px-3 text-sm text-white outline-none focus:border-white/25"
                />
              </label>
            </div>

            <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-zinc-200">
                Brut : {preview ? `${preview.gross}€` : '—'} · Charges : {preview ? `${preview.charges}€` : '—'} · <span className="font-semibold text-white">Net : {preview ? `${preview.net}€` : '—'}</span>
              </div>
              <button
                type="submit"
                disabled={saving || !month.trim() || !caEur.trim()}
                className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-zinc-100 disabled:opacity-60"
              >
                Enregistrer
              </button>
            </div>
          </form>
          {error ? <div className="mt-3 text-xs text-rose-200">{error}</div> : null}
        </div>

        {loading ? <div className="mt-6 text-sm text-zinc-300">Chargement…</div> : null}

        {!loading ? (
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {Object.entries(totalsByMonth)
              .sort((a, b) => b[0].localeCompare(a[0]))
              .slice(0, 6)
              .map(([m, t]) => (
                <div key={m} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs text-zinc-400">{m}</div>
                  <div className="mt-1 text-sm text-zinc-200">
                    Net : <span className="font-semibold text-white">{t.commission_net_eur}€</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <div className="text-xs text-zinc-400">{t.count ? `${t.count} entrée(s)` : ''}</div>
                    <button
                      type="button"
                      onClick={() => setExpandedMonth((prev) => (prev === m ? null : m))}
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-100 hover:bg-white/10"
                    >
                      Détails
                    </button>
                  </div>
                  {expandedMonth === m ? (
                    <div className="mt-3 grid gap-2">
                      {items
                        .filter((it) => it.month === m)
                        .map((it) => {
                          const ck = it.company_key
                            ? it.company_key
                            : (it as any).business_id
                              ? `business:${(it as any).business_id}`
                              : (it as any).prospect_id
                                ? `prospect:${(it as any).prospect_id}`
                                : 'global'
                          return (
                            <div key={it.entry_id} className="rounded-xl border border-white/10 bg-zinc-950/30 px-4 py-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="text-xs text-zinc-300">{ck}</div>
                                <div className="text-xs text-zinc-200">
                                  Net : <span className="font-semibold text-white">{it.commission_net_eur}€</span>
                                </div>
                              </div>
                              <div className="mt-1 text-xs text-zinc-400">
                                CA : {it.ca_eur}€ · Taux : {it.rate_pct}% · Charges : {it.charges_pct}%
                              </div>
                            </div>
                          )
                        })}
                      {!items.some((it) => it.month === m) ? <div className="text-xs text-zinc-300">Aucune entrée</div> : null}
                    </div>
                  ) : null}
                </div>
              ))}
            {!items.length ? <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-zinc-300 md:col-span-2">Aucune entrée</div> : null}
          </div>
        ) : null}
    </InternalShell>
  )
}
