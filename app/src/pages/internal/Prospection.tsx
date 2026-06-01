import { useEffect, useState } from 'react'
import { apiFetch, authHeaders } from '@/lib/api'
import { useInternalAuthStore } from '@/store/internalAuthStore'
import InternalShell from '@/components/internal/InternalShell'

type ProspectRow = {
  prospect_id: string
  name: string
  status: string
  updated_at: string
}

type PlaceRow = {
  place_id: string
  name: string
  address: string
  lat: number | null
  lng: number | null
  rating: number | null
  reviews_count: number | null
}

export default function Prospection() {
  const { token } = useInternalAuthStore()
  const [items, setItems] = useState<ProspectRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [places, setPlaces] = useState<PlaceRow[]>([])
  const [searchError, setSearchError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [importing, setImporting] = useState(false)
  const [tradeId, setTradeId] = useState('')
  const [emailProspectId, setEmailProspectId] = useState<string | null>(null)
  const [toEmail, setToEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [sendStatus, setSendStatus] = useState<string | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)

  async function loadProspects(signal?: AbortSignal) {
    const d = await apiFetch<{ items: ProspectRow[] }>('/api/v1/internal/prospection/prospects', {
      headers: { ...authHeaders(token) },
      signal,
    })
    setItems(Array.isArray(d.items) ? d.items : [])
  }

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    loadProspects(controller.signal)
      .then(() => setError(null))
      .catch((e) => setError(e instanceof Error ? e.message : 'Erreur'))
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [token])

  async function onSearch(e: React.FormEvent) {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    setSearching(true)
    setSearchError(null)
    try {
      const data = await apiFetch<{ results: PlaceRow[] }>('/api/v1/internal/prospection/search_places', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({ query: q }),
      })
      setPlaces(Array.isArray(data.results) ? data.results : [])
      setSelected({})
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSearching(false)
    }
  }

  async function onImport() {
    const ids = Object.entries(selected)
      .filter(([, v]) => v)
      .map(([k]) => k)
    if (!ids.length) return
    setImporting(true)
    setSearchError(null)
    try {
      await apiFetch('/api/v1/internal/prospection/import_places', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({ place_ids: ids, trade_id: tradeId.trim() || undefined }),
      })
      await loadProspects()
      setSelected({})
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setImporting(false)
    }
  }

  async function onSendEmail(e: React.FormEvent) {
    e.preventDefault()
    if (!emailProspectId) return
    setSending(true)
    setSendError(null)
    setSendStatus(null)
    try {
      await apiFetch(`/api/v1/internal/prospection/prospects/${encodeURIComponent(emailProspectId)}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({ to_email: toEmail.trim(), subject: subject.trim(), text }),
      })
      setSendStatus('Envoyé')
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSending(false)
    }
  }

  return (
    <InternalShell>
      <div className="max-w-4xl">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm font-semibold">Recherche Google Places</div>
          <form onSubmit={onSearch} className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="grid flex-1 gap-1 text-xs text-zinc-300">
              Recherche Places
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-10 rounded-lg border border-white/10 bg-zinc-950/40 px-3 text-sm text-white outline-none focus:border-white/25"
              />
            </label>
            <button
              type="submit"
              disabled={searching || !query.trim()}
              className="h-10 rounded-lg bg-white px-4 text-sm font-semibold text-zinc-950 disabled:opacity-60"
            >
              {searching ? 'Recherche…' : 'Rechercher'}
            </button>
          </form>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1 text-xs text-zinc-300 sm:col-span-2">
              Trade ID (optionnel)
              <input
                value={tradeId}
                onChange={(e) => setTradeId(e.target.value)}
                className="h-10 rounded-lg border border-white/10 bg-zinc-950/40 px-3 text-sm text-white outline-none focus:border-white/25"
              />
            </label>
            <button
              type="button"
              onClick={onImport}
              disabled={importing || Object.values(selected).every((v) => !v)}
              className="h-10 rounded-lg bg-white px-4 text-sm font-semibold text-zinc-950 disabled:opacity-60"
            >
              {importing ? 'Import…' : 'Importer'}
            </button>
          </div>
          {searchError ? <div className="mt-3 text-xs text-rose-200">{searchError}</div> : null}
          {places.length ? (
            <div className="mt-3 grid gap-2">
              {places.map((p) => (
                <div key={p.place_id} className="rounded-xl border border-white/10 bg-zinc-950/30 px-4 py-3">
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      aria-label={`Sélectionner ${p.place_id}`}
                      checked={Boolean(selected[p.place_id])}
                      onChange={(e) => setSelected((prev) => ({ ...prev, [p.place_id]: e.target.checked }))}
                      className="mt-1 h-4 w-4"
                    />
                    <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">{p.name}</div>
                  <div className="mt-1 text-xs text-zinc-300">{p.address}</div>
                    </div>
                  </label>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="text-lg font-semibold">Prospects</div>
        {loading ? <div className="mt-4 text-sm text-zinc-300">Chargement…</div> : null}
        {error ? <div className="mt-4 text-sm text-rose-200">{error}</div> : null}
        {!loading && !error ? (
          <div className="mt-4 grid gap-2">
            {items.map((p) => (
              <div key={p.prospect_id} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{p.name}</div>
                <div className="mt-1 text-xs text-zinc-300">
                  {p.prospect_id} · {p.status}
                </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEmailProspectId(p.prospect_id)
                      setSendStatus(null)
                      setSendError(null)
                      setToEmail('')
                      setSubject('')
                      setText('')
                    }}
                    className="h-9 rounded-lg bg-white px-3 text-xs font-semibold text-zinc-950"
                  >
                    Email
                  </button>
                </div>
              </div>
            ))}
            {items.length === 0 ? <div className="text-sm text-zinc-300">Aucun prospect</div> : null}
          </div>
        ) : null}

        {emailProspectId ? (
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-sm font-semibold">Envoyer un email</div>
            <div className="mt-1 text-xs text-zinc-300">Prospect : {emailProspectId}</div>
            <form onSubmit={onSendEmail} className="mt-4 grid gap-3">
              <label className="grid gap-1 text-xs text-zinc-300">
                To
                <input
                  value={toEmail}
                  onChange={(e) => setToEmail(e.target.value)}
                  className="h-10 rounded-lg border border-white/10 bg-zinc-950/40 px-3 text-sm text-white outline-none focus:border-white/25"
                />
              </label>
              <label className="grid gap-1 text-xs text-zinc-300">
                Subject
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="h-10 rounded-lg border border-white/10 bg-zinc-950/40 px-3 text-sm text-white outline-none focus:border-white/25"
                />
              </label>
              <label className="grid gap-1 text-xs text-zinc-300">
                Text
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  className="min-h-28 rounded-lg border border-white/10 bg-zinc-950/40 px-3 py-2 text-sm text-white outline-none focus:border-white/25"
                />
              </label>
              {sendError ? <div className="text-xs text-rose-200">{sendError}</div> : null}
              {sendStatus ? <div className="text-xs text-emerald-200">{sendStatus}</div> : null}
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={sending || !toEmail.trim() || !subject.trim() || !text.trim()}
                  className="h-10 rounded-lg bg-white px-4 text-sm font-semibold text-zinc-950 disabled:opacity-60"
                >
                  {sending ? 'Envoi…' : 'Envoyer'}
                </button>
                <button
                  type="button"
                  onClick={() => setEmailProspectId(null)}
                  className="text-xs text-zinc-300 hover:text-white"
                >
                  Fermer
                </button>
              </div>
            </form>
          </div>
        ) : null}
      </div>
    </InternalShell>
  )
}
