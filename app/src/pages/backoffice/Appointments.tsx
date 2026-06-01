import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import BackofficeShell from '@/components/backoffice/BackofficeShell'
import BackButton from '@/components/BackButton'
import { apiFetch, authHeaders } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

type Appointment = {
  appointment_id: string
  lead_id: string
  start_at: string
  end_at: string
  status: string
  location: string | null
}

export default function Appointments() {
  const { businessId = '' } = useParams()
  const { token } = useAuthStore()
  const [items, setItems] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const from = useMemo(() => new Date(Date.now() - 7 * 864e5).toISOString(), [])
  const to = useMemo(() => new Date(Date.now() + 30 * 864e5).toISOString(), [])

  useEffect(() => {
    let alive = true
    setLoading(true)
    apiFetch<{ items: Appointment[] }>(`/api/v1/backoffice/${businessId}/appointments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, {
      headers: { ...authHeaders(token) },
    })
      .then((d) => {
        if (!alive) return
        setItems(d.items)
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
  }, [businessId, from, to, token])

  async function cancel(appointmentId: string) {
    await apiFetch(`/api/v1/backoffice/${businessId}/appointments/${appointmentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
      body: JSON.stringify({ status: 'cancelled' }),
    })
    setItems((prev) => prev.map((a) => (a.appointment_id === appointmentId ? { ...a, status: 'cancelled' } : a)))
  }

  return (
    <BackofficeShell businessId={businessId}>
      <div className="flex items-center gap-3">
        <BackButton fallbackTo={`/backoffice/${businessId}`} />
        <div>
          <h1 className="text-lg font-semibold text-white">Rendez-vous</h1>
          <div className="mt-1 text-xs text-zinc-300">Liste des rendez-vous et export calendrier (.ics).</div>
        </div>
      </div>

      {loading ? (
        <div className="mt-8 text-sm text-zinc-300">Chargement…</div>
      ) : error ? (
        <div className="mt-8 text-sm text-rose-200">{error}</div>
      ) : (
        <div className="mt-6 grid gap-2">
          {items.length === 0 ? <div className="text-sm text-zinc-300">Aucun rendez-vous.</div> : null}
          {items.map((a) => (
            <div key={a.appointment_id} className="flex flex-col justify-between gap-3 rounded-2xl border border-white/10 bg-zinc-950/40 p-5 md:flex-row md:items-center">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white">{new Date(a.start_at).toLocaleString()}</div>
                <div className="mt-1 text-xs text-zinc-300">
                  {a.status} • lead {a.lead_id}
                </div>
                {a.location ? <div className="mt-1 text-xs text-zinc-300">{a.location}</div> : null}
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <a
                  href={`/api/v1/backoffice/${businessId}/appointments/${a.appointment_id}/ics`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white hover:bg-white/10"
                >
                  Télécharger .ics
                </a>
                {a.status !== 'cancelled' ? (
                  <button
                    onClick={() => cancel(a.appointment_id)}
                    className="rounded-xl border border-white/10 bg-zinc-950/40 px-3 py-2 text-xs text-zinc-200 hover:bg-white/5"
                  >
                    Annuler
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </BackofficeShell>
  )
}
