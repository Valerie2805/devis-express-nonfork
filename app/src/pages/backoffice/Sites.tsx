import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import BackofficeShell from '@/components/backoffice/BackofficeShell'
import BackButton from '@/components/BackButton'
import { apiFetch, authHeaders } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

type SiteItem = {
  lead_id: string
  first_name: string
  city: string
  postal_code?: string | null
  status?: string | null
  stage?: string | null
  assignee_user_id?: string | null
  site_status?: 'todo' | 'in_progress' | 'delivered' | null
  site_started_at?: string | null
  site_delivered_at?: string | null
  portal_id?: string | null
  preview_enabled?: number | boolean | null
}

export default function Sites() {
  const { businessId = '' } = useParams()
  const { token } = useAuthStore()
  const [items, setItems] = useState<SiteItem[]>([])
  const [draftStatus, setDraftStatus] = useState<Record<string, SiteItem['site_status']>>({})
  const [portalInfo, setPortalInfo] = useState<Record<string, { portal_url: string; preview_url: string; pin: string }>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const title = useMemo(() => 'Sites', [])

  useEffect(() => {
    let alive = true
    if (!token) return
    setLoading(true)
    apiFetch<{ items: SiteItem[] }>(`/api/v1/backoffice/${businessId}/sites`, { headers: { ...authHeaders(token) } })
      .then((d) => {
        if (!alive) return
        const nextItems = Array.isArray(d.items) ? d.items : []
        setItems(nextItems)
        const nextDraft: Record<string, SiteItem['site_status']> = {}
        for (const it of nextItems) nextDraft[it.lead_id] = (it.site_status as any) || 'todo'
        setDraftStatus(nextDraft)
        setError(null)
      })
      .catch((e) => {
        if (!alive) return
        setError(e?.message || 'Erreur')
      })
      .finally(() => {
        if (!alive) return
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [businessId, token])

  return (
    <BackofficeShell businessId={businessId}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <BackButton fallbackTo={`/backoffice/${businessId}`} />
          <div>
            <div className="text-xs uppercase tracking-wider text-zinc-400">{title}</div>
            <div className="mt-1 text-sm text-zinc-200">Leads assignés et suivi de création</div>
          </div>
        </div>
      </div>

      {error ? <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-rose-200">{error}</div> : null}

      {loading ? (
        <div className="mt-6 text-sm text-zinc-300">Chargement…</div>
      ) : (
        <div className="mt-6 grid gap-2">
          {items.length ? (
            items.map((it) => (
              <div key={it.lead_id} className="rounded-2xl border border-white/10 bg-zinc-950/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">
                      {it.first_name} <span className="text-zinc-400">({it.city})</span>
                    </div>
                    <div className="mt-1 text-xs text-zinc-300">
                      Lead {it.lead_id}
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <label className="grid gap-1 text-xs text-zinc-300">
                    Statut site
                    <select
                      value={draftStatus[it.lead_id] || 'todo'}
                      onChange={(e) => setDraftStatus((s) => ({ ...s, [it.lead_id]: e.target.value as any }))}
                      className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
                    >
                      <option value="todo">À faire</option>
                      <option value="in_progress">En cours</option>
                      <option value="delivered">Livré</option>
                    </select>
                  </label>

                  <div className="flex items-end gap-2">
                    <button
                      onClick={async () => {
                        if (!token) return
                        setSaving((s) => ({ ...s, [it.lead_id]: true }))
                        try {
                          await apiFetch(`/api/v1/backoffice/${businessId}/leads/${it.lead_id}/site`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
                            body: JSON.stringify({ site_status: draftStatus[it.lead_id] || 'todo' }),
                          })
                          setItems((arr) => arr.map((x) => (x.lead_id === it.lead_id ? { ...x, site_status: draftStatus[it.lead_id] || 'todo' } : x)))
                        } finally {
                          setSaving((s) => ({ ...s, [it.lead_id]: false }))
                        }
                      }}
                      disabled={Boolean(saving[it.lead_id])}
                      className="h-10 rounded-xl bg-white px-4 text-xs font-semibold text-zinc-950 hover:bg-zinc-100 disabled:opacity-60"
                    >
                      Enregistrer
                    </button>

                    <button
                      onClick={async () => {
                        if (!token) return
                        setSaving((s) => ({ ...s, [it.lead_id]: true }))
                        try {
                          const d = await apiFetch<any>(`/api/v1/backoffice/${businessId}/leads/${it.lead_id}/portal`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
                            body: JSON.stringify({}),
                          })
                          setPortalInfo((p) => ({
                            ...p,
                            [it.lead_id]: { portal_url: String(d.portal_url || ''), preview_url: String(d.preview_url || ''), pin: String(d.pin || '') },
                          }))
                        } finally {
                          setSaving((s) => ({ ...s, [it.lead_id]: false }))
                        }
                      }}
                      disabled={Boolean(saving[it.lead_id])}
                      className="h-10 rounded-xl border border-white/10 bg-white/5 px-4 text-xs font-semibold text-zinc-200 hover:bg-white/10 disabled:opacity-60"
                    >
                      Générer accès client
                    </button>
                  </div>

                  {portalInfo[it.lead_id] ? (
                    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-xs text-zinc-200">
                      <div>PIN : <span className="font-semibold text-white">{portalInfo[it.lead_id].pin}</span></div>
                      <div className="mt-1 break-all text-zinc-300">{portalInfo[it.lead_id].portal_url}</div>
                      <div className="mt-1 break-all text-zinc-400">{portalInfo[it.lead_id].preview_url}</div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          onClick={async () => {
                            if (!token) return
                            setSaving((s) => ({ ...s, [it.lead_id]: true }))
                            try {
                              await apiFetch(`/api/v1/backoffice/${businessId}/leads/${it.lead_id}/site`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
                                body: JSON.stringify({ site_status: draftStatus[it.lead_id] || 'todo', preview_enabled: true }),
                              })
                            } finally {
                              setSaving((s) => ({ ...s, [it.lead_id]: false }))
                            }
                          }}
                          disabled={Boolean(saving[it.lead_id])}
                          className="h-9 rounded-lg bg-white px-3 text-xs font-semibold text-zinc-950 disabled:opacity-60"
                        >
                          Activer preview
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-zinc-400 self-end">Portail non généré</div>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="text-sm text-zinc-300">Aucun lead assigné.</div>
          )}
        </div>
      )}
    </BackofficeShell>
  )
}
