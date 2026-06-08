import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowRight, Filter, MessageCircle, Phone } from 'lucide-react'
import BackofficeShell from '@/components/backoffice/BackofficeShell'
import BackButton from '@/components/BackButton'
import { apiFetch, authHeaders } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { cn } from '@/lib/utils'
import { track } from '@/utils/tracking'

type LeadRow = {
  lead_id: string
  created_at: string
  status: string
  stage: string | null
  assignee_user_id: string | null
  trade_id: string
  request_type: string
  urgency: string
  city: string
  channel_preference: string
  phone_valid: boolean
  sms_opt_in: boolean
  whatsapp_opt_in: boolean
  tags: string[]
  score: number
  decision: string
  first_name: string
  phone_e164: string
}

type ListResponse = { items: LeadRow[]; total: number }

function urgencyLabel(u: string) {
  if (u === 'now') return 'Urgent'
  if (u === 'today') return 'Aujourd’hui'
  if (u === 'week') return 'Cette semaine'
  if (u === 'plan') return 'Cette semaine'
  return u || '—'
}

export default function Inbox() {
  const { businessId = '' } = useParams()
  const { token } = useAuthStore()
  const navigate = useNavigate()
  const [role, setRole] = useState<'owner' | 'staff' | null>(null)
  const [staffPerms, setStaffPerms] = useState<Record<string, any>>({})
const [siteSourceUrl, setSiteSourceUrl] = useState('')
const [sitePrefillUrl, setSitePrefillUrl] = useState<string | null>(null)
const [siteCreating, setSiteCreating] = useState(false)
const [siteCreateError, setSiteCreateError] = useState<string | null>(null)
  const [canExport, setCanExport] = useState(false)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<string>('')
  const [urgency, setUrgency] = useState<string>('')
  const [stage, setStage] = useState<string>('')
  const [tag, setTag] = useState<string>('')
  const [pipelineStages, setPipelineStages] = useState<Array<{ id: string; label?: string }>>([])
  const [data, setData] = useState<ListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  const query = useMemo(() => {
    const p = new URLSearchParams()
    if (q) p.set('q', q)
    if (status) p.set('status', status)
    if (urgency) p.set('urgency', urgency)
    if (stage) p.set('stage', stage)
    if (tag) p.set('tag', tag)
    return p.toString()
  }, [q, status, urgency, stage, tag])

  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.all([
      apiFetch<ListResponse>(`/api/v1/backoffice/${businessId}/leads?${query}`, { headers: { ...authHeaders(token) } }),
      apiFetch<{ role: 'owner' | 'staff' }>(`/api/v1/backoffice/${businessId}/me`, { headers: { ...authHeaders(token) } }),
      apiFetch<{ config: any }>(`/api/v1/backoffice/${businessId}/settings`, { headers: { ...authHeaders(token) } }),
    ])
      .then(([d, me, settings]) => {
        if (!alive) return
        setData(d)
        setRole(me.role)
        const perms = settings?.config?.settings?.staff_permissions || {}
        setCanExport(me.role === 'owner' || Boolean(perms.export_leads))
        setPipelineStages(Array.isArray(settings?.config?.settings?.pipeline_stages) ? settings.config.settings.pipeline_stages : [])
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
  }, [businessId, query, token])

  async function exportCsv() {
    setExporting(true)
    setError(null)
    try {
      const res = await fetch(`/api/v1/backoffice/${businessId}/leads/export?${query}`, { headers: { ...authHeaders(token) } })
      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        throw new Error(txt || `HTTP ${res.status}`)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `leads-${businessId}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setExporting(false)
    }
  }

  async function exportXlsx() {
    setExporting(true)
    setError(null)
    try {
      const res = await fetch(`/api/v1/backoffice/${businessId}/leads/export.xlsx?${query}`, { headers: { ...authHeaders(token) } })
      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        throw new Error(txt || `HTTP ${res.status}`)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `leads-${businessId}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setExporting(false)
    }
  }

  return (
    <BackofficeShell businessId={businessId}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <BackButton fallbackTo={`/backoffice/${businessId}`} />
          <div>
            <h1 className="text-lg font-semibold text-white">Demandes</h1>
            <div className="mt-1 text-xs text-zinc-300">Répondez vite : ça augmente le taux de gain.</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher…"
            className="h-9 w-44 rounded-xl border border-white/10 bg-zinc-950/40 px-3 text-xs text-zinc-200 outline-none focus:border-white/25"
          />
          {canExport ? (
            <>
              <button
                onClick={exportCsv}
                disabled={exporting}
                className="rounded-xl border border-white/10 bg-zinc-950/40 px-3 py-2 text-xs text-zinc-200 hover:bg-white/5 disabled:opacity-60"
              >
                {exporting ? 'Export…' : 'Exporter CSV'}
              </button>
              <button
                onClick={exportXlsx}
                disabled={exporting}
                className="rounded-xl border border-white/10 bg-zinc-950/40 px-3 py-2 text-xs text-zinc-200 hover:bg-white/5 disabled:opacity-60"
              >
                {exporting ? 'Export…' : 'Exporter Excel'}
              </button>
            </>
          ) : null}
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-zinc-950/40 px-3 py-2 text-xs text-zinc-200">
            <Filter className="h-4 w-4" />
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="bg-transparent outline-none"
            >
              <option value="" className="bg-zinc-950">
                Tous statuts
              </option>
              {['new', 'qualified', 'needs_followup', 'contacted', 'appointment', 'quote_sent', 'won', 'lost'].map((s) => (
                <option key={s} value={s} className="bg-zinc-950">
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-zinc-950/40 px-3 py-2 text-xs text-zinc-200">
            <select value={urgency} onChange={(e) => setUrgency(e.target.value)} className="bg-transparent outline-none">
              <option value="" className="bg-zinc-950">
                Toutes priorités
              </option>
              {[
                ['now', 'Urgent'],
                ['today', 'Aujourd’hui'],
                ['week', 'Cette semaine'],
              ].map(([k, label]) => (
                <option key={k} value={k} className="bg-zinc-950">
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-zinc-950/40 px-3 py-2 text-xs text-zinc-200">
            <AlertTriangle className="h-4 w-4" />
            <select value={tag} onChange={(e) => setTag(e.target.value)} className="bg-transparent outline-none">
              <option value="" className="bg-zinc-950">
                Tous tags
              </option>
              {['urgent', 'missing_photos', 'out_of_zone', 'danger', 'security', 'glass_hazard', 'sanitary_urgent'].map((t) => (
                <option key={t} value={t} className="bg-zinc-950">
                  {t}
                </option>
              ))}
            </select>
            <select value={stage} onChange={(e) => setStage(e.target.value)} className="bg-transparent outline-none">
              <option value="" className="bg-zinc-950">
                Toutes étapes
              </option>
              {pipelineStages.map((s) => (
                <option key={s.id} value={s.id} className="bg-zinc-950">
                  {s.label || s.id}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-white/10">
        <div className="grid grid-cols-[1.2fr_.8fr_.7fr_.7fr_.4fr] gap-2 bg-white/5 px-4 py-3 text-[11px] uppercase tracking-wider text-zinc-400">
          <div>Demande</div>
          <div>Ville</div>
          <div>Statut</div>
          <div>Tags</div>
          <div />
        </div>
        {loading ? (
          <div className="px-4 py-10 text-sm text-zinc-300">Chargement…</div>
        ) : error ? (
          <div className="px-4 py-10 text-sm text-rose-200">{error}</div>
        ) : !data || data.items.length === 0 ? (
          <div className="px-4 py-10 text-sm text-zinc-300">Aucune demande.</div>
        ) : (
          <div className="divide-y divide-white/10">
            {data.items.map((l) => (
              <div key={l.lead_id} className="grid grid-cols-[1.2fr_.8fr_.7fr_.7fr_.4fr] gap-2 px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-white">{l.request_type}</div>
                  <div className="mt-0.5 text-xs text-zinc-400">
                    {l.first_name} • {urgencyLabel(l.urgency)} • score {Math.round(l.score)}
                  </div>
                </div>
                <div className="text-sm text-zinc-200">{l.city}</div>
                <div className="text-sm text-zinc-200">{l.status}</div>
                <div className="flex flex-wrap gap-1">
                  {l.tags.slice(0, 3).map((t) => (
                    <span
                      key={t}
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[11px]',
                        t === 'urgent' ? 'bg-amber-500/15 text-amber-200' : 'bg-white/10 text-zinc-200',
                      )}
                    >
                      {t}
                    </span>
                  ))}
                </div>
                <div className="flex justify-end">
                  <div className="flex items-center gap-2">
                    {l.phone_valid ? (
                      <a
                        href={`tel:${l.phone_e164}`}
                        onClick={() =>
                          void track(businessId, l.trade_id, 'click_call', {
                            page_type: 'other',
                            page_path: window.location.pathname,
                            properties: { cta_id: 'inline', lead_id: l.lead_id },
                          }).catch(() => {})
                        }
                        className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-200 hover:bg-white/10"
                        aria-label="Appeler"
                      >
                        <Phone className="h-4 w-4" />
                      </a>
                    ) : null}
                    {l.whatsapp_opt_in ? (
                      <a
                        href={`https://wa.me/${l.phone_e164.replace('+', '')}`}
                        onClick={() =>
                          void track(businessId, l.trade_id, 'click_whatsapp', {
                            page_type: 'other',
                            page_path: window.location.pathname,
                            properties: { cta_id: 'inline', lead_id: l.lead_id },
                          }).catch(() => {})
                        }
                        className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-200 hover:bg-white/10"
                        aria-label="WhatsApp"
                      >
                        <MessageCircle className="h-4 w-4" />
                      </a>
                    ) : null}
                    <Link
                      to={`/backoffice/${businessId}/leads/${l.lead_id}`}
                      className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-zinc-950 hover:bg-zinc-100"
                    >
                      Ouvrir
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </BackofficeShell>
  )
}
