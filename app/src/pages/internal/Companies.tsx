import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { apiFetch, authHeaders } from '@/lib/api'
import { useInternalAuthStore } from '@/store/internalAuthStore'
import InternalShell from '@/components/internal/InternalShell'

type CompanyItem = {
  company_key: string
  type: 'business' | 'prospect'
  name: string
  city: string | null
  website_url: string | null
  legal_contact_email: string | null
  headcount_range: string | null
  naf_code: string | null
  sector_label: string | null
  annual_revenue_eur?: number | null
  website_created_at?: string | null
  website_redesign_at?: string | null
  pagespeed?: {
    mobile?: { performance_score: number | null; accessibility_score: number | null; seo_score: number | null; best_practices_score: number | null } | null
    desktop?: { performance_score: number | null; accessibility_score: number | null; seo_score: number | null; best_practices_score: number | null } | null
    worst_accessibility?: number | null
  }
}

function formatHeadcount(v: string | null) {
  if (!v) return '—'
  if (v === '0_1') return '0 à 1 salarié'
  if (v === '2_10') return '2 à 10 salariés'
  if (v === '11_20') return '11 à 20 salariés'
  if (v === '21_49') return '21 à 49 salariés'
  if (v === '50_plus') return '50 et plus'
  return v
}

function csvCell(v: any) {
  const s = v === null || v === undefined ? '' : String(v)
  const escaped = s.replace(/"/g, '""')
  return `"${escaped}"`
}

export function companiesToCsv(items: CompanyItem[]) {
  const header = [
    'company_key',
    'type',
    'name',
    'city',
    'website_url',
    'legal_contact_email',
    'headcount_range',
    'naf_code',
    'sector_label',
    'annual_revenue_eur',
    'website_created_at',
    'website_redesign_at',
    'accessibility_worst',
    'performance_mobile',
    'performance_desktop',
  ]
  const lines = [header.map(csvCell).join(',')]
  for (const it of items) {
    lines.push(
      [
        it.company_key,
        it.type,
        it.name,
        it.city,
        it.website_url,
        it.legal_contact_email,
        it.headcount_range,
        it.naf_code,
        it.sector_label,
        it.annual_revenue_eur,
        it.website_created_at,
        it.website_redesign_at,
        it.pagespeed?.worst_accessibility ?? null,
        it.pagespeed?.mobile?.performance_score ?? null,
        it.pagespeed?.desktop?.performance_score ?? null,
      ]
        .map(csvCell)
        .join(','),
    )
  }
  return lines.join('\n')
}

export default function Companies() {
  const { token } = useInternalAuthStore()
  const location = useLocation()
  const navigate = useNavigate()
  const [items, setItems] = useState<CompanyItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [accessibilityLt, setAccessibilityLt] = useState('')
  const typeFromUrl = useMemo(() => {
    const params = new URLSearchParams(location.search || '')
    const t = String(params.get('type') || 'all').trim().toLowerCase()
    return t === 'business' || t === 'prospect' ? t : 'all'
  }, [location.search])
  const [actionError, setActionError] = useState<string | null>(null)
  const [refreshingKey, setRefreshingKey] = useState<string | null>(null)
  const [scrapingKey, setScrapingKey] = useState<string | null>(null)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<any>(null)
  const [bulkRefreshing, setBulkRefreshing] = useState(false)
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null)

  const queryString = useMemo(() => {
    const params = new URLSearchParams(location.search || '')
    if (q.trim()) params.set('q', q.trim())
    else params.delete('q')
    if (accessibilityLt.trim()) params.set('accessibility_lt', accessibilityLt.trim())
    else params.delete('accessibility_lt')
    const s = params.toString()
    return s ? `?${s}` : ''
  }, [q, accessibilityLt, location.search])

  async function load(signal?: AbortSignal) {
    const d = await apiFetch<{ items: CompanyItem[] }>(`/api/v1/internal/companies${queryString}`, {
      headers: { ...authHeaders(token) },
      signal,
    })
    setItems(Array.isArray(d.items) ? d.items : [])
  }

  async function refreshPagespeed(companyKey: string) {
    setActionError(null)
    setRefreshingKey(companyKey)
    try {
      await apiFetch(`/api/v1/internal/companies/${encodeURIComponent(companyKey)}/pagespeed/run`, {
        method: 'POST',
        headers: { ...authHeaders(token) },
      })
      await load()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setRefreshingKey(null)
    }
  }

  async function refreshPsiFiltered() {
    if (bulkRefreshing) return
    setActionError(null)
    setBulkRefreshing(true)
    setBulkProgress({ done: 0, total: items.length })
    try {
      for (let i = 0; i < items.length; i++) {
        const it = items[i]
        try {
          await apiFetch(`/api/v1/internal/companies/${encodeURIComponent(it.company_key)}/pagespeed/run`, {
            method: 'POST',
            headers: { ...authHeaders(token) },
          })
        } catch (e) {
          setActionError((prev) => prev || (e instanceof Error ? e.message : 'Erreur'))
        } finally {
          setBulkProgress({ done: i + 1, total: items.length })
        }
      }
      await load()
    } finally {
      setBulkRefreshing(false)
      setBulkProgress(null)
    }
  }

  async function scrapeEmail(companyKey: string) {
    setActionError(null)
    setScrapingKey(companyKey)
    try {
      await apiFetch(`/api/v1/internal/companies/${encodeURIComponent(companyKey)}/legal_email/scrape`, {
        method: 'POST',
        headers: { ...authHeaders(token) },
      })
      await load()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setScrapingKey(null)
    }
  }

  async function saveProfile(companyKey: string) {
    if (!editDraft) return
    setActionError(null)
    try {
      await apiFetch(`/api/v1/internal/companies/${encodeURIComponent(companyKey)}/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify(editDraft),
      })
      setEditingKey(null)
      setEditDraft(null)
      await load()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Erreur')
    }
  }

  function startEdit(it: CompanyItem) {
    setEditingKey(it.company_key)
    setEditDraft({
      website_url: it.website_url,
      legal_contact_email: it.legal_contact_email,
      headcount_range: it.headcount_range,
      naf_code: it.naf_code,
      sector_label: it.sector_label,
      annual_revenue_eur: it.annual_revenue_eur ?? null,
      website_created_at: it.website_created_at ?? null,
      website_redesign_at: it.website_redesign_at ?? null,
    })
  }

  function downloadCsv() {
    const csv = companiesToCsv(items)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `entreprises-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    load(controller.signal)
      .then(() => setError(null))
      .catch((e) => setError(e instanceof Error ? e.message : 'Erreur'))
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [token, queryString])

  return (
    <InternalShell>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">Entreprises</div>
            <div className="text-xs text-zinc-300">Prospects + clients (business)</div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="grid gap-1 text-xs text-zinc-300">
              Type
              <select
                value={typeFromUrl}
                onChange={(e) => {
                  const params = new URLSearchParams(location.search || '')
                  const v = e.target.value
                  if (v === 'all') params.delete('type')
                  else params.set('type', v)
                  navigate(`${location.pathname}${params.toString() ? `?${params.toString()}` : ''}`, { replace: true })
                }}
                className="h-10 w-40 rounded-lg border border-white/10 bg-zinc-950/40 px-3 text-sm text-white outline-none focus:border-white/25"
              >
                <option value="all" className="bg-zinc-950">
                  Tous
                </option>
                <option value="business" className="bg-zinc-950">
                  Clients
                </option>
                <option value="prospect" className="bg-zinc-950">
                  Prospects
                </option>
              </select>
            </label>
            <label className="grid gap-1 text-xs text-zinc-300">
              Recherche
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="h-10 w-56 rounded-lg border border-white/10 bg-zinc-950/40 px-3 text-sm text-white outline-none focus:border-white/25"
              />
            </label>
            <label className="grid gap-1 text-xs text-zinc-300">
              Accessibilité &lt;
              <input
                inputMode="numeric"
                value={accessibilityLt}
                onChange={(e) => setAccessibilityLt(e.target.value)}
                className="h-10 w-32 rounded-lg border border-white/10 bg-zinc-950/40 px-3 text-sm text-white outline-none focus:border-white/25"
              />
            </label>
            <button
              type="button"
              onClick={downloadCsv}
              disabled={loading || !!error || !items.length}
              className="h-10 rounded-lg border border-white/10 bg-white/5 px-3 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-60"
            >
              Export CSV
            </button>
            <button
              type="button"
              onClick={refreshPsiFiltered}
              disabled={bulkRefreshing || loading || !!error || !items.length}
              className="h-10 rounded-lg border border-white/10 bg-white/5 px-3 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-60"
            >
              {bulkRefreshing && bulkProgress ? `Refresh PSI (${bulkProgress.done}/${bulkProgress.total})` : 'Refresh PSI (filtrés)'}
            </button>
          </div>
        </div>

        {loading ? <div className="mt-6 text-sm text-zinc-300">Chargement…</div> : null}
        {error ? <div className="mt-6 text-sm text-rose-200">{error}</div> : null}
        {actionError ? <div className="mt-6 text-sm text-rose-200">{actionError}</div> : null}

        {!loading && !error ? (
          <div className="mt-6 grid gap-2">
            {items.map((it) => (
              <div key={it.company_key} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-white">{it.name}</div>
                    <div className="mt-1 text-xs text-zinc-300">
                      {it.company_key} {it.city ? `· ${it.city}` : ''}
                    </div>
                    {it.website_url ? (
                      <a className="mt-1 block truncate text-xs text-sky-200 hover:text-sky-100" href={it.website_url} target="_blank" rel="noreferrer">
                        {it.website_url}
                      </a>
                    ) : null}
                  </div>
                  <div className="text-right text-xs text-zinc-300">
                    <div>
                      Worst a11y :{' '}
                      <span className="text-white">{it.pagespeed?.worst_accessibility === null || it.pagespeed?.worst_accessibility === undefined ? '—' : it.pagespeed.worst_accessibility}</span>
                    </div>
                    <div>
                      A11y mobile :{' '}
                      <span className="text-white">
                        {it.pagespeed?.mobile?.accessibility_score === null || it.pagespeed?.mobile?.accessibility_score === undefined ? '—' : it.pagespeed.mobile.accessibility_score}
                      </span>
                    </div>
                    <div>
                      A11y desktop :{' '}
                      <span className="text-white">
                        {it.pagespeed?.desktop?.accessibility_score === null || it.pagespeed?.desktop?.accessibility_score === undefined ? '—' : it.pagespeed.desktop.accessibility_score}
                      </span>
                    </div>
                    <div>
                      PageSpeed :{' '}
                      <span className="text-white">
                        {it.pagespeed?.mobile?.performance_score === null || it.pagespeed?.mobile?.performance_score === undefined ? '—' : it.pagespeed.mobile.performance_score}
                        {' / '}
                        {it.pagespeed?.desktop?.performance_score === null || it.pagespeed?.desktop?.performance_score === undefined ? '—' : it.pagespeed.desktop.performance_score}
                      </span>
                    </div>
                    <div>
                      Effectifs : <span className="text-white">{formatHeadcount(it.headcount_range)}</span>
                    </div>
                    <div>
                      Secteur :{' '}
                      <span className="text-white">
                        {it.naf_code || '—'} {it.sector_label ? `· ${it.sector_label}` : ''}
                      </span>
                    </div>
                    <div>
                      CA : <span className="text-white">{it.annual_revenue_eur === null || it.annual_revenue_eur === undefined ? '—' : `${it.annual_revenue_eur}€`}</span>
                    </div>
                    <div>Email : <span className="text-white">{it.legal_contact_email || '—'}</span></div>
                    <div className="mt-2 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => refreshPagespeed(it.company_key)}
                        disabled={refreshingKey === it.company_key || scrapingKey === it.company_key}
                        className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-100 hover:bg-white/10 disabled:opacity-60"
                      >
                        Refresh PSI
                      </button>
                      <button
                        type="button"
                        onClick={() => scrapeEmail(it.company_key)}
                        disabled={refreshingKey === it.company_key || scrapingKey === it.company_key}
                        className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-100 hover:bg-white/10 disabled:opacity-60"
                      >
                        Scrape email
                      </button>
                      <button
                        type="button"
                        onClick={() => startEdit(it)}
                        disabled={refreshingKey === it.company_key || scrapingKey === it.company_key}
                        className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-100 hover:bg-white/10 disabled:opacity-60"
                      >
                        Modifier
                      </button>
                    </div>
                  </div>
                </div>
                {editingKey === it.company_key && editDraft ? (
                  <div className="mt-4 grid gap-3 rounded-xl border border-white/10 bg-zinc-950/40 p-4 md:grid-cols-2">
                    <label className="grid gap-1 text-xs text-zinc-300">
                      Effectifs
                      <select
                        value={String(editDraft.headcount_range || '')}
                        onChange={(e) => setEditDraft({ ...editDraft, headcount_range: e.target.value || null })}
                        className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
                      >
                        <option value="" className="bg-zinc-950">
                          —
                        </option>
                        <option value="0_1" className="bg-zinc-950">
                          0 à 1 salarié
                        </option>
                        <option value="2_10" className="bg-zinc-950">
                          2 à 10 salariés
                        </option>
                        <option value="11_20" className="bg-zinc-950">
                          11 à 20 salariés
                        </option>
                        <option value="21_49" className="bg-zinc-950">
                          21 à 49 salariés
                        </option>
                        <option value="50_plus" className="bg-zinc-950">
                          50 et plus
                        </option>
                      </select>
                    </label>
                    <label className="grid gap-1 text-xs text-zinc-300">
                      CA annuel (€)
                      <input
                        inputMode="numeric"
                        value={editDraft.annual_revenue_eur === null || editDraft.annual_revenue_eur === undefined ? '' : String(editDraft.annual_revenue_eur)}
                        onChange={(e) => setEditDraft({ ...editDraft, annual_revenue_eur: e.target.value ? Number(e.target.value) : null })}
                        className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
                      />
                    </label>
                    <label className="grid gap-1 text-xs text-zinc-300">
                      Code NAF
                      <input
                        value={String(editDraft.naf_code || '')}
                        onChange={(e) => setEditDraft({ ...editDraft, naf_code: e.target.value || null })}
                        className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
                      />
                    </label>
                    <label className="grid gap-1 text-xs text-zinc-300">
                      Secteur (libellé)
                      <input
                        value={String(editDraft.sector_label || '')}
                        onChange={(e) => setEditDraft({ ...editDraft, sector_label: e.target.value || null })}
                        className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
                      />
                    </label>
                    <label className="grid gap-1 text-xs text-zinc-300 md:col-span-2">
                      Site web (URL)
                      <input
                        value={String(editDraft.website_url || '')}
                        onChange={(e) => setEditDraft({ ...editDraft, website_url: e.target.value || null })}
                        className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
                      />
                    </label>
                    <label className="grid gap-1 text-xs text-zinc-300 md:col-span-2">
                      Email (mentions légales)
                      <input
                        value={String(editDraft.legal_contact_email || '')}
                        onChange={(e) => setEditDraft({ ...editDraft, legal_contact_email: e.target.value || null })}
                        className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
                      />
                    </label>
                    <label className="grid gap-1 text-xs text-zinc-300">
                      Date création site
                      <input
                        value={String(editDraft.website_created_at || '')}
                        onChange={(e) => setEditDraft({ ...editDraft, website_created_at: e.target.value || null })}
                        className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
                        placeholder="YYYY-MM-DD"
                      />
                    </label>
                    <label className="grid gap-1 text-xs text-zinc-300">
                      Date refonte
                      <input
                        value={String(editDraft.website_redesign_at || '')}
                        onChange={(e) => setEditDraft({ ...editDraft, website_redesign_at: e.target.value || null })}
                        className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
                        placeholder="YYYY-MM-DD"
                      />
                    </label>
                    <div className="flex justify-end gap-2 md:col-span-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingKey(null)
                          setEditDraft(null)
                        }}
                        className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-100 hover:bg-white/10"
                      >
                        Annuler
                      </button>
                      <button
                        type="button"
                        onClick={() => saveProfile(it.company_key)}
                        className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-zinc-950 hover:bg-zinc-100"
                      >
                        Enregistrer
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
            {!items.length ? <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-zinc-300">Aucun résultat</div> : null}
          </div>
        ) : null}
    </InternalShell>
  )
}
