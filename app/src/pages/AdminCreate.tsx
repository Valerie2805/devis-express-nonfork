import { useState } from 'react'
import { apiFetch } from '@/lib/api'

type CreateResponse = {
  business_id: string
  owner_username: string
  owner_password: string
  audit?: { audit_id: string; status: string; public_url: string; docx_url: string } | null
}

type Trade = { id: string; label: string }

const trades: Trade[] = [
  { id: 'plombier_chauffagiste', label: 'Plombier / Chauffagiste' },
  { id: 'serrurier', label: 'Serrurier' },
  { id: 'electricien', label: 'Électricien' },
  { id: 'couvreur_zingueur', label: 'Couvreur / Zingueur' },
  { id: 'pac_clim_chauffage', label: 'PAC / Climatisation / Chauffage' },
  { id: 'vitrier', label: 'Vitrier' },
  { id: 'debouchage_assainissement', label: 'Débouchage / Assainissement' },
  { id: 'volets_portes_garage', label: 'Volets / Portes de garage' },
  { id: 'anti_nuisibles', label: 'Anti-nuisibles' },
  { id: 'ramonage_poeles_cheminees', label: 'Ramonage / Poêles / Cheminées' },
]

type CreatedBusiness = {
  business_id: string
  company_name: string
  city: string
  trade_label: string
  created_at: string
}

const CREATED_KEY = 'devisexpress_created_businesses_v1'

function loadCreatedBusinesses(): CreatedBusiness[] {
  try {
    if (typeof window === 'undefined') return []
    const raw = window.localStorage.getItem(CREATED_KEY)
    if (!raw) return []
    const v = JSON.parse(raw)
    return Array.isArray(v) ? (v as CreatedBusiness[]) : []
  } catch {
    return []
  }
}

function saveCreatedBusinesses(items: CreatedBusiness[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(CREATED_KEY, JSON.stringify(items))
}

function toTradeId(label: string) {
  const s = label
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return s || 'other'
}

export default function AdminCreate() {
  const [adminKey, setAdminKey] = useState('dev-admin')
  const [step, setStep] = useState(1)

  const [tradeId, setTradeId] = useState(trades[0].id)
  const [tradeLabel, setTradeLabel] = useState(trades[0].label)

  const [createdBusinesses, setCreatedBusinesses] = useState<CreatedBusiness[]>(() => loadCreatedBusinesses())

  const [companyName, setCompanyName] = useState('')
  const [city, setCity] = useState('')
  const [zoneLabel, setZoneLabel] = useState('')
  const [phone, setPhone] = useState('')
  const [zoneListRaw, setZoneListRaw] = useState('75001\n75002\n75003')
  const [travelFee, setTravelFee] = useState('à partir de 49€')
  const [diagnosticFee, setDiagnosticFee] = useState('à partir de 79€')
  const [currentSiteUrl, setCurrentSiteUrl] = useState('')
  const [goal, setGoal] = useState('leads')

  const [result, setResult] = useState<CreateResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const zoneList = zoneListRaw
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)

  function canNext() {
    if (step === 1) return Boolean(tradeLabel.trim() && phone.trim() && companyName.trim() && city.trim())
    if (step === 2) return Boolean(zoneLabel.trim() && zoneList.length > 0)
    return true
  }

  async function createBusiness() {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const data = await apiFetch<CreateResponse>('/api/v1/admin/businesses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({
          trade_id: tradeId,
          trade_label: tradeLabel,
          company_name: companyName,
          city,
          zone_label: zoneLabel,
          phone,
          zone_list: zoneList,
          travel_fee: travelFee,
          diagnostic_fee: diagnosticFee,
          current_site_url: currentSiteUrl,
          goal,
          top_services: [],
        }),
      })

      const created: CreatedBusiness = {
        business_id: data.business_id,
        company_name: companyName,
        city,
        trade_label: tradeLabel,
        created_at: new Date().toISOString(),
      }

      setCreatedBusinesses((prev) => {
        const next = [created, ...prev.filter((x) => x.business_id !== created.business_id)]
        saveCreatedBusinesses(next)
        return next
      })

      setResult(data)
      window.location.href = `/backoffice/${data.business_id}/settings`
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-dvh bg-zinc-950 text-zinc-50">
      <div className="mx-auto max-w-3xl px-6 py-14">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="text-xs uppercase tracking-[0.3em] text-zinc-400">Admin</div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">Onboarding business</h1>
          <p className="mt-2 text-sm text-zinc-300">
            Wizard de création + checklist. Retourne un business_id et des identifiants owner (affichés une seule fois).
          </p>

          <div className="mt-5 flex items-center justify-between rounded-2xl border border-white/10 bg-zinc-950/40 px-4 py-3 text-xs text-zinc-200">
            <div>Étape {step}/3</div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setStep((s) => Math.max(1, s - 1))}
                disabled={step === 1 || loading}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white hover:bg-white/10 disabled:opacity-60"
              >
                Précédent
              </button>

              {step < 3 ? (
                <button
                  type="button"
                  onClick={() => setStep((s) => Math.min(3, s + 1))}
                  disabled={!canNext() || loading}
                  className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-zinc-950 hover:bg-zinc-100 disabled:opacity-60"
                >
                  Suivant
                </button>
              ) : (
                <button
                  type="button"
                  onClick={createBusiness}
                  disabled={!canNext() || loading}
                  className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-zinc-950 hover:bg-zinc-100 disabled:opacity-60"
                >
                  {loading ? 'Création…' : 'Créer'}
                </button>
              )}
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-xs text-zinc-300 md:col-span-2">
              Clé admin
              <input
                value={adminKey}
                onChange={(e) => setAdminKey(e.target.value)}
                className="h-10 rounded-xl border border-white/10 bg-zinc-950/40 px-3 text-sm text-white outline-none focus:border-white/25"
              />
            </label>

            {step === 1 ? (
              <>
                <label className="grid gap-1 text-xs text-zinc-300">
                  Métier
                  <input
                    list="trade-options"
                    value={tradeLabel}
                    onChange={(e) => {
                      const v = e.target.value
                      setTradeLabel(v)
                      const match = trades.find((t) => t.label.toLowerCase() === v.trim().toLowerCase())
                      setTradeId(match?.id || toTradeId(v))
                    }}
                    className="h-10 rounded-xl border border-white/10 bg-zinc-950/40 px-3 text-sm text-white outline-none focus:border-white/25"
                    placeholder="Ex: Fleuriste"
                  />
                  <datalist id="trade-options">
                    {trades.map((t) => (
                      <option key={t.id} value={t.label} />
                    ))}
                  </datalist>
                </label>

                <label className="grid gap-1 text-xs text-zinc-300">
                  Téléphone (réception leads)
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="h-10 rounded-xl border border-white/10 bg-zinc-950/40 px-3 text-sm text-white outline-none focus:border-white/25"
                    placeholder="06..."
                  />
                </label>

                <label className="grid gap-1 text-xs text-zinc-300">
                  Entreprise
                  <input
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="h-10 rounded-xl border border-white/10 bg-zinc-950/40 px-3 text-sm text-white outline-none focus:border-white/25"
                  />
                </label>

                <label className="grid gap-1 text-xs text-zinc-300">
                  Ville
                  <input
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="h-10 rounded-xl border border-white/10 bg-zinc-950/40 px-3 text-sm text-white outline-none focus:border-white/25"
                  />
                </label>
              </>
            ) : null}

            {step === 2 ? (
              <>
                <label className="grid gap-1 text-xs text-zinc-300 md:col-span-2">
                  Zone label (texte)
                  <input
                    value={zoneLabel}
                    onChange={(e) => setZoneLabel(e.target.value)}
                    className="h-10 rounded-xl border border-white/10 bg-zinc-950/40 px-3 text-sm text-white outline-none focus:border-white/25"
                    placeholder="ex : Paris et proches alentours"
                  />
                </label>

                <label className="grid gap-1 text-xs text-zinc-300 md:col-span-2">
                  Zone list (un code postal par ligne)
                  <textarea
                    value={zoneListRaw}
                    onChange={(e) => setZoneListRaw(e.target.value)}
                    className="min-h-28 rounded-xl border border-white/10 bg-zinc-950/40 px-3 py-2 text-sm text-white outline-none focus:border-white/25"
                  />
                </label>

                <label className="grid gap-1 text-xs text-zinc-300">
                  Frais déplacement
                  <input
                    value={travelFee}
                    onChange={(e) => setTravelFee(e.target.value)}
                    className="h-10 rounded-xl border border-white/10 bg-zinc-950/40 px-3 text-sm text-white outline-none focus:border-white/25"
                  />
                </label>

                <label className="grid gap-1 text-xs text-zinc-300">
                  Frais diagnostic
                  <input
                    value={diagnosticFee}
                    onChange={(e) => setDiagnosticFee(e.target.value)}
                    className="h-10 rounded-xl border border-white/10 bg-zinc-950/40 px-3 text-sm text-white outline-none focus:border-white/25"
                  />
                </label>
              </>
            ) : null}

            {step === 3 ? (
              <div className="md:col-span-2 grid gap-3">
                <div className="rounded-2xl border border-white/10 bg-zinc-950/40 p-4 text-sm text-zinc-200">
                  <div className="font-semibold text-white">Site actuel (optionnel)</div>
                  <div className="mt-1 text-xs text-zinc-300">Servira pour générer un audit IA (URL publique).</div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <label className="grid gap-1 text-xs text-zinc-300 md:col-span-2">
                      URL
                      <input
                        value={currentSiteUrl}
                        onChange={(e) => setCurrentSiteUrl(e.target.value)}
                        className="h-10 rounded-xl border border-white/10 bg-zinc-950/40 px-3 text-sm text-white outline-none focus:border-white/25"
                        placeholder="https://exemple.fr"
                      />
                    </label>
                    <label className="grid gap-1 text-xs text-zinc-300">
                      Objectif
                      <select
                        value={goal}
                        onChange={(e) => setGoal(e.target.value)}
                        className="h-10 rounded-xl border border-white/10 bg-zinc-950/40 px-3 text-sm text-white outline-none focus:border-white/25"
                      >
                        <option value="leads" className="bg-zinc-950">
                          Générer des demandes
                        </option>
                        <option value="calls" className="bg-zinc-950">
                          Plus d’appels
                        </option>
                        <option value="appointments" className="bg-zinc-950">
                          Plus de RDV
                        </option>
                      </select>
                    </label>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-zinc-950/40 p-4 text-sm text-zinc-200">
                  <div className="font-semibold text-white">Checklist</div>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-zinc-300">
                    <li>Vérifier le site public (copy, zones, tarifs, preuve).</li>
                    <li>Configurer Twilio + webhooks si SMS/WhatsApp.</li>
                    <li>Configurer le SMTP pour reset password.</li>
                    <li>Configurer S3 pour les uploads.</li>
                    <li>Activer les crons (rétention RGPD + automation + cleanup assets).</li>
                  </ul>
                </div>

                <div className="text-xs text-zinc-300">{error ? <span className="text-rose-200">{error}</span> : null}</div>
              </div>
            ) : null}
          </div>
        </div>

        {createdBusinesses.length ? (
          <div className="mt-6 rounded-2xl border border-white/10 bg-zinc-950/40 p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-white">Business créés</div>
              <button
                type="button"
                className="text-xs text-zinc-300 underline"
                onClick={() => {
                  localStorage.removeItem(CREATED_KEY)
                  setCreatedBusinesses([])
                }}
              >
                Effacer
              </button>
            </div>

            <div className="mt-3 space-y-2">
              {createdBusinesses.map((b) => (
                <div
                  key={b.business_id}
                  className="flex flex-col gap-1 rounded-xl border border-white/10 bg-black/20 p-3 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <div className="text-sm text-white">{b.company_name || '(sans nom)'}</div>
                    <div className="text-xs text-zinc-400">
                      {b.trade_label} • {b.city}
                    </div>
                  </div>
                  <div className="flex gap-3 text-xs">
                    <a className="text-white underline" href={`/backoffice/${b.business_id}/settings`} target="_blank" rel="noreferrer">
                      Site
                    </a>
                    <a
                      className="text-white underline"
                      href={`/backoffice/${b.business_id}/settings`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Backoffice
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {result ? (
          <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-6">
            <div className="text-sm font-semibold text-white">Résultat</div>
            <div className="mt-3 grid gap-2 text-sm text-zinc-200">
              <div>
                business_id : <span className="text-white">{result.business_id}</span>
              </div>
              <div>
                owner : <span className="text-white">{result.owner_username}</span> /{' '}
                <span className="text-white">{result.owner_password}</span>
              </div>

              {result.audit ? (
                <div className="pt-2 text-xs text-zinc-300">
                  Audit (public) :{' '}
                  <a className="text-zinc-100 underline" href={result.audit.public_url} target="_blank" rel="noreferrer">
                    {result.audit.public_url}
                  </a>
                  <br />
                  Word :{' '}
                  <a className="text-zinc-100 underline" href={result.audit.docx_url} target="_blank" rel="noreferrer">
                    {result.audit.docx_url}
                  </a>
                </div>
              ) : null}

              <div className="pt-2 text-xs text-zinc-300">
                Site :{' '}
                <a className="text-zinc-100 underline" href={`/site/${result.business_id}`}>
                  {`/site/${result.business_id}`}
                </a>
                <br />
                Backoffice :{' '}
                <a className="text-zinc-100 underline" href={`/backoffice/${result.business_id}/login`}>
                  {`/backoffice/${result.business_id}/login`}
                </a>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
