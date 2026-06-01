import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Send } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { getLeadAttribution, track } from '@/utils/tracking'
import { cn } from '@/lib/utils'

type Props = {
  businessId: string
  tradeId: string
  cityDefault: string
  zoneList: string[]
  formSpec: any
  title?: string
  subtitle?: string
}

type AssetUploadResponse = { asset_id: string; url: string }
type LeadResponse = { lead_id: string; status: string; decision: string; tags: string[] }

export default function QuoteForm({ businessId, tradeId, cityDefault, zoneList, formSpec, title, subtitle }: Props) {
  const requestTypes = useMemo(() => Object.entries(formSpec?.request_types || {}), [formSpec])
  const extraFields = useMemo(() => (Array.isArray(formSpec?.extra_fields) ? formSpec.extra_fields : []), [formSpec])
  const requiredPhotosFor = useMemo(() => new Set<string>(formSpec?.required_photos_for || []), [formSpec])

  const [requestType, setRequestType] = useState(requestTypes[0]?.[0] || '')
  const [urgency, setUrgency] = useState<'now' | 'today' | 'week'>('today')
  const [channel, setChannel] = useState<'call' | 'whatsapp' | 'sms'>('call')
  const [firstName, setFirstName] = useState('')
  const [phone, setPhone] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [address, setAddress] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [consentSms, setConsentSms] = useState(false)
  const [consentWhatsapp, setConsentWhatsapp] = useState(false)
  const [consentEmail, setConsentEmail] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<LeadResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showMore, setShowMore] = useState(false)
  const rootRef = useRef<HTMLElement | null>(null)

  const requiredPhoto = requiredPhotosFor.has(requestType)

  useEffect(() => {
    const pageType = (window as any).__mad_page_type || 'home'
    const pagePath = window.location.pathname
    const trigger = window.location.hash === '#devis' ? 'deeplink' : 'scroll'
    let fired = false
    const fire = () => {
      if (fired) return
      fired = true
      void track(businessId, tradeId, 'open_quote_form', {
        page_type: pageType,
        page_path: pagePath,
        properties: { trigger, placement: 'inline' },
      }).catch(() => {})
    }
    const el = rootRef.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      fire()
      return
    }
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          fire()
          obs.disconnect()
        }
      },
      { threshold: 0.25 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [businessId, tradeId])

  async function uploadIfNeeded(): Promise<{ photos: any[]; photos_count: number }> {
    if (!file) return { photos: [], photos_count: 0 }
    const fd = new FormData()
    fd.append('file', file)
    const uploaded = await apiFetch<AssetUploadResponse>(`/api/v1/site/${businessId}/assets`, { method: 'POST', body: fd })
    return { photos: [{ asset_id: uploaded.asset_id, url: uploaded.url }], photos_count: 1 }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      if (requiredPhoto && !file) {
        throw new Error('Merci d’ajouter au moins 1 photo pour ce type de demande.')
      }
      if (channel === 'sms' && !consentSms) {
        throw new Error('Merci de cocher le consentement SMS.')
      }
      if (channel === 'whatsapp' && !consentWhatsapp) {
        throw new Error('Merci de cocher le consentement WhatsApp.')
      }

      const answers: Record<string, any> = {}
      for (const f of extraFields) {
        const id = String(f.id)
        const el = (e.currentTarget as HTMLFormElement).elements.namedItem(`extra_${id}`) as HTMLInputElement | null
        if (!el) continue
        if (f.type === 'boolean') answers[id] = el.value === 'true'
        else answers[id] = el.value
      }

      const upload = await uploadIfNeeded()
      const payload = {
        trade_id: tradeId,
        request_type: requestType,
        urgency,
        channel_preference: channel,
        first_name: firstName,
        phone,
        email: null,
        city: cityDefault,
        postal_code: postalCode,
        address: address || null,
        description: description || null,
        slot_preference: null,
        answers,
        photos: upload.photos,
        photos_count: upload.photos_count,
        consent: { sms: consentSms, whatsapp: consentWhatsapp, email: consentEmail },
        attribution: getLeadAttribution(),
      }

      const data = await apiFetch<LeadResponse>(`/api/v1/site/${businessId}/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      setResult(data)
      setConsentSms(false)
      setConsentWhatsapp(false)
      setConsentEmail(false)
      const inZone = Array.isArray(zoneList) ? zoneList.includes(postalCode) : false
      await track(businessId, tradeId, 'submit_quote_form', {
        page_type: (window as any).__mad_page_type || 'home',
        page_path: window.location.pathname,
        properties: {
          request_type: requestType,
          urgency,
          photos_count: upload.photos_count,
          in_zone: inZone,
          lead_id: data.lead_id,
          variant: (window as any).__mad_hero_variant || null,
        },
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section ref={rootRef} id="devis" className="scroll-mt-24">
      <div className="site-card p-4 md:p-6">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h2 className="site-display text-base font-semibold">{title || 'Devis express'}</h2>
            <p className="site-muted mt-1 text-sm">{subtitle || '4 infos : quoi, où, quand, téléphone. On vous rappelle.'}</p>
          </div>
          <div className={cn('px-3 py-1 text-[11px]', requiredPhoto ? 'rounded-full bg-amber-500/15 text-amber-900' : 'site-badge')}>
            {requiredPhoto ? 'Photo requise' : 'Photo optionnelle'}
          </div>
        </div>

        <form onSubmit={onSubmit} className="mt-5 grid gap-3 md:grid-cols-2">
          <label className="site-muted grid gap-1 text-xs">
            Type de demande
            <select
              value={requestType}
              onChange={(e) => setRequestType(e.target.value)}
              className="site-radius h-10 border site-border site-surface2 px-3 text-sm outline-none focus:border-[color:var(--accent)]"
            >
              {requestTypes.map(([k, label]) => (
                <option key={k} value={k}>
                  {String(label)}
                </option>
              ))}
            </select>
          </label>

          <label className="site-muted grid gap-1 text-xs">
            Quand ?
            <select
              value={urgency}
              onChange={(e) => setUrgency(e.target.value as any)}
              className="site-radius h-10 border site-border site-surface2 px-3 text-sm outline-none focus:border-[color:var(--accent)]"
            >
              <option value="now">
                Urgent
              </option>
              <option value="today">
                Aujourd’hui
              </option>
              <option value="week">
                Cette semaine
              </option>
            </select>
          </label>

          <label className="site-muted grid gap-1 text-xs">
            Code postal
            <input
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
              inputMode="numeric"
              className="site-radius h-10 border site-border site-surface2 px-3 text-sm outline-none focus:border-[color:var(--accent)]"
              placeholder="ex : 75002"
              required
            />
          </label>

          <label className="site-muted grid gap-1 text-xs">
            Téléphone
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="site-radius h-10 border site-border site-surface2 px-3 text-sm outline-none focus:border-[color:var(--accent)]"
              placeholder="06..."
              required
            />
          </label>

          <label className="site-muted grid gap-1 text-xs">
            Prénom
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="site-radius h-10 border site-border site-surface2 px-3 text-sm outline-none focus:border-[color:var(--accent)]"
              required
            />
          </label>

          <div className="site-card md:col-span-2 flex items-center justify-between gap-3 px-3 py-2 text-xs">
            <div className="site-muted">Plus de détails = meilleure estimation</div>
            <button
              type="button"
              onClick={() => setShowMore((v) => !v)}
              className="site-btn-secondary px-3 py-2 text-xs font-semibold hover:opacity-95"
            >
              {showMore ? 'Masquer' : 'Ajouter'}
            </button>
          </div>

          {requiredPhoto || showMore ? (
            <label className="site-muted grid gap-1 text-xs md:col-span-2">
              Photo
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="site-radius h-10 border site-border site-surface2 px-3 py-2 text-sm outline-none focus:border-[color:var(--accent)]"
              />
            </label>
          ) : null}

          {showMore ? (
            <>
              <label className="site-muted grid gap-1 text-xs">
                Canal préféré
                <select
                  value={channel}
                  onChange={(e) => setChannel(e.target.value as any)}
                  className="site-radius h-10 border site-border site-surface2 px-3 text-sm outline-none focus:border-[color:var(--accent)]"
                >
                  <option value="call">
                    Appel
                  </option>
                  <option value="whatsapp">
                    WhatsApp
                  </option>
                  <option value="sms">
                    SMS
                  </option>
                </select>
              </label>

              <div className="site-card md:col-span-2 p-3 text-xs">
                <div className="site-display font-semibold">Consentements</div>
                <div className="site-muted mt-1">Requis si tu choisis SMS/WhatsApp.</div>
                <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={consentSms} onChange={(e) => setConsentSms(e.target.checked)} />
                    SMS
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={consentWhatsapp} onChange={(e) => setConsentWhatsapp(e.target.checked)} />
                    WhatsApp
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={consentEmail} onChange={(e) => setConsentEmail(e.target.checked)} />
                    Email
                  </label>
                </div>
              </div>

              <label className="site-muted grid gap-1 text-xs md:col-span-2">
                Adresse (ou quartier)
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="site-radius h-10 border site-border site-surface2 px-3 text-sm outline-none focus:border-[color:var(--accent)]"
                  placeholder="Optionnel"
                />
              </label>

              <label className="site-muted grid gap-1 text-xs md:col-span-2">
                Détails
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="site-radius min-h-24 border site-border site-surface2 px-3 py-2 text-sm outline-none focus:border-[color:var(--accent)]"
                  placeholder="Décrivez en 1–2 phrases"
                />
              </label>
            </>
          ) : null}

          {showMore
            ? extraFields.map((f: any) => {
                const id = String(f.id)
                if (f.type === 'boolean') {
                  return (
                    <label key={id} className="site-muted grid gap-1 text-xs">
                      {String(f.label)}
                      <select
                        name={`extra_${id}`}
                        className="site-radius h-10 border site-border site-surface2 px-3 text-sm outline-none focus:border-[color:var(--accent)]"
                        required={Boolean(f.required)}
                        defaultValue=""
                      >
                        <option value="" disabled>
                          Choisir
                        </option>
                        <option value="true">
                          Oui
                        </option>
                        <option value="false">
                          Non
                        </option>
                      </select>
                    </label>
                  )
                }
                if (f.type === 'enum') {
                  return (
                    <label key={id} className="site-muted grid gap-1 text-xs">
                      {String(f.label)}
                      <select
                        name={`extra_${id}`}
                        className="site-radius h-10 border site-border site-surface2 px-3 text-sm outline-none focus:border-[color:var(--accent)]"
                        required={Boolean(f.required)}
                        defaultValue=""
                      >
                        <option value="" disabled>
                          Choisir
                        </option>
                        {(f.options || []).map((o: string) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    </label>
                  )
                }
                return (
                  <label key={id} className="site-muted grid gap-1 text-xs">
                    {String(f.label)}
                    <input
                      name={`extra_${id}`}
                      className="site-radius h-10 border site-border site-surface2 px-3 text-sm outline-none focus:border-[color:var(--accent)]"
                      required={Boolean(f.required)}
                    />
                  </label>
                )
              })
            : null}

          <div className="flex items-center justify-between gap-3 md:col-span-2">
            <div className="site-muted text-xs">
              {error ? <span className="text-rose-200">{error}</span> : result ? <span className="text-emerald-200">Demande envoyée</span> : null}
            </div>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-medium text-emerald-950 hover:bg-emerald-400 disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Envoyer
            </button>
          </div>
        </form>
      </div>
    </section>
  )
}
