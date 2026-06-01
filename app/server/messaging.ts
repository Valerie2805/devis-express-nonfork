import { loadSpecs } from './specs.js'

type RenderArgs = {
  business: any
  lead: any
  variables?: Record<string, string>
}

function replaceAll(text: string, replacements: Record<string, string>) {
  let out = text
  for (const [k, v] of Object.entries(replacements)) {
    out = out.split(k).join(v)
  }
  return out
}

export function renderTemplate(templateId: string, channel: 'sms' | 'whatsapp', args: RenderArgs) {
  const specs = loadSpecs()
  const tradeId = args.business.trade_id

  const overrideCommon = args.business?.settings?.message_templates_override?.common ?? {}
  const overrideTrade = args.business?.settings?.message_templates_override?.trades?.[tradeId] ?? {}
  const common = specs.messages?.common ?? {}
  const trade = specs.messages?.trades?.[tradeId] ?? {}

  const find = (scope: any) => {
    const entry = scope?.[templateId]
    if (!entry) return null
    return entry?.[channel] ?? null
  }

  const tpl = find(overrideCommon) || find(overrideTrade) || find(common) || find(trade) || null
  if (!tpl) return null

  const replacements: Record<string, string> = {
    '[Entreprise]': String(args.business.company_name || ''),
    '[Ville]': String(args.business.city || ''),
    '[Zone]': String(args.business.zone_label || ''),
    '[Téléphone]': String(args.business.phone_e164 || ''),
    '[Prénom]': String(args.lead.first_name || ''),
    '[Service]': String(args.lead.request_type || ''),
    '[Option 1]': String(args.variables?.slot_1 || ''),
    '[Option 2]': String(args.variables?.slot_2 || ''),
    '[Date]': String(args.variables?.date || ''),
    '[Heure]': String(args.variables?.time || ''),
    '[Adresse]': String(args.variables?.address || args.lead.address || ''),
  }

  return replaceAll(String(tpl), replacements)
}
