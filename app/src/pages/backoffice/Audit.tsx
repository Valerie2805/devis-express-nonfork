import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import BackofficeShell from '@/components/backoffice/BackofficeShell'
import BackButton from '@/components/BackButton'
import { apiFetch, authHeaders } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

type AuditItem = {
  audit_id: string
  actor_user_id: string | null
  actor_role: 'owner' | 'staff' | null
  action: string
  target_type: string | null
  target_id: string | null
  data: any
  ip: string | null
  user_agent: string | null
  created_at: string
}

export default function Audit() {
  const { businessId = '' } = useParams()
  const { token } = useAuthStore()
  const [items, setItems] = useState<AuditItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    apiFetch<{ items: AuditItem[] }>(`/api/v1/backoffice/${businessId}/audit`, { headers: { ...authHeaders(token) } })
      .then((d) => {
        if (!alive) return
        setItems(d.items || [])
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

  return (
    <BackofficeShell businessId={businessId}>
      <div className="flex items-center gap-3">
        <BackButton fallbackTo={`/backoffice/${businessId}`} />
        <div>
          <h1 className="text-lg font-semibold text-white">Journal</h1>
          <div className="mt-1 text-xs text-zinc-300">Actions effectuées dans le backoffice.</div>
        </div>
      </div>

      {loading ? (
        <div className="mt-8 text-sm text-zinc-300">Chargement…</div>
      ) : error ? (
        <div className="mt-8 text-sm text-rose-200">{error}</div>
      ) : (
        <div className="mt-6 grid gap-2">
          {items.length === 0 ? (
            <div className="text-sm text-zinc-400">Aucun événement.</div>
          ) : (
            items.map((it) => (
              <div key={it.audit_id} className="rounded-2xl border border-white/10 bg-zinc-950/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-300">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-white">{it.action}</span>
                    <span className="text-zinc-500">{it.target_type ? `${it.target_type}${it.target_id ? `:${it.target_id}` : ''}` : ''}</span>
                  </div>
                  <div className="text-zinc-500">{new Date(it.created_at).toLocaleString()}</div>
                </div>
                <div className="mt-2 text-xs text-zinc-400">
                  {it.actor_role ? `${it.actor_role}${it.actor_user_id ? ` • ${it.actor_user_id}` : ''}` : 'system'}
                </div>
                {it.data ? (
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => setExpandedId((prev) => (prev === it.audit_id ? null : it.audit_id))}
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-100 hover:bg-white/10"
                    >
                      {expandedId === it.audit_id ? 'Masquer les données' : 'Voir les données'}
                    </button>
                    <pre
                      className={`mt-2 overflow-auto rounded-xl border border-white/10 bg-black/30 p-3 text-[11px] text-zinc-200 ${
                        expandedId === it.audit_id ? '' : 'max-h-40'
                      }`}
                    >
                      {JSON.stringify(it.data, null, 2)}
                    </pre>
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      )}
    </BackofficeShell>
  )
}
