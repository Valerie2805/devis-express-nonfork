import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import BackofficeShell from '@/components/backoffice/BackofficeShell'
import BackButton from '@/components/BackButton'
import { apiFetch, authHeaders } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

export default function Availability() {
  const { businessId = '' } = useParams()
  const { token } = useAuthStore()
  const [nextSlot, setNextSlot] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true)
    apiFetch<{ config: any }>(`/api/v1/backoffice/${businessId}/settings`, { headers: { ...authHeaders(token) } })
      .then((d) => {
        if (!alive) return
        setNextSlot(String(d.config?.availability?.next_slot_text || ''))
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

  async function save() {
    setSaving(true)
    try {
      await apiFetch(`/api/v1/backoffice/${businessId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({ availability: { mode: 'manual', next_slot_text: nextSlot } }),
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <BackofficeShell businessId={businessId}>
      <div className="flex items-center gap-3">
        <BackButton fallbackTo={`/backoffice/${businessId}`} />
        <div>
          <h1 className="text-lg font-semibold text-white">Disponibilités</h1>
          <div className="mt-1 text-xs text-zinc-300">Affiche “prochain créneau” sur le site.</div>
        </div>
      </div>

      {loading ? (
        <div className="mt-8 text-sm text-zinc-300">Chargement…</div>
      ) : error ? (
        <div className="mt-8 text-sm text-rose-200">{error}</div>
      ) : (
        <div className="mt-6 max-w-lg rounded-2xl border border-white/10 bg-zinc-950/40 p-5">
          <label className="grid gap-1 text-xs text-zinc-300">
            Prochain créneau
            <input
              value={nextSlot}
              onChange={(e) => setNextSlot(e.target.value)}
              className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
              placeholder="ex : demain 14h"
            />
          </label>
          <div className="mt-4 flex justify-end">
            <button
              onClick={save}
              disabled={saving}
              className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-zinc-100 disabled:opacity-60"
            >
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      )}
    </BackofficeShell>
  )
}
