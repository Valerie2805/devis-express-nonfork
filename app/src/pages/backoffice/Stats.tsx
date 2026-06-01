import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import BackofficeShell from '@/components/backoffice/BackofficeShell'
import BackButton from '@/components/BackButton'
import { apiFetch, authHeaders } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

type DashboardResponse = {
  cards: {
    leads_total: number
    leads_qualified: number
    leads_needs_followup: number
    calls_clicks: number
    whatsapp_clicks: number
    form_opens: number
    response_time_avg_minutes: number | null
    response_under_10min_rate: number | null
    leads_responded_under_10min: number
    appointments: number
    quotes_sent: number
    won: number
    lost: number
    win_rate: number | null
    revenue_cents?: number
  }
  charts?: {
    leads_by_day?: Array<{ day: string; leads_total: number }>
    urgency?: Record<string, number>
    won_lost_by_week?: Array<{ week: string; won: number; lost: number }>
    clicks_by_source?: Record<string, { calls_clicks: number; whatsapp_clicks: number }>
    funnel?: { form_opens: number; leads_total: number; leads_qualified: number }
    revenue_by_month?: Array<{ month: string; revenue_cents: number }>
  }
  sources: Record<string, number>
  variants?: Record<string, number>
  ab_hero?: {
    by_variant: Record<string, Record<string, number>>
    conversion: { A: number | null; B: number | null }
    unique?: {
      A: { view_hero_sessions: number; submit_sessions: number; open_form_sessions: number }
      B: { view_hero_sessions: number; submit_sessions: number; open_form_sessions: number }
    }
    unique_conversion?: { A: number | null; B: number | null }
    unique_by_source?: Record<
      string,
      Record<string, { view_sessions: number; submit_sessions: number; conversion: number | null }>
    >
    rates?: Record<string, Record<string, number | null>>
    submit_by_source?: Record<string, Record<string, number>>
  }
  ab_hero_pages?: Record<
    string,
    {
      conversion: { A: number | null; B: number | null }
      unique_conversion: { A: number | null; B: number | null }
      unique: { A: { view_hero_sessions: number; submit_sessions: number }; B: { view_hero_sessions: number; submit_sessions: number } }
    }
  >
  ab_quote_form_pages?: Record<
    string,
    {
      unique: { A: { view_sessions: number; submit_sessions: number }; B: { view_sessions: number; submit_sessions: number } }
      unique_conversion: { A: number | null; B: number | null }
    }
  >
  ab_significance?: any
  segments?: any
}

type FunnelResponse = {
  funnel: {
    submit_quote_form: number
    leads_created: number
    leads_contacted: number
    appointments_scheduled: number
    won: number
  }
}

export default function Stats() {
  const { businessId = '' } = useParams()
  const { token } = useAuthStore()
  const [range, setRange] = useState('last_7_days')
  const [data, setData] = useState<(DashboardResponse & { funnel: FunnelResponse['funnel'] }) | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.all([
      apiFetch<DashboardResponse>(`/api/v1/backoffice/${businessId}/dashboard?range=${range}`, { headers: { ...authHeaders(token) } }),
      apiFetch<FunnelResponse>(`/api/v1/backoffice/${businessId}/reporting/funnel?range=${range}`, { headers: { ...authHeaders(token) } }),
    ])
      .then(([d, f]) => {
        if (!alive) return
        setData({ ...d, funnel: f.funnel })
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
  }, [businessId, range, token])

  return (
    <BackofficeShell businessId={businessId}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <BackButton fallbackTo={`/backoffice/${businessId}`} />
          <div>
            <h1 className="text-lg font-semibold text-white">Stats</h1>
            <div className="mt-1 text-xs text-zinc-300">Mesure simple : demandes, qualifiées, délai de réponse, sources.</div>
          </div>
        </div>
        <select
          value={range}
          onChange={(e) => setRange(e.target.value)}
          className="h-10 rounded-xl border border-white/10 bg-zinc-950/40 px-3 text-sm text-white outline-none focus:border-white/25"
        >
          <option value="last_7_days" className="bg-zinc-950">
            7 jours
          </option>
          <option value="last_30_days" className="bg-zinc-950">
            30 jours
          </option>
          <option value="month_to_date" className="bg-zinc-950">
            Mois en cours
          </option>
        </select>
      </div>

      {loading ? (
        <div className="mt-8 text-sm text-zinc-300">Chargement…</div>
      ) : error ? (
        <div className="mt-8 text-sm text-rose-200">{error}</div>
      ) : !data ? null : (
        <div className="mt-6 grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-zinc-950/40 p-5">
            <div className="text-xs uppercase tracking-wider text-zinc-400">Demandes</div>
            <div className="mt-2 text-2xl font-semibold text-white">{data.cards.leads_total}</div>
            <div className="mt-1 text-xs text-zinc-300">Qualifiées : {data.cards.leads_qualified}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-zinc-950/40 p-5">
            <div className="text-xs uppercase tracking-wider text-zinc-400">Délai réponse</div>
            <div className="mt-2 text-2xl font-semibold text-white">
              {data.cards.response_time_avg_minutes === null ? '—' : Math.round(data.cards.response_time_avg_minutes)} min
            </div>
            <div className="mt-1 text-xs text-zinc-300">
              &lt;10 min : {data.cards.response_under_10min_rate === null ? '—' : `${Math.round(data.cards.response_under_10min_rate * 100)}%`}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-zinc-950/40 p-5">
            <div className="text-xs uppercase tracking-wider text-zinc-400">Taux de gain</div>
            <div className="mt-2 text-2xl font-semibold text-white">
              {data.cards.win_rate === null ? '—' : `${Math.round(data.cards.win_rate * 100)}%`}
            </div>
            <div className="mt-1 text-xs text-zinc-300">
              Devis : {data.cards.quotes_sent} • Gagnés : {data.cards.won} • Perdus : {data.cards.lost}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-zinc-950/40 p-5">
            <div className="text-xs uppercase tracking-wider text-zinc-400">RDV / Gagnés</div>
            <div className="mt-2 text-2xl font-semibold text-white">
              {data.funnel.appointments_scheduled} / {data.funnel.won}
            </div>
            <div className="mt-1 text-xs text-zinc-300">Sur la période sélectionnée</div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-zinc-950/40 p-5">
            <div className="text-xs uppercase tracking-wider text-zinc-400">CA</div>
            <div className="mt-2 text-2xl font-semibold text-white">
              {typeof data.cards.revenue_cents === 'number' ? `${(data.cards.revenue_cents / 100).toFixed(2).replace('.', ',')} €` : '—'}
            </div>
            <div className="mt-1 text-xs text-zinc-300">Basé sur les leads gagnés</div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-zinc-950/40 p-5 md:col-span-4">
            <div className="text-xs uppercase tracking-wider text-zinc-400">Intentions</div>
            <div className="mt-4 grid gap-2 text-sm text-zinc-200 md:grid-cols-3">
              {[
                ['Clics appel', data.cards.calls_clicks],
                ['Clics WhatsApp', data.cards.whatsapp_clicks],
                ['Ouvertures formulaire', data.cards.form_opens],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-white/5 px-3 py-2">
                  <div className="text-xs text-zinc-400">{k}</div>
                  <div className="text-lg font-semibold text-white">{v as number}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-zinc-950/40 p-5 md:col-span-4">
            <div className="text-xs uppercase tracking-wider text-zinc-400">Funnel</div>
            <div className="mt-4 grid gap-2 text-sm text-zinc-200 md:grid-cols-5">
              {[
                ['Ouvertures', data.charts?.funnel?.form_opens ?? 0],
                ['Leads', data.funnel.leads_created],
                ['Contactés', data.funnel.leads_contacted],
                ['RDV', data.funnel.appointments_scheduled],
                ['Gagnés', data.funnel.won],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-white/5 px-3 py-2">
                  <div className="text-xs text-zinc-400">{k}</div>
                  <div className="text-lg font-semibold text-white">{v as number}</div>
                </div>
              ))}
            </div>
          </div>

          {data.charts?.leads_by_day?.length ? (
            <div className="rounded-2xl border border-white/10 bg-zinc-950/40 p-5 md:col-span-4">
              <div className="text-xs uppercase tracking-wider text-zinc-400">Demandes par jour</div>
              <div className="mt-4 grid gap-2 text-xs text-zinc-200 md:grid-cols-4">
                {data.charts.leads_by_day.slice(-8).map((d) => (
                  <div key={d.day} className="rounded-xl bg-white/5 px-3 py-3">
                    <div className="text-xs text-zinc-400">{d.day}</div>
                    <div className="mt-1 text-lg font-semibold text-white">{d.leads_total}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {data.charts?.revenue_by_month?.length ? (
            <div className="rounded-2xl border border-white/10 bg-zinc-950/40 p-5 md:col-span-4">
              <div className="text-xs uppercase tracking-wider text-zinc-400">CA par mois</div>
              <div className="mt-4 grid gap-2 text-xs text-zinc-200 md:grid-cols-4">
                {data.charts.revenue_by_month.slice(-8).map((m) => (
                  <div key={m.month} className="rounded-xl bg-white/5 px-3 py-3">
                    <div className="text-xs text-zinc-400">{m.month}</div>
                    <div className="mt-1 text-lg font-semibold text-white">{`${(m.revenue_cents / 100).toFixed(2).replace('.', ',')} €`}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="rounded-2xl border border-white/10 bg-zinc-950/40 p-5 md:col-span-4">
            <div className="text-xs uppercase tracking-wider text-zinc-400">Sources</div>
            <div className="mt-4 grid gap-2 text-sm text-zinc-200 md:grid-cols-5">
              {Object.entries(data.sources).map(([k, v]) => (
                <div key={k} className="rounded-xl bg-white/5 px-3 py-2">
                  <div className="text-xs text-zinc-400">{k}</div>
                  <div className="text-lg font-semibold text-white">{v}</div>
                </div>
              ))}
            </div>
          </div>

          {data.charts?.urgency ? (
            <div className="rounded-2xl border border-white/10 bg-zinc-950/40 p-5 md:col-span-4">
              <div className="text-xs uppercase tracking-wider text-zinc-400">Urgence</div>
              <div className="mt-4 grid gap-2 text-sm text-zinc-200 md:grid-cols-3">
                {[
                  ['Urgent', data.charts.urgency.now ?? 0],
                  ['Aujourd’hui', data.charts.urgency.today ?? 0],
                  ['Cette semaine', data.charts.urgency.week ?? 0],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-xl bg-white/5 px-3 py-2">
                    <div className="text-xs text-zinc-400">{k}</div>
                    <div className="text-lg font-semibold text-white">{v as number}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {data.charts?.won_lost_by_week?.length ? (
            <div className="rounded-2xl border border-white/10 bg-zinc-950/40 p-5 md:col-span-4">
              <div className="text-xs uppercase tracking-wider text-zinc-400">Gagné / Perdu (semaine)</div>
              <div className="mt-4 grid gap-2 text-xs text-zinc-200 md:grid-cols-4">
                {data.charts.won_lost_by_week.slice(-8).map((w) => (
                  <div key={w.week} className="rounded-xl bg-white/5 px-3 py-3">
                    <div className="text-xs text-zinc-400">{w.week}</div>
                    <div className="mt-2 grid gap-1 text-xs text-zinc-300">
                      <div>
                        Gagnés : <span className="text-white">{w.won}</span>
                      </div>
                      <div>
                        Perdus : <span className="text-white">{w.lost}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {data.segments?.submits_by_device ? (
            <div className="rounded-2xl border border-white/10 bg-zinc-950/40 p-5 md:col-span-4">
              <div className="text-xs uppercase tracking-wider text-zinc-400">Submits (device)</div>
              <div className="mt-4 grid gap-2 text-xs text-zinc-200 md:grid-cols-3">
                {(['mobile', 'desktop', 'unknown'] as const).map((d) => (
                  <div key={d} className="rounded-xl bg-white/5 px-3 py-3">
                    <div className="text-xs text-zinc-400">{d}</div>
                    <div className="mt-2 grid gap-1 text-xs text-zinc-300">
                      <div>
                        A : <span className="text-white">{data.segments?.submits_by_device?.A?.[d] ?? 0}</span>
                      </div>
                      <div>
                        B : <span className="text-white">{data.segments?.submits_by_device?.B?.[d] ?? 0}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {data.segments?.submits_by_request_type ? (
            <div className="rounded-2xl border border-white/10 bg-zinc-950/40 p-5 md:col-span-4">
              <div className="text-xs uppercase tracking-wider text-zinc-400">Submits (type)</div>
              <div className="mt-4 grid gap-2 text-xs text-zinc-200 md:grid-cols-3">
                {Object.keys({ ...(data.segments?.submits_by_request_type?.A || {}), ...(data.segments?.submits_by_request_type?.B || {}) })
                  .slice(0, 9)
                  .map((t) => (
                    <div key={t} className="rounded-xl bg-white/5 px-3 py-3">
                      <div className="text-xs text-zinc-400">{t}</div>
                      <div className="mt-2 grid gap-1 text-xs text-zinc-300">
                        <div>
                          A : <span className="text-white">{data.segments?.submits_by_request_type?.A?.[t] ?? 0}</span>
                        </div>
                        <div>
                          B : <span className="text-white">{data.segments?.submits_by_request_type?.B?.[t] ?? 0}</span>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ) : null}

          {data.variants ? (
            <div className="rounded-2xl border border-white/10 bg-zinc-950/40 p-5 md:col-span-4">
              <div className="text-xs uppercase tracking-wider text-zinc-400">A/B hero (submits)</div>
              <div className="mt-4 grid gap-2 text-sm text-zinc-200 md:grid-cols-3">
                {Object.entries(data.variants).map(([k, v]) => (
                  <div key={k} className="rounded-xl bg-white/5 px-3 py-2">
                    <div className="text-xs text-zinc-400">{k}</div>
                    <div className="text-lg font-semibold text-white">{v}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {data.ab_hero?.by_variant ? (
            <div className="rounded-2xl border border-white/10 bg-zinc-950/40 p-5 md:col-span-4">
              <div className="text-xs uppercase tracking-wider text-zinc-400">A/B hero (KPIs)</div>
              <div className="mt-4 grid gap-2 text-sm text-zinc-200 md:grid-cols-3">
                {(['A', 'B'] as const).map((v) => (
                  <div key={v} className="rounded-xl bg-white/5 px-3 py-3">
                    <div className="text-xs text-zinc-400">Variante {v}</div>
                    <div className="mt-2 grid gap-1 text-xs text-zinc-300">
                      <div>Vues hero : <span className="text-white">{data.ab_hero?.by_variant?.[v]?.view_hero ?? 0}</span></div>
                      <div>Clics appel : <span className="text-white">{data.ab_hero?.by_variant?.[v]?.click_call ?? 0}</span></div>
                      <div>Clics WhatsApp : <span className="text-white">{data.ab_hero?.by_variant?.[v]?.click_whatsapp ?? 0}</span></div>
                      <div>Ouvertures devis : <span className="text-white">{data.ab_hero?.by_variant?.[v]?.open_quote_form ?? 0}</span></div>
                      <div>Formulaires : <span className="text-white">{data.ab_hero?.by_variant?.[v]?.submit_quote_form ?? 0}</span></div>
                      <div>
                        Conv. (formulaire / vue) :{' '}
                        <span className="text-white">
                          {data.ab_hero?.conversion?.[v] === null ? '—' : `${Math.round((data.ab_hero?.conversion?.[v] || 0) * 1000) / 10}%`}
                        </span>
                      </div>
                      {data.ab_hero?.unique?.[v] ? (
                        <>
                          <div>
                            Sessions (vues) : <span className="text-white">{data.ab_hero.unique[v].view_hero_sessions}</span>
                          </div>
                          <div>
                            Sessions (formulaires) : <span className="text-white">{data.ab_hero.unique[v].submit_sessions}</span>
                          </div>
                          <div>
                            Conv. unique (sessions) :{' '}
                            <span className="text-white">
                              {data.ab_hero?.unique_conversion?.[v] === null
                                ? '—'
                                : `${Math.round((Number(data.ab_hero.unique_conversion?.[v]) || 0) * 1000) / 10}%`}
                            </span>
                          </div>
                        </>
                      ) : null}
                      {data.ab_hero?.rates?.[v] ? (
                        <>
                          <div>
                            CTR appel :{' '}
                            <span className="text-white">
                              {data.ab_hero.rates[v].call_per_view === null ? '—' : `${Math.round((Number(data.ab_hero.rates[v].call_per_view) || 0) * 1000) / 10}%`}
                            </span>
                          </div>
                          <div>
                            CTR WhatsApp :{' '}
                            <span className="text-white">
                              {data.ab_hero.rates[v].whatsapp_per_view === null
                                ? '—'
                                : `${Math.round((Number(data.ab_hero.rates[v].whatsapp_per_view) || 0) * 1000) / 10}%`}
                            </span>
                          </div>
                          <div>
                            CTR “Devis” :{' '}
                            <span className="text-white">
                              {data.ab_hero.rates[v].open_form_per_view === null
                                ? '—'
                                : `${Math.round((Number(data.ab_hero.rates[v].open_form_per_view) || 0) * 1000) / 10}%`}
                            </span>
                          </div>
                          <div>
                            Conv. (formulaire / ouverture) :{' '}
                            <span className="text-white">
                              {data.ab_hero.rates[v].submit_per_open_form === null
                                ? '—'
                                : `${Math.round((Number(data.ab_hero.rates[v].submit_per_open_form) || 0) * 1000) / 10}%`}
                            </span>
                          </div>
                        </>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {data.ab_hero?.submit_by_source ? (
            <div className="rounded-2xl border border-white/10 bg-zinc-950/40 p-5 md:col-span-4">
              <div className="text-xs uppercase tracking-wider text-zinc-400">A/B hero (submits par source)</div>
              <div className="mt-4 grid gap-2 text-xs text-zinc-200 md:grid-cols-5">
                {['Google', 'Facebook', 'Instagram', 'Direct', 'Autre'].map((src) => (
                  <div key={src} className="rounded-xl bg-white/5 px-3 py-3">
                    <div className="text-xs text-zinc-400">{src}</div>
                    <div className="mt-2 grid gap-1 text-xs text-zinc-300">
                      <div>
                        A : <span className="text-white">{data.ab_hero?.submit_by_source?.A?.[src] ?? 0}</span>
                      </div>
                      <div>
                        B : <span className="text-white">{data.ab_hero?.submit_by_source?.B?.[src] ?? 0}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {data.ab_hero?.unique_by_source ? (
            <div className="rounded-2xl border border-white/10 bg-zinc-950/40 p-5 md:col-span-4">
              <div className="text-xs uppercase tracking-wider text-zinc-400">A/B hero (conv. unique par source)</div>
              <div className="mt-4 grid gap-2 text-xs text-zinc-200 md:grid-cols-5">
                {['Google', 'Facebook', 'Instagram', 'Direct', 'Autre'].map((src) => (
                  <div key={src} className="rounded-xl bg-white/5 px-3 py-3">
                    <div className="text-xs text-zinc-400">{src}</div>
                    <div className="mt-2 grid gap-1 text-xs text-zinc-300">
                      <div>
                        A :{' '}
                        <span className="text-white">
                          {data.ab_hero?.unique_by_source?.A?.[src]?.conversion === null
                            ? '—'
                            : `${Math.round((Number(data.ab_hero?.unique_by_source?.A?.[src]?.conversion) || 0) * 1000) / 10}%`}
                        </span>
                        <span className="text-zinc-500">{` (${data.ab_hero?.unique_by_source?.A?.[src]?.submit_sessions ?? 0}/${data.ab_hero?.unique_by_source?.A?.[src]?.view_sessions ?? 0})`}</span>
                      </div>
                      <div>
                        B :{' '}
                        <span className="text-white">
                          {data.ab_hero?.unique_by_source?.B?.[src]?.conversion === null
                            ? '—'
                            : `${Math.round((Number(data.ab_hero?.unique_by_source?.B?.[src]?.conversion) || 0) * 1000) / 10}%`}
                        </span>
                        <span className="text-zinc-500">{` (${data.ab_hero?.unique_by_source?.B?.[src]?.submit_sessions ?? 0}/${data.ab_hero?.unique_by_source?.B?.[src]?.view_sessions ?? 0})`}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {data.ab_hero_pages ? (
            <div className="rounded-2xl border border-white/10 bg-zinc-950/40 p-5 md:col-span-4">
              <div className="text-xs uppercase tracking-wider text-zinc-400">A/B hero (par page)</div>
              <div className="mt-4 grid gap-2 text-xs text-zinc-200 md:grid-cols-4">
                {(['home', 'services', 'zones', 'tarifs'] as const).map((p) => {
                  const page = data.ab_hero_pages?.[p]
                  const a = page?.unique_conversion?.A
                  const b = page?.unique_conversion?.B
                  return (
                    <div key={p} className="rounded-xl bg-white/5 px-3 py-3">
                      <div className="text-xs text-zinc-400">{p}</div>
                      <div className="mt-2 grid gap-1 text-xs text-zinc-300">
                        <div>
                          A : <span className="text-white">{a === null || a === undefined ? '—' : `${Math.round(a * 1000) / 10}%`}</span>
                        </div>
                        <div>
                          B : <span className="text-white">{b === null || b === undefined ? '—' : `${Math.round(b * 1000) / 10}%`}</span>
                        </div>
                        <div className="text-zinc-500">
                          {`${page?.unique?.A?.submit_sessions ?? 0}/${page?.unique?.A?.view_hero_sessions ?? 0} vs ${page?.unique?.B?.submit_sessions ?? 0}/${page?.unique?.B?.view_hero_sessions ?? 0}`}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="mt-3 text-[11px] text-zinc-400">Conversion unique = sessions formulaire / sessions vues hero.</div>
            </div>
          ) : null}

          {data.ab_quote_form_pages ? (
            <div className="rounded-2xl border border-white/10 bg-zinc-950/40 p-5 md:col-span-4">
              <div className="text-xs uppercase tracking-wider text-zinc-400">A/B formulaire (par page)</div>
              <div className="mt-4 grid gap-2 text-xs text-zinc-200 md:grid-cols-4">
                {(['home', 'services', 'zones', 'tarifs'] as const).map((p) => {
                  const page = data.ab_quote_form_pages?.[p]
                  const a = page?.unique_conversion?.A
                  const b = page?.unique_conversion?.B
                  return (
                    <div key={p} className="rounded-xl bg-white/5 px-3 py-3">
                      <div className="text-xs text-zinc-400">{p}</div>
                      <div className="mt-2 grid gap-1 text-xs text-zinc-300">
                        <div>
                          A : <span className="text-white">{a === null || a === undefined ? '—' : `${Math.round(a * 1000) / 10}%`}</span>
                        </div>
                        <div>
                          B : <span className="text-white">{b === null || b === undefined ? '—' : `${Math.round(b * 1000) / 10}%`}</span>
                        </div>
                        <div className="text-zinc-500">
                          {`${page?.unique?.A?.submit_sessions ?? 0}/${page?.unique?.A?.view_sessions ?? 0} vs ${page?.unique?.B?.submit_sessions ?? 0}/${page?.unique?.B?.view_sessions ?? 0}`}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="mt-3 text-[11px] text-zinc-400">Conversion unique = sessions submit / sessions vue formulaire.</div>
            </div>
          ) : null}
        </div>
      )}
    </BackofficeShell>
  )
}
