import { useEffect, useMemo, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { apiFetch } from '@/lib/api'

type HomeData = {
  portal_id: string
  business_id: string
  lead_id: string
  site: { site_status: string; site_started_at: string | null; site_delivered_at: string | null } | null
  preview_enabled: boolean
  preview_token: string | null
  checklist: { item_key: string; done: number | boolean; updated_at: string }[]
  messages: { direction: string; author_label: string | null; text: string; created_at: string }[]
}

function useQuery() {
  const location = useLocation()
  return useMemo(() => new URLSearchParams(location.search || ''), [location.search])
}

function sessionKey(portalId: string) {
  return `portal_session:${portalId}`
}

export default function Portal() {
  const { portalId = '' } = useParams()
  const query = useQuery()
  const portalToken = String(query.get('t') || '').trim()

  const [checking, setChecking] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [pin, setPin] = useState('')
  const [unlocking, setUnlocking] = useState(false)

  const [sessionToken, setSessionToken] = useState<string | null>(null)
  const [home, setHome] = useState<HomeData | null>(null)
  const [loadingHome, setLoadingHome] = useState(false)
  const [messageText, setMessageText] = useState('')
  const [sending, setSending] = useState(false)
  const [updatingChecklist, setUpdatingChecklist] = useState<Record<string, boolean>>({})

  async function loadHome(nextSessionToken: string) {
    setLoadingHome(true)
    try {
      const d = await apiFetch<HomeData>(`/api/v1/public/portal/${encodeURIComponent(portalId)}/home?t=${encodeURIComponent(portalToken)}&s=${encodeURIComponent(nextSessionToken)}`)
      setHome(d)
      setError(null)
    } catch (e) {
      setHome(null)
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setLoadingHome(false)
    }
  }

  useEffect(() => {
    let alive = true
    if (!portalId || !portalToken) {
      setError('Lien invalide')
      setChecking(false)
      return
    }
    setChecking(true)
    apiFetch<{ portal_id: string; preview_enabled: boolean }>(`/api/v1/public/portal/${encodeURIComponent(portalId)}?t=${encodeURIComponent(portalToken)}`)
      .then(() => {
        if (!alive) return
        const saved = window.localStorage.getItem(sessionKey(portalId))
        if (saved) {
          setSessionToken(saved)
          void loadHome(saved)
        }
        setError(null)
      })
      .catch((e) => {
        if (!alive) return
        setError(e instanceof Error ? e.message : 'Erreur')
      })
      .finally(() => {
        if (!alive) return
        setChecking(false)
      })
    return () => {
      alive = false
    }
  }, [portalId, portalToken])

  async function onUnlock(e: React.FormEvent) {
    e.preventDefault()
    const p = pin.trim()
    if (!p) return
    setUnlocking(true)
    try {
      const d = await apiFetch<{ session_token: string }>(`/api/v1/public/portal/${encodeURIComponent(portalId)}/unlock?t=${encodeURIComponent(portalToken)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: p }),
      })
      window.localStorage.setItem(sessionKey(portalId), d.session_token)
      setSessionToken(d.session_token)
      await loadHome(d.session_token)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setUnlocking(false)
    }
  }

  const siteStatus = home?.site?.site_status || 'todo'
  const checklistDefs = useMemo(
    () => [
      { key: 'content', label: 'Contenus (textes/services/zones/tarifs)' },
      { key: 'branding', label: 'Identité visuelle (logo/couleurs)' },
      { key: 'media', label: 'Médias (photos, réalisations)' },
    ],
    [],
  )
  const checklistState = useMemo(() => {
    const out: Record<string, boolean> = {}
    for (const d of home?.checklist || []) out[String(d.item_key)] = Boolean(d.done)
    return out
  }, [home])

  return (
    <div className="min-h-dvh bg-zinc-950 text-zinc-50">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="text-xs uppercase tracking-[0.25em] text-zinc-400">Portail client</div>

        {checking ? <div className="mt-4 text-sm text-zinc-300">Chargement…</div> : null}
        {error ? <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-rose-200">{error}</div> : null}

        {!checking && !sessionToken ? (
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-sm font-semibold text-white">Accès</div>
            <form onSubmit={onUnlock} className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="grid flex-1 gap-1 text-xs text-zinc-300">
                Code PIN
                <input
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  className="h-10 rounded-xl border border-white/10 bg-zinc-950/40 px-3 text-sm text-white outline-none focus:border-white/25"
                />
              </label>
              <button type="submit" disabled={unlocking || !pin.trim()} className="h-10 rounded-xl bg-white px-4 text-sm font-semibold text-zinc-950 disabled:opacity-60">
                {unlocking ? 'Vérification…' : 'Accéder'}
              </button>
            </form>
          </div>
        ) : null}

        {sessionToken ? (
          <div className="mt-6 grid gap-4">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-sm font-semibold text-white">Avancement</div>
              <div className="mt-2 text-sm text-zinc-200">Statut : {loadingHome ? '…' : siteStatus}</div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(window.location.href)
                    } catch {}
                  }}
                  className="h-9 rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-semibold text-zinc-200 hover:bg-white/10"
                >
                  Copier le lien
                </button>
                <button
                  type="button"
                  onClick={() => {
                    window.localStorage.removeItem(sessionKey(portalId))
                    setSessionToken(null)
                    setHome(null)
                    setPin('')
                    setMessageText('')
                  }}
                  className="h-9 rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-semibold text-zinc-200 hover:bg-white/10"
                >
                  Déconnexion
                </button>
              </div>
              {home?.preview_enabled && home?.preview_token ? (
                <a
                  href={`/portal/${encodeURIComponent(portalId)}/preview?t=${encodeURIComponent(home.preview_token)}`}
                  className="mt-3 inline-flex h-10 items-center rounded-xl bg-white px-4 text-sm font-semibold text-zinc-950"
                >
                  Voir la preview du site
                </a>
              ) : (
                <div className="mt-3 text-xs text-zinc-400">Preview non disponible</div>
              )}
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-sm font-semibold text-white">Checklist</div>
              <div className="mt-3 grid gap-2">
                {checklistDefs.map((d) => (
                  <label key={d.key} className="flex items-start gap-3 rounded-xl border border-white/10 bg-zinc-950/40 px-3 py-3">
                    <input
                      type="checkbox"
                      aria-label={d.label}
                      checked={Boolean(checklistState[d.key])}
                      disabled={Boolean(updatingChecklist[d.key])}
                      onChange={async (e) => {
                        if (!sessionToken) return
                        const next = e.target.checked
                        setUpdatingChecklist((s) => ({ ...s, [d.key]: true }))
                        try {
                          await apiFetch(`/api/v1/public/portal/${encodeURIComponent(portalId)}/checklist?t=${encodeURIComponent(portalToken)}&s=${encodeURIComponent(sessionToken)}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ item_key: d.key, done: next }),
                          })
                          setHome((h) => {
                            if (!h) return h
                            const rest = (h.checklist || []).filter((x) => String(x.item_key) !== d.key)
                            return { ...h, checklist: [...rest, { item_key: d.key, done: next ? 1 : 0, updated_at: new Date().toISOString() }] }
                          })
                        } finally {
                          setUpdatingChecklist((s) => ({ ...s, [d.key]: false }))
                        }
                      }}
                      className="mt-1 h-4 w-4"
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white">{d.label}</div>
                      <div className="mt-1 text-xs text-zinc-400">{checklistState[d.key] ? 'Validé' : 'En attente'}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-sm font-semibold text-white">Messages</div>
              <div className="mt-3 grid gap-2">
                {(home?.messages || []).map((m, idx) => (
                  <div key={idx} className="rounded-xl border border-white/10 bg-zinc-950/40 px-3 py-3">
                    <div className="text-xs text-zinc-400">{m.author_label || m.direction}</div>
                    <div className="mt-1 text-sm text-white">{m.text}</div>
                  </div>
                ))}
                {(home?.messages || []).length === 0 ? <div className="text-sm text-zinc-300">Aucun message</div> : null}
              </div>
              <form
                onSubmit={async (e) => {
                  e.preventDefault()
                  if (!sessionToken) return
                  const t = messageText.trim()
                  if (!t) return
                  setSending(true)
                  try {
                    await apiFetch(`/api/v1/public/portal/${encodeURIComponent(portalId)}/messages?t=${encodeURIComponent(portalToken)}&s=${encodeURIComponent(sessionToken)}`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ text: t }),
                    })
                    setMessageText('')
                    await loadHome(sessionToken)
                  } catch (e) {
                    setError(e instanceof Error ? e.message : 'Erreur')
                  } finally {
                    setSending(false)
                  }
                }}
                className="mt-3 grid gap-2"
              >
                <label className="grid gap-1 text-xs text-zinc-300">
                  Nouveau message
                  <textarea
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    className="min-h-24 rounded-xl border border-white/10 bg-zinc-950/40 px-3 py-2 text-sm text-white outline-none focus:border-white/25"
                  />
                </label>
                <button
                  type="submit"
                  disabled={sending || !messageText.trim()}
                  className="h-10 rounded-xl bg-white px-4 text-sm font-semibold text-zinc-950 disabled:opacity-60"
                >
                  {sending ? 'Envoi…' : 'Envoyer'}
                </button>
              </form>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
