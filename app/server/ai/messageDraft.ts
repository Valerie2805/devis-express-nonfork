import { chatJson } from './openaiCompatible.js'

function normalizeText(v: any) {
  return String(v || '').trim()
}

function rulesDraft(business: any, lead: any) {
  const firstName = normalizeText(lead.first_name)
  const city = normalizeText(lead.city)
  const postal = normalizeText(lead.postal_code)
  const requestType = normalizeText(lead.request_type)
  const urgent = String(lead.urgency || '') === 'now'
  const hasDesc = Boolean(normalizeText(lead.description))
  const hasPhoto = Number(lead.photos_count || 0) > 0

  const who = firstName ? `Bonjour ${firstName},` : 'Bonjour,'
  const where = city || postal ? ` (${[postal, city].filter(Boolean).join(' ')})` : ''
  const what = requestType ? ` pour ${requestType}` : ''

  if (urgent) {
    if (!hasDesc && !hasPhoto) return `${who} j’ai bien reçu votre demande${what}${where}. Pouvez-vous me dire en 1 phrase ce qui se passe + 1 photo si possible ?`
    if (!hasDesc) return `${who} j’ai bien reçu votre demande${what}${where}. Pouvez-vous me décrire le problème en 1 phrase ?`
    return `${who} bien reçu${what}${where}. Je vous appelle dès que possible. Si vous avez une photo, envoyez-la ici.`
  }

  if (!hasDesc && !hasPhoto) return `${who} merci pour votre demande${what}${where}. Pour vous répondre vite : 1 phrase sur le problème + 1 photo si possible ?`
  if (!hasDesc) return `${who} merci pour votre demande${what}${where}. Pouvez-vous préciser le problème en 1 phrase ?`
  return `${who} merci pour votre demande${what}${where}. Je reviens vers vous très vite pour confirmer le tarif et un créneau.`
}

export async function generateMessageDraft(args: { business: any; lead: any; channel: 'sms' | 'whatsapp' }) {
  const provider = String(process.env.AI_PROVIDER || '').trim()
  if (!provider) return { mode: 'rules' as const, text: rulesDraft(args.business, args.lead) }
  if (provider !== 'openai_compatible') return { mode: 'rules' as const, text: rulesDraft(args.business, args.lead) }

  try {
    const out = await chatJson([
      {
        role: 'system',
        content:
          'Tu écris des messages courts pour un artisan. Style: humain, simple, pas robot. 1-2 phrases. Toujours demander une seule chose à la fois si info manquante. Réponds uniquement en JSON: {"text":"..."}',
      },
      {
        role: 'user',
        content: JSON.stringify({
          channel: args.channel,
          business: {
            trade_id: args.business.trade_id,
            company_name: args.business.company_name,
            city: args.business.city,
            zone_label: args.business.zone_label,
          },
          lead: {
            first_name: args.lead.first_name,
            request_type: args.lead.request_type,
            urgency: args.lead.urgency,
            city: args.lead.city,
            postal_code: args.lead.postal_code,
            address: args.lead.address,
            description: args.lead.description,
            photos_count: args.lead.photos_count,
          },
          constraints: { max_chars: args.channel === 'sms' ? 220 : 700, locale: 'fr-FR' },
        }),
      },
    ])

    const text = normalizeText(out?.text)
    if (!text) throw new Error('AI empty')
    return { mode: 'ai' as const, text }
  } catch {
    return { mode: 'rules' as const, text: rulesDraft(args.business, args.lead) }
  }
}

