import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import BackofficeShell from '@/components/backoffice/BackofficeShell'
import BackButton from '@/components/BackButton'
import { apiFetch, authHeaders } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

type Item = {
  audit_id: string
  source_url: string
  status: 'queued' | 'running' | 'done' | 'failed'
  error: string | null
  created_at: string
  updated_at: string
}

export default function SiteAudits() {
  const { businessId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { token } = useAuthStore()
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sourceUrl, setSourceUrl] = useState('')
  const [prefillUrl, setPrefillUrl] = useState<string | null>(null)
  const [me, setMe] = useState<{ role: 'owner' | 'staff' } | null>(null)
  const [staffPerms, setStaffPerms] = useState<Record<string, any>>({})
  const [creating, setCreating] = useState(false)
  const [createdLink, setCreatedLink] = useState<{ public_url: string; docx_url: string; pdf_url: string } | null>(null)
  const pollRef = useRef<number | null>(null)
  const [exporting, setExporting] = useState(false)
  const [includeArchived, setIncludeArchived] = useState(false)

  const origin = useMemo(() => (typeof window === 'undefined' ? '' : window.location.origin), [])
  const jsonUrlFromDocx = (docxUrl: string) => docxUrl.replace('/docx?', '/json?')
  const canWrite = me?.role === 'owner' || Boolean(staffPerms.audits_write)
  const canCreateSite = me?.role === 'owner' || Boolean(staffPerms.settings_write)

  const statusBadge = (s: Item['status']) => {
    const cls =
      s === 'done'
        ? 'bg-emerald-500/10 text-emerald-200'
        : s === 'failed'
          ? 'bg-rose-500/10 text-rose-200'
          : s === 'running'
            ? 'bg-sky-500/10 text-sky-200'
            : 'bg-white/5 text-zinc-200'
    const label = s === 'done' ? 'Terminé' : s === 'failed' ? 'Échec' : s === 'running' ? 'En cours' : 'En file'
    return <span className={`rounded-full border border-white/10 px-2 py-1 text-[11px] font-semibold ${cls}`}>{label}</span>
  }

  useEffect(() => {
    const u = String(searchParams.get('url') || '').trim()
    if (!u) return
    setSourceUrl((prev) => (prev.trim() ? prev : u))
  }, [searchParams])

  useEffect(() => {
    let alive = true
    Promise.all([
      apiFetch<{ config: any }>(`/api/v1/backoffice/${businessId}/settings`, { headers: { ...authHeaders(token) } }),
      apiFetch<{ role: 'owner' | 'staff' }>(`/api/v1/backoffice/${businessId}/me`, { headers: { ...authHeaders(token) } }),
    ])
      .then(([d, meRes]) => {
        if (!alive) return
        const url = String(d?.config?.settings?.onboarding?.current_site_url || '').trim()
        setPrefillUrl(url || null)
        if (!sourceUrl.trim() && url) setSourceUrl(url)
        setMe(meRes)
        const sp = d?.config?.settings?.staff_permissions
        setStaffPerms(sp && typeof sp === 'object' ? sp : {})
      })
      .catch(() => {
        if (!alive) return
        setPrefillUrl(null)
        setMe(null)
        setStaffPerms({})
      })
    return () => {
      alive = false
    }
  }, [businessId, token])

  async function refresh() {
    const res = await apiFetch<{ items: Item[] }>(`/api/v1/backoffice/${businessId}/site_audits${includeArchived ? '?include_archived=1' : ''}`, {
      headers: { ...authHeaders(token) },
    })
    setItems(res.items || [])
  }

  useEffect(() => {
    let alive = true
    setLoading(true)
    refresh()
      .then(() => {
        if (!alive) return
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
  }, [businessId, token, includeArchived])

  useEffect(() => {
    const needsPoll = items.some((it) => it.status === 'queued' || it.status === 'running')
    if (!needsPoll) {
      if (pollRef.current) window.clearInterval(pollRef.current)
      pollRef.current = null
      return
    }
    if (pollRef.current) return
    pollRef.current = window.setInterval(() => {
      refresh().catch(() => {})
    }, 2500)
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [items, businessId, token])

  async function create() {
    if (!canWrite) {
      setError('Permission requise (Audit IA édition).')
      return
    }
    setCreating(true)
    setError(null)
    setCreatedLink(null)
    try {
      const res = await apiFetch<{ audit_id: string; public_url: string; docx_url: string; pdf_url: string }>(`/api/v1/backoffice/${businessId}/site_audits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({ source_url: sourceUrl }),
      })
      setSourceUrl('')
      setCreatedLink({ public_url: res.public_url, docx_url: res.docx_url, pdf_url: res.pdf_url })
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setCreating(false)
    }
  }

  async function createWith(url: string) {
    const u = String(url || '').trim()
    if (!u) return
    if (!canWrite) {
      setError('Permission requise (Audit IA édition).')
      return
    }
    setSourceUrl(u)
    setCreating(true)
    setError(null)
    setCreatedLink(null)
    try {
      const res = await apiFetch<{ audit_id: string; public_url: string; docx_url: string; pdf_url: string }>(`/api/v1/backoffice/${businessId}/site_audits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({ source_url: u }),
      })
      setSourceUrl('')
      setCreatedLink({ public_url: res.public_url, docx_url: res.docx_url, pdf_url: res.pdf_url })
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setCreating(false)
    }
  }

  async function rotateLink(auditId: string) {
    if (!canWrite) {
      setError('Permission requise (Audit IA édition).')
      return
    }
    setError(null)
    try {
      const res = await apiFetch<{ public_url: string; docx_url: string; pdf_url: string }>(`/api/v1/backoffice/${businessId}/site_audits/${auditId}/public_link`, {
        method: 'POST',
        headers: { ...authHeaders(token) },
      })
      setCreatedLink({ public_url: res.public_url, docx_url: res.docx_url, pdf_url: res.pdf_url })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    }
  }

  async function openAudit(auditId: string) {
    if (!canWrite) {
      setError('Permission requise (Audit IA édition).')
      return
    }
    setError(null)
    try {
      const res = await apiFetch<{ public_url: string; docx_url: string; pdf_url: string }>(`/api/v1/backoffice/${businessId}/site_audits/${auditId}/public_link`, {
        method: 'POST',
        headers: { ...authHeaders(token) },
      })
      setCreatedLink({ public_url: res.public_url, docx_url: res.docx_url, pdf_url: res.pdf_url })
      window.open(`${origin}${res.public_url}`, '_blank', 'noopener,noreferrer')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    }
  }

  async function downloadPdf(auditId: string) {
    if (!canWrite) {
      setError('Permission requise (Audit IA édition).')
      return
    }
    setError(null)
    try {
      const res = await apiFetch<{ public_url: string; docx_url: string; pdf_url: string }>(`/api/v1/backoffice/${businessId}/site_audits/${auditId}/public_link`, {
        method: 'POST',
        headers: { ...authHeaders(token) },
      })
      setCreatedLink({ public_url: res.public_url, docx_url: res.docx_url, pdf_url: res.pdf_url })
      window.open(res.pdf_url, '_blank', 'noopener,noreferrer')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    }
  }

  async function downloadJson(auditId: string) {
    if (!canWrite) {
      setError('Permission requise (Audit IA édition).')
      return
    }
    setError(null)
    try {
      const res = await apiFetch<{ public_url: string; docx_url: string; pdf_url: string }>(`/api/v1/backoffice/${businessId}/site_audits/${auditId}/public_link`, {
        method: 'POST',
        headers: { ...authHeaders(token) },
      })
      setCreatedLink({ public_url: res.public_url, docx_url: res.docx_url, pdf_url: res.pdf_url })
      const jsonUrl = jsonUrlFromDocx(res.docx_url)
      window.open(jsonUrl, '_blank', 'noopener,noreferrer')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    }
  }

  async function deleteAudit(auditId: string) {
    if (!canWrite) {
      setError('Permission requise (Audit IA édition).')
      return
    }
    if (!window.confirm('Supprimer cet audit ?')) return
    setError(null)
    try {
      await apiFetch(`/api/v1/backoffice/${businessId}/site_audits/${auditId}`, { method: 'DELETE', headers: { ...authHeaders(token) } })
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    }
  }

  async function archiveAudit(auditId: string) {
    if (!canWrite) {
      setError('Permission requise (Audit IA édition).')
      return
    }
    if (!window.confirm('Archiver cet audit ?')) return
    setError(null)
    try {
      await apiFetch(`/api/v1/backoffice/${businessId}/site_audits/${auditId}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({ archived: true }),
      })
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    }
  }

  async function exportCsv() {
    setExporting(true)
    setError(null)
    try {
      const res = await fetch(`/api/v1/backoffice/${businessId}/site_audits?format=csv&limit=100&offset=0`, { headers: { ...authHeaders(token) } })
      const text = await res.text()
      if (!res.ok) throw new Error(text || `HTTP ${res.status}`)
      const blob = new Blob([text], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `site_audits_${businessId}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setExporting(false)
    }
  }

  function goCreateSite(auditId: string) {
    const url = `/backoffice/${businessId}/create-site?from_audit=${encodeURIComponent(auditId)}&open_preview=1`
    navigate(url)
  }

  return (
    <BackofficeShell businessId={businessId}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <BackButton fallbackTo={`/backoffice/${businessId}`} />
          <div>
            <h1 className="text-lg font-semibold text-white">Audit IA</h1>
            <div className="mt-1 text-xs text-zinc-300">Analyse d’un petit site existant et génération d’un audit public + Word.</div>
            {!canWrite && me?.role === 'staff' ? <div className="mt-1 text-xs text-zinc-400">Lecture seule (activer “Audit IA (édition)” dans Réglages).</div> : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setIncludeArchived((p) => !p)} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white hover:bg-white/10">
            {includeArchived ? 'Masquer archivés' : 'Afficher archivés'}
          </button>
          <button
            onClick={exportCsv}
            disabled={exporting}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white hover:bg-white/10 disabled:opacity-60"
          >
            {exporting ? 'Export…' : 'Exporter CSV'}
          </button>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-white/10 bg-zinc-950/40 p-4">
        <div className="text-sm font-semibold text-white">Nouveau audit</div>
        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
          <input
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://exemple.fr"
            disabled={!canWrite}
            className="h-11 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-white/25 disabled:opacity-60"
          />
          <button
            disabled={creating || !sourceUrl.trim() || !canWrite}
            onClick={create}
            className="h-11 rounded-xl bg-white px-4 text-sm font-semibold text-zinc-950 hover:bg-zinc-100 disabled:opacity-60"
          >
            Générer
          </button>
        </div>
        {prefillUrl ? (
          <div className="mt-2 text-xs text-zinc-400">
            Site actuel (Réglages) :{' '}
            <button
              onClick={() => setSourceUrl(prefillUrl)}
              className="underline decoration-white/30 underline-offset-2 hover:text-zinc-200"
            >
              {prefillUrl}
            </button>
          </div>
        ) : null}
        {createdLink ? (
          <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-zinc-200">
            <div className="text-xs uppercase tracking-wider text-zinc-400">Lien public</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <a className="underline" href={`${origin}${createdLink.public_url}`} target="_blank" rel="noreferrer">
                {origin}
                {createdLink.public_url}
              </a>
              <a className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-200 hover:bg-white/10" href={createdLink.docx_url}>
                Word
              </a>
              <a className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-200 hover:bg-white/10" href={createdLink.pdf_url}>
                PDF
              </a>
              <a
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-200 hover:bg-white/10"
                href={jsonUrlFromDocx(createdLink.docx_url)}
              >
                JSON
              </a>
            </div>
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className="mt-8 text-sm text-zinc-300">Chargement…</div>
      ) : error ? (
        <div className="mt-8 text-sm text-rose-200">{error}</div>
      ) : (
        <div className="mt-6 grid gap-2">
          {items.length === 0 ? (
            <div className="text-sm text-zinc-400">Aucun audit.</div>
          ) : (
            items.map((it) => (
              <div key={it.audit_id} className="rounded-2xl border border-white/10 bg-zinc-950/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-white">{it.source_url}</div>
                    <div className="mt-1 text-xs text-zinc-400">
                      {statusBadge(it.status)} <span className="mx-2 text-white/10">•</span> {new Date(it.created_at).toLocaleString()}
                      {it.error ? ` • ${it.error}` : ''}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => {
                        if (!canCreateSite) {
                          setError('Droits requis : “Modifier réglages”.')
                          return
                        }
                        if (it.status !== 'done') {
                          setError('Audit non terminé. Attends le statut “Terminé” puis réessaie.')
                          return
                        }
                        window.location.href = `/backoffice/${businessId}/settings`
                      }}
                      disabled={!canWrite || !canCreateSite || it.status !== 'done'}
                      className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-zinc-950 hover:bg-zinc-100 disabled:opacity-60"
                    >
                      Créer un site
                    </button>
                    <button
                      onClick={() => openAudit(it.audit_id)}
                      disabled={!canWrite}
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-200 hover:bg-white/10 disabled:opacity-60"
                    >
                      Ouvrir
                    </button>
                    <button
                      onClick={() => rotateLink(it.audit_id)}
                      disabled={!canWrite}
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-200 hover:bg-white/10 disabled:opacity-60"
                    >
                      Lien
                    </button>
                    <button
                      onClick={() => createWith(it.source_url)}
                      disabled={creating || !canWrite}
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-200 hover:bg-white/10 disabled:opacity-60"
                    >
                      Relancer
                    </button>
                    <button
                      onClick={() => downloadJson(it.audit_id)}
                      disabled={!canWrite}
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-200 hover:bg-white/10 disabled:opacity-60"
                    >
                      JSON
                    </button>
                    <button
                      onClick={() => downloadPdf(it.audit_id)}
                      disabled={!canWrite}
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-200 hover:bg-white/10 disabled:opacity-60"
                    >
                      PDF
                    </button>
                    <button
                      onClick={() => archiveAudit(it.audit_id)}
                      disabled={!canWrite}
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-200 hover:bg-white/10 disabled:opacity-60"
                    >
                      Archiver
                    </button>
                    <button
                      onClick={() => deleteAudit(it.audit_id)}
                      disabled={!canWrite}
                      className="rounded-xl border border-white/10 bg-rose-500/10 px-3 py-2 text-xs text-rose-200 hover:bg-rose-500/15 disabled:opacity-60"
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </BackofficeShell>
  )
}
