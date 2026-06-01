import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Lock } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { useInternalAuthStore } from '@/store/internalAuthStore'

export default function InternalLogin() {
  const navigate = useNavigate()
  const { setToken } = useInternalAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const data = await apiFetch<{ token: string }>('/api/v1/internal/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      setToken(data.token)
      navigate('/internal/prospection')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-dvh bg-zinc-950 text-zinc-50">
      <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-16">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Lock className="h-4 w-4" />
            Connexion interne
          </div>

          <form onSubmit={onSubmit} className="mt-6 grid gap-3">
            <label className="grid gap-1 text-xs text-zinc-300">
              Email
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
              type="submit"
              disabled={loading || !email.trim() || !password}
              className="mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-zinc-100 disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Se connecter
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

