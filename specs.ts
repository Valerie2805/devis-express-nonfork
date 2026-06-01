import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import YAML from 'yaml'

type SpecCache = {
  siteCopy: any
  messages: any
  scoring: any
  tarifs: any
  formSchema: any
  blueprints: any
}

export const COMMON_TRADES: Array<{ trade_id: string; label: string }> = [
  { trade_id: 'plombier_chauffagiste', label: 'Plombier / Chauffagiste' },
  { trade_id: 'electricien', label: 'Électricien' },
  { trade_id: 'serrurier', label: 'Serrurier' },
  { trade_id: 'couvreur_zingueur', label: 'Couvreur / Zingueur' },
  { trade_id: 'pac_clim_chauffage', label: 'PAC / Clim / Chauffage' },
  { trade_id: 'vitrier', label: 'Vitrier' },
  { trade_id: 'debouchage_assainissement', label: 'Débouchage / Assainissement' },
  { trade_id: 'volets_portes_garage', label: 'Volets / Portes de garage' },
  { trade_id: 'anti_nuisibles', label: 'Anti-nuisibles' },
  { trade_id: 'ramonage_poeles_cheminees', label: 'Ramonage / Poêles / Cheminées' },
  { trade_id: 'fleuriste', label: 'Fleuriste' },
  { trade_id: 'peintre', label: 'Peintre' },
  { trade_id: 'carreleur', label: 'Carreleur' },
  { trade_id: 'macon', label: 'Maçon' },
  { trade_id: 'menuisier', label: 'Menuisier' },
  { trade_id: 'charpentier', label: 'Charpentier' },
  { trade_id: 'plaquiste', label: 'Plaquiste / Plâtrier' },
  { trade_id: 'isolation', label: 'Isolation' },
  { trade_id: 'facadier', label: 'Façadier' },
  { trade_id: 'jardinier_paysagiste', label: 'Jardinier / Paysagiste' },
  { trade_id: 'elagage_abattage', label: 'Élagage / Abattage' },
  { trade_id: 'nettoyage', label: 'Nettoyage' },
  { trade_id: 'demenagement', label: 'Déménagement' },
  { trade_id: 'renovation_salle_de_bain', label: 'Rénovation salle de bain' },
  { trade_id: 'renovation_cuisine', label: 'Rénovation cuisine' },
  { trade_id: 'sols_parquet', label: 'Sols / Parquet' },
  { trade_id: 'fenetres_portes', label: 'Fenêtres / Portes' },
  { trade_id: 'alarme_securite', label: 'Alarme / Sécurité' },
  { trade_id: 'panneaux_solaires', label: 'Panneaux solaires' },
  { trade_id: 'clotures_portails', label: 'Clôtures / Portails' },
]

export function tradeLabelFromId(tradeId: any): string | null {
  const id = String(tradeId || '').trim()
  if (!id) return null
  const hit = COMMON_TRADES.find((t) => t.trade_id === id)
  return hit ? hit.label : null
}

export function humanizeTradeId(tradeId: any): string {
  const raw = String(tradeId || '').trim()
  if (!raw) return ''
  const s = raw.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
  return s.replace(/\b\p{L}/gu, (c) => c.toUpperCase())
}

export function isTextToImageUrl(url: any) {
  const s = String(url || '').trim()
  return s.startsWith('https://coreva-normal.trae.ai/api/ide/v1/text_to_image?prompt=')
}

export function makeTextToImageUrl(prompt: string, imageSize: string) {
  return `https://coreva-normal.trae.ai/api/ide/v1/text_to_image?prompt=${encodeURIComponent(prompt)}&image_size=${encodeURIComponent(imageSize)}`
}

export function defaultGalleryUrlsForTrade(tradeId: any) {
  const label = tradeLabelFromId(tradeId) || humanizeTradeId(tradeId) || 'artisan'
  const common = `realistic professional photography, ${label} at work in France, clean modern environment, tools visible, no text, no logo, no watermark, documentary style, natural light, 35mm, high detail`
  const id = String(tradeId || '').trim()
  if (id === 'serrurier') {
    return [
      makeTextToImageUrl(`${common}, locksmith opening a door with professional tools, close-up hands and lock`, 'landscape_4_3'),
      makeTextToImageUrl(`${common}, locksmith changing a door cylinder lock, home entrance, tidy`, 'landscape_4_3'),
      makeTextToImageUrl(`${common}, locksmith workshop bench with keys and lock components, professional`, 'landscape_4_3'),
    ]
  }
  if (id === 'electricien') {
    return [
      makeTextToImageUrl(`${common}, electrician working on electrical panel, safety gloves`, 'landscape_4_3'),
      makeTextToImageUrl(`${common}, electrician installing wall outlet, modern interior`, 'landscape_4_3'),
      makeTextToImageUrl(`${common}, electrician testing voltage with multimeter, close-up`, 'landscape_4_3'),
    ]
  }
  if (id === 'fleuriste') {
    return [
      makeTextToImageUrl(`${common}, florist arranging bouquet on worktable, fresh flowers, shop interior`, 'landscape_4_3'),
      makeTextToImageUrl(`${common}, florist shop display with bouquets and plants, natural light`, 'landscape_4_3'),
      makeTextToImageUrl(`${common}, close-up hands tying bouquet with ribbon, premium look`, 'landscape_4_3'),
    ]
  }
  if (id === 'plombier_chauffagiste') {
    return [
      makeTextToImageUrl(`${common}, plumber fixing sink pipes under kitchen counter, modern apartment`, 'landscape_4_3'),
      makeTextToImageUrl(`${common}, plumber unclogging bathroom drain, professional equipment`, 'landscape_4_3'),
      makeTextToImageUrl(`${common}, plumber checking water heater, clean installation`, 'landscape_4_3'),
    ]
  }
  return [
    makeTextToImageUrl(`${common}, wide shot of professional at work`, 'landscape_4_3'),
    makeTextToImageUrl(`${common}, close-up of tools and hands working`, 'landscape_4_3'),
    makeTextToImageUrl(`${common}, finished result, clean and professional`, 'landscape_4_3'),
  ]
}

let cache: SpecCache | null = null

function readYaml(filePath: string) {
  const raw = fs.readFileSync(filePath, 'utf8')
  return YAML.parse(raw)
}

export function loadSpecs(): SpecCache {
  if (cache) return cache
  const baseDir = path.dirname(fileURLToPath(import.meta.url))
  const repoRoot = path.resolve(baseDir, '..', '..')
  const root = path.join(repoRoot, 'machine-a-devis')
  if (!fs.existsSync(root)) {
    throw new Error('Missing machine-a-devis folder (enable "Include files outside root directory" on Vercel)')
  }
  cache = {
    siteCopy: readYaml(path.join(root, 'content', 'fr', 'site_copy.yml')),
    messages: readYaml(path.join(root, 'content', 'fr', 'messages.yml')),
    scoring: readYaml(path.join(root, 'content', 'fr', 'scoring.yml')),
    tarifs: readYaml(path.join(root, 'content', 'fr', 'tarifs_transparents.yml')),
    formSchema: readYaml(path.join(root, 'product', 'form_schema.yml')),
    blueprints: readYaml(path.join(root, 'product', 'pages_blueprints.yml')),
  }
  return cache
}
