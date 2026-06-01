import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import BackButton from '@/components/BackButton'
import { apiFetch } from '@/lib/api'

export default function ForgotPassword() {
  const { businessId = '' } = useParams()
  const navigate = useNavigate()
  const [identifier, setIdentifier] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await apiFetch(`/api/v1/backoffice/${businessId}/request_password_reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier }),
      })
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-dvh bg-zinc-950 text-zinc-50">
      <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-16">
        <BackButton fallbackTo={`/backoffice/${businessId}/login`} />
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="text-sm font-semibold text-white">Mot de passe oublié</div>
          <div className="mt-1 text-xs text-zinc-300">Business : {businessId}</div>

          {done ? (
            <div className="mt-6 grid gap-4">
              <div className="text-sm text-zinc-200">Si un compte existe, un email de réinitialisation a été envoyé.</div>
              <button onClick={() => navigate(`/backoffice/${businessId}/login`)} className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-zinc-100">
                Retour à la connexion
              </button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="mt-6 grid gap-3">
              <label className="grid gap-1 text-xs text-zinc-300">
                Email ou identifiant
                <input
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="h-10 rounded-lg border border-white/10 bg-zinc-950/40 px-3 text-sm text-white outline-none focus:border-white/25"
                />
              </label>
              {error ? <div className="text-xs text-rose-200">{error}</div> : null}
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => navigate(`/backoffice/${businessId}/login`)} className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white hover:bg-white/10">
                  Annuler
                </button>
                <button type="submit" disabled={loading} className="flex-1 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-zinc-100 disabled:opacity-60">
                  Envoyer
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
