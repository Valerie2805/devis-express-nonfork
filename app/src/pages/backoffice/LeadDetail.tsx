import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2, MessageSquareText, Phone, Save } from 'lucide-react'
import BackofficeShell from '@/components/backoffice/BackofficeShell'
import { apiFetch, authHeaders } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { track } from '@/utils/tracking'

type LeadDetailResponse = {
  lead: any
  messages: Array<{ message_id: string; created_at: string; channel: string; template_id: string; status: string; rendered_text: string }>
}

type PortalMessagesResponse = {
  portal_id: string | null
  messages: Array<{ direction: string; author_label: string | null; text: string; created_at: string }>
}

function urgencyLabel(u: string) {
  if (u === 'now') return 'Urgent'
  if (u === 'today') return 'Aujourd’hui'
  if (u === 'week') return 'Cette semaine'
  if (u === 'plan') return 'Cette semaine'
  return u || '—'
}

export default function LeadDetail() {
  const { businessId = '', leadId = '' } = useParams()
  const { token } = useAuthStore()
  const [data, setData] = useState<LeadDetailResponse | null>(null)
  const [portal, setPortal] = useState<PortalMessagesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string>('')
  const [stage, setStage] = useState<string>('')
  const [urgency, setUrgency] = useState<string>('')
  const [role, setRole] = useState<'owner' | 'staff' | null>(null)
  const [canAnonymize, setCanAnonymize] = useState(false)
  const [pipelineStages, setPipelineStages] = useState<Array<{ id: string; label?: string }>>([])

  const [channel, setChannel] = useState<'sms' | 'whatsapp'>('sms')
  const [templateId, setTemplateId] = useState('ack')
  const [messageMode, setMessageMode] = useState<'template' | 'custom'>('template')
  const [customText, setCustomText] = useState('')
  const [draftLoading, setDraftLoading] = useState(false)
  const [draftError, setDraftError] = useState<string | null>(null)
  const [slot1, setSlot1] = useState('demain 14h')
  const [slot2, setSlot2] = useState('demain 18h')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [wonAmount, setWonAmount] = useState('')
  const [wonAmountError, setWonAmountError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [saving, setSaving] = useState(false)
  const [portalText, setPortalText] = useState('')
  const [portalSending, setPortalSending] = useState(false)

  const templates = useMemo(
    () => [
      { id: 'ack', label: 'Accusé réception' },
      { id: 'need_photo', label: 'Demander photo' },
      { id: 'safety', label: 'Sécurité (métier)' },
      { id: 'quick_questions', label: 'Questions rapides (métier)' },
      { id: 'pricing_reassurance', label: 'Rassurer prix (métier)' },
      { id: 'propose_slot', label: 'Proposer créneaux' },
      { id: 'confirm_slot', label: 'Confirmer RDV' },
      { id: 'out_of_zone', label: 'Hors zone' },
      { id: 'missed_call_followup', label: 'Appel manqué' },
    ],
    [],
  )

  function parseAmountToCents(v: string) {
    const s = String(v || '')
      .replace(/\s/g, '')
      .replace(',', '.')
      .trim()
    if (!s) return null
    const n = Number(s)
    if (!Number.isFinite(n) || n < 0) return null
    return Math.round(n * 100)
  }

  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.all([
      apiFetch<LeadDetailResponse>(`/api/v1/backoffice/${businessId}/leads/${leadId}`, { headers: { ...authHeaders(token) } }),
      apiFetch<PortalMessagesResponse>(`/api/v1/backoffice/${businessId}/leads/${leadId}/portal/messages`, { headers: { ...authHeaders(token) } }),
      apiFetch<{ role: 'owner' | 'staff' }>(`/api/v1/backoffice/${businessId}/me`, { headers: { ...authHeaders(token) } }),
      apiFetch<{ config: any }>(`/api/v1/backoffice/${businessId}/settings`, { headers: { ...authHeaders(token) } }),
    ])
      .then(([d, portalData, me, settings]) => {
        if (!alive) return
        setData(d)
        setPortal(portalData)
        setStatus(String(d.lead.status || ''))
        setStage(String(d.lead.stage || ''))
        setUrgency(String(d.lead.urgency || ''))
        setAddress(String(d.lead.address || ''))
        setNotes(String(d.lead.notes || ''))
        const cents = Number(d?.lead?.outcome?.amount_cents || 0)
        setWonAmount(cents > 0 ? (cents / 100).toFixed(2).replace('.', ',') : '')
        setRole(me.role)
        const perms = settings?.config?.settings?.staff_permissions || {}
        setCanAnonymize(me.role === 'owner' || Boolean(perms.lead_anonymize))
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
  }, [businessId, leadId, token])

  async function sendMessage() {
    if (!data) return
    setSending(true)
    try {
      if (messageMode === 'custom') {
        await apiFetch(`/api/v1/backoffice/${businessId}/leads/${leadId}/messages/raw`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
          body: JSON.stringify({ channel, text: customText }),
        })
        setCustomText('')
        setMessageMode('template')
      } else {
        await apiFetch(`/api/v1/backoffice/${businessId}/leads/${leadId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
          body: JSON.stringify({
            channel,
            template_id: templateId === 'need_photo' ? 'need_photo_generic' : templateId,
            variables: { slot_1: slot1, slot_2: slot2, date, time, address },
          }),
        })
      }
      const refreshed = await apiFetch<LeadDetailResponse>(`/api/v1/backoffice/${businessId}/leads/${leadId}`, {
        headers: { ...authHeaders(token) },
      })
      setData(refreshed)
    } finally {
      setSending(false)
    }
  }

  async function sendPortalMessage() {
    const text = portalText.trim()
    if (!text) return
    setPortalSending(true)
    try {
      await apiFetch(`/api/v1/backoffice/${businessId}/leads/${leadId}/portal/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({ text }),
      })
      setPortalText('')
      const refreshed = await apiFetch<PortalMessagesResponse>(`/api/v1/backoffice/${businessId}/leads/${leadId}/portal/messages`, {
        headers: { ...authHeaders(token) },
      })
      setPortal(refreshed)
    } finally {
      setPortalSending(false)
    }
  }

  async function proposeDraft() {
    setDraftLoading(true)
    setDraftError(null)
    try {
      const out = await apiFetch<{ mode: 'rules' | 'ai'; text: string }>(`/api/v1/backoffice/${businessId}/leads/${leadId}/ai/message_draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({ channel }),
      })
      setCustomText(out.text)
      setMessageMode('custom')
    } catch (e) {
      setDraftError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setDraftLoading(false)
    }
  }

  async function saveStatus() {
    setSaving(true)
    setWonAmountError(null)
    try {
      const body: any = {
        status,
        stage: stage || null,
        urgency: urgency || null,
        notes: notes || null,
        appointment: date && time ? { date, time, address } : undefined,
      }
      if (status === 'won') {
        const cents = parseAmountToCents(wonAmount)
        if (cents !== null) body.outcome = { amount_cents: cents, currency: 'EUR' }
        else if (wonAmount.trim()) {
          setWonAmountError('Montant invalide')
          return
        }
      }
      await apiFetch(`/api/v1/backoffice/${businessId}/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify(body),
      })
      const refreshed = await apiFetch<LeadDetailResponse>(`/api/v1/backoffice/${businessId}/leads/${leadId}`, {
        headers: { ...authHeaders(token) },
      })
      setData(refreshed)
    } finally {
      setSaving(false)
    }
  }

  async function anonymizeLead() {
    if (!confirm('Anonymiser ce lead ?')) return
    await apiFetch(`/api/v1/backoffice/${businessId}/leads/${leadId}/anonymize`, {
      method: 'POST',
      headers: { ...authHeaders(token) },
    })
    const refreshed = await apiFetch<LeadDetailResponse>(`/api/v1/backoffice/${businessId}/leads/${leadId}`, {
      headers: { ...authHeaders(token) },
    })
    setData(refreshed)
    setStatus(String(refreshed.lead.status || ''))
    setAddress(String(refreshed.lead.address || ''))
  }

  return (
    <BackofficeShell businessId={businessId}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            to={`/backoffice/${businessId}`}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-zinc-950/40 px-3 py-2 text-xs text-zinc-200 hover:bg-white/5"
          >
            <ArrowLeft className="h-4 w-4" />
            Retour
          </Link>
          <div>
            <div className="text-sm font-semibold text-white">Fiche demande</div>
            <div className="text-xs text-zinc-400">{leadId}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canAnonymize ? (
            <button
              onClick={anonymizeLead}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-zinc-950/40 px-3 py-2 text-xs text-zinc-200 hover:bg-white/5"
            >
              Anonymiser
            </button>
          ) : null}
          {data ? (
            <a
              href={`tel:${data.lead.phone_e164}`}
              onClick={() =>
                void track(businessId, String(data.lead.trade_id || ''), 'click_call', {
                  page_type: 'other',
                  page_path: window.location.pathname,
                  properties: { cta_id: 'inline', lead_id: leadId },
                }).catch(() => {})
              }
              className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-zinc-950 hover:bg-zinc-100"
            >
              <Phone className="h-4 w-4" />
              Appeler
            </a>
          ) : null}
        </div>
      </div>

      {loading ? (
        <div className="mt-8 text-sm text-zinc-300">Chargement…</div>
      ) : error || !data ? (
        <div className="mt-8 text-sm text-rose-200">{error || 'Erreur'}</div>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-[1.2fr_.8fr]">
          <div className="rounded-2xl border border-white/10 bg-zinc-950/40 p-5">
            <div className="grid gap-2 text-sm">
              <div className="text-white">
                <span className="text-zinc-400">Nom :</span> {data.lead.first_name}
              </div>
              <div className="text-white">
                <span className="text-zinc-400">Demande :</span> {data.lead.request_type} ({urgencyLabel(String(data.lead.urgency || ''))})
              </div>
              <div className="text-white">
                <span className="text-zinc-400">Ville :</span> {data.lead.city} {data.lead.postal_code}
              </div>
              <div className="text-white">
                <span className="text-zinc-400">Adresse :</span> {data.lead.address || '—'}
              </div>
              <div className="text-white">
                <span className="text-zinc-400">Détails :</span> {data.lead.description || '—'}
              </div>
            </div>
            {Array.isArray(data.lead.photos) && data.lead.photos.length ? (
              <div className="mt-4 grid gap-2">
                <div className="text-xs uppercase tracking-wider text-zinc-400">Photos</div>
                <div className="grid gap-2 md:grid-cols-2">
                  {data.lead.photos.map((p: any) => (
                    <a key={p.asset_id} href={p.url} target="_blank" className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-200 hover:bg-white/10">
                      {p.url}
                    </a>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-5 grid gap-3">
              <div className="text-xs uppercase tracking-wider text-zinc-400">Statut</div>
              <div className="flex items-center gap-2">
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="h-10 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
                >
                  {['new', 'qualified', 'needs_followup', 'contacted', 'appointment', 'quote_sent', 'won', 'lost'].map((s) => (
                    <option key={s} value={s} className="bg-zinc-950">
                      {s}
                    </option>
                  ))}
                </select>
                <select
                  value={urgency}
                  onChange={(e) => setUrgency(e.target.value)}
                  className="h-10 w-44 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
                >
                  <option value="" className="bg-zinc-950">
                    Priorité
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
                <select
                  value={stage}
                  onChange={(e) => setStage(e.target.value)}
                  className="h-10 w-44 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
                >
                  <option value="" className="bg-zinc-950">
                    Étape
                  </option>
                  {pipelineStages.map((s) => (
                    <option key={s.id} value={s.id} className="bg-zinc-950">
                      {s.label || s.id}
                    </option>
                  ))}
                </select>
                <button
                  onClick={saveStatus}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-zinc-100 disabled:opacity-60"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Enregistrer
                </button>
              </div>
              {status === 'won' ? (
                <div className="grid gap-2 md:grid-cols-3">
                  <label className="grid gap-1 text-xs text-zinc-300">
                    Montant gagné (EUR)
                    <input
                      value={wonAmount}
                      onChange={(e) => setWonAmount(e.target.value)}
                      placeholder="199"
                      className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
                    />
                  </label>
                  {wonAmountError ? <div className="self-end text-xs text-rose-200">{wonAmountError}</div> : null}
                </div>
              ) : null}
              <div className="grid gap-2 md:grid-cols-3">
                <input
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  placeholder="Date (YYYY-MM-DD)"
                  className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
                />
                <input
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  placeholder="Heure (HH:MM)"
                  className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
                />
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Adresse"
                  className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
                />
              </div>
              {data?.lead?.appointment?.appointment_id ? (
                <a
                  className="inline-flex w-fit text-xs text-zinc-300 hover:text-white"
                  href={`/api/v1/backoffice/${businessId}/appointments/${data.lead.appointment.appointment_id}/ics`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Télécharger .ics
                </a>
              ) : null}
            </div>

            <div className="mt-6 grid gap-2">
              <div className="text-xs uppercase tracking-wider text-zinc-400">Notes</div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="min-h-24 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/25"
                placeholder="Notes internes…"
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-zinc-950/40 p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <MessageSquareText className="h-4 w-4" />
                Messages
              </div>
              <div className="mt-4 grid gap-3">
                <div className="grid gap-2 md:grid-cols-2">
                  <label className="grid gap-1 text-xs text-zinc-300">
                    Canal
                    <select
                      value={channel}
                      onChange={(e) => setChannel(e.target.value as any)}
                      className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
                    >
                      <option value="sms" className="bg-zinc-950">
                        SMS
                      </option>
                      <option value="whatsapp" className="bg-zinc-950">
                        WhatsApp
                      </option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs text-zinc-300">
                    Mode
                    <select
                      value={messageMode}
                      onChange={(e) => setMessageMode(e.target.value as any)}
                      className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
                    >
                      <option value="template" className="bg-zinc-950">
                        Templates
                      </option>
                      <option value="custom" className="bg-zinc-950">
                        Message libre
                      </option>
                    </select>
                  </label>
                  <div className="flex items-end justify-end md:col-span-2">
                    <button
                      onClick={proposeDraft}
                      disabled={draftLoading}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-60"
                    >
                      {draftLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Proposer une réponse
                    </button>
                  </div>
                </div>

                {draftError ? <div className="text-xs text-rose-200">{draftError}</div> : null}

                {messageMode === 'template' ? (
                  <>
                    <label className="grid gap-1 text-xs text-zinc-300">
                      Template
                      <select
                        value={templateId}
                        onChange={(e) => setTemplateId(e.target.value)}
                        className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
                      >
                        {templates.map((t) => (
                          <option key={t.id} value={t.id} className="bg-zinc-950">
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="grid gap-2 md:grid-cols-2">
                      <input
                        value={slot1}
                        onChange={(e) => setSlot1(e.target.value)}
                        className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
                        placeholder="Option 1"
                      />
                      <input
                        value={slot2}
                        onChange={(e) => setSlot2(e.target.value)}
                        className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
                        placeholder="Option 2"
                      />
                    </div>
                  </>
                ) : (
                  <textarea
                    value={customText}
                    onChange={(e) => setCustomText(e.target.value)}
                    className="min-h-28 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/25"
                    placeholder="Votre message"
                  />
                )}

                <button
                  onClick={sendMessage}
                  disabled={sending || (messageMode === 'custom' && !customText.trim())}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-zinc-100 disabled:opacity-60"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Envoyer
                </button>
              </div>

              <div className="mt-5 space-y-2">
                {data.messages.length === 0 ? (
                  <div className="text-xs text-zinc-400">Aucun message envoyé.</div>
                ) : (
                  data.messages.slice().reverse().map((m) => (
                    <div key={m.message_id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="flex items-center justify-between text-[11px] text-zinc-400">
                        <div>
                          {m.channel} • {m.template_id}
                        </div>
                        <div>{new Date(m.created_at).toLocaleString()}</div>
                      </div>
                      <div className="mt-2 text-xs leading-relaxed text-zinc-200">{m.rendered_text}</div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-zinc-950/40 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <MessageSquareText className="h-4 w-4" />
                Portail client
              </div>
              {!portal?.portal_id ? (
                <div className="mt-3 text-xs text-zinc-400">Portail non généré.</div>
              ) : (
                <>
                  <div className="mt-3 space-y-2">
                    {(portal.messages || []).length === 0 ? (
                      <div className="text-xs text-zinc-400">Aucun message.</div>
                    ) : (
                      (portal.messages || []).map((m, idx) => (
                        <div key={idx} className="rounded-xl border border-white/10 bg-white/5 p-3">
                          <div className="flex items-center justify-between text-[11px] text-zinc-400">
                            <div>{m.author_label || m.direction}</div>
                            <div>{m.created_at ? new Date(m.created_at).toLocaleString() : ''}</div>
                          </div>
                          <div className="mt-2 text-xs leading-relaxed text-zinc-200">{m.text}</div>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="mt-3 grid gap-2">
                    <textarea
                      value={portalText}
                      onChange={(e) => setPortalText(e.target.value)}
                      className="min-h-24 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/25"
                      placeholder="Réponse à envoyer au client"
                    />
                    <button
                      onClick={sendPortalMessage}
                      disabled={portalSending || !portalText.trim()}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-zinc-100 disabled:opacity-60"
                    >
                      {portalSending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Envoyer au client
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </BackofficeShell>
  )
}
