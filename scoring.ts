type LeadInput = {
  trade_id: string
  request_type: string
  in_zone: boolean
  phone_valid: boolean
  urgency: 'now' | 'today' | 'week'
  channel_preference: 'call' | 'whatsapp' | 'sms'
  description?: string | null
  address?: string | null
  photos_count: number
  slot_preference?: string | null
  answers: Record<string, any> | null
}

type ScoreResult = {
  score: number
  decision: 'reject' | 'needs_followup' | 'qualified'
  tags: string[]
}

function isBlank(v: unknown) {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '')
}

export function computeScore(scoringSpec: any, input: LeadInput): ScoreResult {
  const points = scoringSpec.common?.points ?? {}
  const thresholds = scoringSpec.thresholds ?? { qualified_min: 70, followup_min: 40, reject_below: 40 }

  if (!input.phone_valid) {
    return { score: -999, decision: 'reject', tags: ['invalid_phone'] }
  }
  if (!input.in_zone) {
    return { score: -999, decision: 'reject', tags: ['out_of_zone'] }
  }

  let score = 0
  const tags = new Set<string>()

  score += points.in_zone?.true ?? 0
  score += points.phone_valid?.true ?? 0
  score += (points.urgency?.[input.urgency] ?? 0) as number
  score += (points.channel_preference?.[input.channel_preference] ?? 0) as number
  score += !isBlank(input.description) ? (points.has_description?.true ?? 0) : (points.has_description?.false ?? 0)
  score += !isBlank(input.address) ? (points.has_address?.true ?? 0) : (points.has_address?.false ?? 0)
  score += !isBlank(input.slot_preference) ? (points.has_slot_preference?.true ?? 0) : (points.has_slot_preference?.false ?? 0)
  score += input.photos_count > 0 ? (points.has_photos?.true ?? 0) : (points.has_photos?.false ?? 0)

  if (input.urgency === 'now') tags.add('urgent')

  const tradeSpec = scoringSpec.trades?.[input.trade_id] ?? {}
  const requiredPhotosFor = new Set<string>(tradeSpec.required_photos_for ?? [])
  const requiredAnswersFor = tradeSpec.required_answers_for ?? {}

  const requiredPhotos = requiredPhotosFor.has(input.request_type)
  if (requiredPhotos && input.photos_count === 0) {
    score += points.missing_required_photos ?? -25
    tags.add('missing_photos')
  }

  if (requiredAnswersFor && input.answers) {
    for (const key of Object.keys(requiredAnswersFor)) {
      const required = Boolean(requiredAnswersFor[key])
      if (!required) continue
      if (input.answers && isBlank(input.answers[key])) {
        score += points.missing_required_answer ?? -15
        tags.add(`missing_${key}`)
      }
    }
  } else if (requiredAnswersFor && Object.keys(requiredAnswersFor).length > 0) {
    for (const key of Object.keys(requiredAnswersFor)) {
      const required = Boolean(requiredAnswersFor[key])
      if (!required) continue
      score += points.missing_required_answer ?? -15
      tags.add(`missing_${key}`)
    }
  }

  const extra = tradeSpec.extra_points ?? {}
  if (input.trade_id === 'plombier_chauffagiste') {
    const fuiteActive = Boolean(input.answers?.fuite_active)
    score += fuiteActive ? (extra.fuite_active_true ?? 0) : (extra.fuite_active_false ?? 0)
    if (input.urgency === 'now') score += extra.urgency_now_extra ?? 0
    if (['fuite_eau', 'recherche_fuite'].includes(input.request_type) && fuiteActive) tags.add('safety_water')
  }

  if (input.trade_id === 'serrurier') {
    const effraction = Boolean(input.answers?.effraction) || input.request_type === 'effraction_securisation'
    if (effraction) score += extra.effraction_true ?? 0
    if (input.urgency === 'now') score += extra.urgency_now_extra ?? 0
    if (effraction) tags.add('security')
  }

  if (input.trade_id === 'electricien') {
    const danger = Boolean(input.answers?.danger_brule_etincelle)
    if (danger) score += extra.danger_true ?? 0
    if (input.urgency === 'now') score += extra.urgency_now_extra ?? 0
    if (danger) tags.add('danger')
  }

  if (input.trade_id === 'couvreur_zingueur') {
    const infil = Boolean(input.answers?.infiltration_active)
    if (infil) score += extra.infiltration_active_true ?? 0
    if (input.urgency === 'now') score += extra.urgency_now_extra ?? 0
    if (input.request_type === 'fuite_infiltration' && infil) tags.add('weather_risk')
  }

  if (input.trade_id === 'pac_clim_chauffage') {
    if (input.request_type === 'installation') score += extra.installation_bonus ?? 0
    if (!isBlank(input.answers?.surface_m2)) score += extra.surface_provided_bonus ?? 0
    if (input.request_type === 'installation' && (isBlank(input.answers?.surface_m2) || isBlank(input.answers?.type_logement))) {
      tags.add('prequal_needed')
    }
  }

  if (input.trade_id === 'vitrier') {
    const secur = Boolean(input.answers?.besoin_securisation_immediate)
    if (secur) score += extra.securisation_true ?? 0
    if (input.urgency === 'now') score += extra.urgency_now_extra ?? 0
    if (input.request_type === 'vitre_cassee' || secur) tags.add('glass_hazard')
  }

  if (input.trade_id === 'debouchage_assainissement') {
    const ref = Boolean(input.answers?.refoulement_oui_non) || input.request_type === 'refoulement'
    if (ref) score += extra.refoulement_true ?? 0
    if (input.urgency === 'now') score += extra.urgency_now_extra ?? 0
    if (ref) tags.add('sanitary_urgent')
  }

  if (input.trade_id === 'volets_portes_garage') {
    const open = input.request_type === 'volet_bloque_ouvert' || input.answers?.bloque_ouvert_ou_ferme === 'ouvert'
    if (open) score += extra.bloque_ouvert_true ?? 0
    if (input.urgency === 'now') score += extra.urgency_now_extra ?? 0
    if (open) tags.add('security_open')
  }

  if (input.trade_id === 'anti_nuisibles') {
    if (input.request_type === 'guepes_frelons') tags.add('stinging_risk')
  }

  let decision: ScoreResult['decision'] = 'needs_followup'
  if (score < 0) decision = 'reject'
  else if (score >= thresholds.qualified_min) decision = 'qualified'
  else decision = 'needs_followup'

  return { score, decision, tags: Array.from(tags) }
}
