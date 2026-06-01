import { useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Lock, Loader2 } from 'lucide-react'
import BackButton from '@/components/BackButton'
import { apiFetch } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

type LoginResponse = { token: string } | { mfa_required: true; challenge_id: string }

export default function Login() {
  const { businessId = '' } = useParams()
  const navigate = useNavigate()
  const { setToken } = useAuthStore()
  const location = useLocation()
  const isDemo = import.meta.env.VITE_DEMO_MODE !== 'false'
  const prefill = useMemo(() => {
    const sp = new URLSearchParams(location.search || '')
    const v = sp.get('prefill')
    if (v === '0' || v === 'false') return false
    return true
  }, [location.search])
  const [identifier, setIdentifier] = useState(isDemo && prefill ? 'owner' : '')
  const [password, setPassword] = useState(isDemo && prefill ? 'demo' : '')
  const [challengeId, setChallengeId] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const data = await apiFetch<LoginResponse>(`/api/v1/backoffice/${businessId}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      })
      if ('mfa_required' in data) {
        setChallengeId(data.challenge_id)
      } else {
        setToken(data.token)
        navigate(`/backoffice/${businessId}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  async function onVerify(e: React.FormEvent) {
    e.preventDefault()
    if (!challengeId) return
    setLoading(true)
    setError(null)
    try {
      const data = await apiFetch<{ token: string }>(`/api/v1/backoffice/${businessId}/login/verify_mfa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challenge_id: challengeId, code }),
      })
      setToken(data.token)
      navigate(`/backoffice/${businessId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  async function onResend() {
    if (!challengeId) return
    setResending(true)
    setError(null)
    try {
      await apiFetch(`/api/v1/backoffice/${businessId}/login/resend_mfa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challenge_id: challengeId }),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="min-h-dvh bg-zinc-950 text-zinc-50">
      <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-16">
        <BackButton fallbackTo="/" />
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Lock className="h-4 w-4" />
            Connexion backoffice
          </div>
          <div className="mt-1 text-xs text-zinc-300">Business : {businessId}</div>

          {challengeId ? (
            <form onSubmit={onVerify} className="mt-6 grid gap-3">
              <div className="text-xs text-zinc-300">Code envoyé par SMS.</div>
              <label className="grid gap-1 text-xs text-zinc-300">
                Code (6 chiffres)
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="h-10 rounded-lg border border-white/10 bg-zinc-950/40 px-3 text-sm text-white outline-none focus:border-white/25"
                />
              </label>
              {error ? <div className="text-xs text-rose-200">{error}</div> : null}
              <button
                type="submit"
                disabled={loading || code.trim().length !== 6}
                className="mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-zinc-100 disabled:opacity-60"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Vérifier
              </button>
              <button
                type="button"
                onClick={onResend}
                disabled={resending || loading}
                className="justify-self-start text-xs text-zinc-300 hover:text-white disabled:opacity-60"
              >
                {resending ? 'Renvoi…' : 'Renvoyer le code'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setChallengeId(null)
                  setCode('')
                }}
                className="justify-self-start text-xs text-zinc-300 hover:text-white"
              >
                Changer de compte
              </button>
            </form>
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
              <label className="grid gap-1 text-xs text-zinc-300">
                Mot de passe
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-10 rounded-lg border border-white/10 bg-zinc-950/40 px-3 text-sm text-white outline-none focus:border-white/25"
                />
              </label>
              {error ? <div className="text-xs text-rose-200">{error}</div> : null}
              <button
                type="button"
                onClick={() => navigate(`/backoffice/${businessId}/forgot`)}
                className="justify-self-start text-xs text-zinc-300 hover:text-white"
              >
                Mot de passe oublié ?
              </button>
              <button
                type="submit"
                disabled={loading}
                className="mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-zinc-100 disabled:opacity-60"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Se connecter
              </button>
            </form>
          )}
        </div>
        {isDemo ? (
          <div className="text-xs text-zinc-400">
            Démo : <span className="text-zinc-200">owner / demo</span>
          </div>
        ) : null}
      </div>
    </div>
  )
}
