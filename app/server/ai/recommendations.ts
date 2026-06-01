import { renderTemplate } from '../messaging.js'
import { loadSpecs } from '../specs.js'
import { safeJsonParse } from '../utils.js'
import { chatJson } from './openaiCompatible.js'

function normalizeText(v: any) {
  return String(v || '').trim()
}

export type AiRecommendations = {
  site_copy_override?: {
    hero?: { h1?: string; subtitle?: string }
  }
  message_templates_override?: {
    common?: Record<string, { sms?: string; whatsapp?: string }>
    trades?: Record<string, Record<string, { sms?: string; whatsapp?: string }>>
  }
  notes?: string[]
}

function buildRulesRecommendations(business: any) {
  const specs = loadSpecs()
  const company = normalizeText(business.company_name)
  const city = normalizeText(business.city)
  const zone = normalizeText(business.zone_label)
  const tradeId = normalizeText(business.trade_id)
  const tradeLabel = normalizeText(specs.siteCopy?.trades?.[tradeId]?.label) || tradeId

  const siteCopy: AiRecommendations['site_copy_override'] = {
    hero: {
      h1: company && city ? `${tradeLabel} à ${city} — ${company}` : city ? `${tradeLabel} à ${city}` : company ? company : undefined,
      subtitle: zone ? `Intervention sur ${zone}. Devis express par téléphone ou WhatsApp.` : undefined,
    },
  }

  const dummyLead = { first_name: '', request_type: business.trade_id, address: '' }
  const ackSms = renderTemplate('ack', 'sms', { business, lead: dummyLead }) || ''
  const ackWa = renderTemplate('ack', 'whatsapp', { business, lead: dummyLead }) || ''
  const followSms = renderTemplate('missed_call_followup', 'sms', { business, lead: dummyLead }) || ''
  const followWa = renderTemplate('missed_call_followup', 'whatsapp', { business, lead: dummyLead }) || ''

  const messageTemplates: AiRecommendations['message_templates_override'] = {
    common: {
      ack: {
        sms: ackSms ? ackSms.replace(/On vous répond sous X min\./g, 'Je reviens vers vous très vite.') : undefined,
        whatsapp: ackWa ? ackWa.replace(/On vous répond sous X min\./g, 'Je reviens vers vous très vite.') : undefined,
      },
      missed_call_followup: {
        sms: followSms,
        whatsapp: followWa,
      },
    },
  }

  return { site_copy_override: siteCopy, message_templates_override: messageTemplates, notes: [] } satisfies AiRecommendations
}

export async function generateHeroVariantB(business: any): Promise<{ mode: 'rules' | 'ai'; h1: string; subtitle: string; ctas?: string[] }> {
  const fallback = () => {
    const rec = buildRulesRecommendations(business)
    const hero = rec.site_copy_override?.hero || {}
    return { mode: 'rules' as const, h1: String(hero.h1 || ''), subtitle: String(hero.subtitle || ''), ctas: ['Appeler', 'WhatsApp', 'Devis express'] }
  }

  const provider = String(process.env.AI_PROVIDER || '').trim()
  if (!provider) return fallback()
  if (provider !== 'openai_compatible') return fallback()

  const input = {
    trade_id: business.trade_id,
    company_name: business.company_name,
    city: business.city,
    zone_label: business.zone_label,
    pricing: safeJsonParse<any>(business.pricing, business.pricing),
    services: safeJsonParse<any>(business.services, business.services),
  }

  const out = await chatJson([
    {
      role: 'system',
      content:
        'Tu es un expert conversion pour artisans. Propose une variante B de hero (h1 + subtitle + 3 CTA). Ton direct, orienté action. Réponds uniquement en JSON: {"h1":"...","subtitle":"...","ctas":["...","...","..."]}',
    },
    {
      role: 'user',
      content: JSON.stringify({
        task: 'Générer hero variante B unique, spécifique au business. Le client doit sentir que c’est son site.',
        business: input,
        constraints: { language: 'fr-FR', max_h1_chars: 70, max_subtitle_chars: 160, ctas_count: 3, max_cta_chars: 24 },
      }),
    },
  ])

  const h1 = normalizeText(out?.h1)
  const subtitle = normalizeText(out?.subtitle)
  const ctas = Array.isArray(out?.ctas) ? out.ctas.map((s: any) => normalizeText(s)).filter(Boolean).slice(0, 3) : []
  if (!h1 || !subtitle) return fallback()
  return { mode: 'ai', h1, subtitle, ctas: ctas.length === 3 ? ctas : ['Appeler', 'WhatsApp', 'Devis express'] }
}

export async function generateRecommendations(business: any): Promise<{ mode: 'rules' | 'ai'; recommendations: AiRecommendations }> {
  const provider = String(process.env.AI_PROVIDER || '').trim()
  if (!provider) return { mode: 'rules', recommendations: buildRulesRecommendations(business) }

  if (provider !== 'openai_compatible') return { mode: 'rules', recommendations: buildRulesRecommendations(business) }

  const input = {
    trade_id: business.trade_id,
    company_name: business.company_name,
    city: business.city,
    zone_label: business.zone_label,
    pricing: safeJsonParse<any>(business.pricing, business.pricing),
    services: safeJsonParse<any>(business.services, business.services),
  }

  const schema = {
    site_copy_override: { hero: { h1: 'string', subtitle: 'string' } },
    message_templates_override: { common: { ack: { sms: 'string', whatsapp: 'string' }, missed_call_followup: { sms: 'string', whatsapp: 'string' } } },
    notes: ['string'],
  }

  const out = await chatJson([
    {
      role: 'system',
      content:
        'Tu es un expert conversion pour artisans. Réponds uniquement en JSON valide, sans markdown, sans texte autour. Ton: humain, simple, non robot. Max 220 caractères par SMS.',
    },
    {
      role: 'user',
      content: JSON.stringify({
        task: 'Propose une personnalisation légère du site (hero) et 2 templates messages (ack, missed_call_followup). Le client doit sentir que le site est fait pour lui.',
        business: input,
        schema,
        language: 'fr-FR',
      }),
    },
  ])

  return { mode: 'ai', recommendations: out as AiRecommendations }
}
