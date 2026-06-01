# Éditeur de contenu (par business) + médias (logo/galerie/hero image) — Design

## Objectif

Permettre d’éditer **le contenu du site public** pour un business donné (pas un template global), en modifiant :
- les **textes** via overrides (`site_copy_override`, `tarifs_override`, `tarifs_common_override`)
- les **médias** : logo + galerie + **image hero**

## Portée V1

- Éditeur de contenu **dans le backoffice** (Réglages → Contenu du site)
- Champs structurés (pas d’éditeur YAML libre)
- Image hero = **image “dans le layout”**, pas un background

## Hors scope

- Édition globale par métier (templates)
- Builder libre de pages (sections custom)
- Gestion fine SEO (meta title/description, OG images)

## Données

### Textes

On continue d’utiliser les overrides existants :
- `config.site_copy_override` (merge avec le contenu “site_copy.yml” côté API)
- `config.tarifs_override`
- `config.tarifs_common_override`

### Médias

- Logo : existant (`config.logo_url`)
- Galerie : existant (`business_gallery_photo` + assets kind `gallery_photo`)
- Image hero (V1) : ajouter dans `config.branding.hero_image_url` et optionnellement `config.branding.hero_image_alt`

## API / Backend

### 1) Upload hero image

Réutiliser l’endpoint existant `POST /api/v1/site/:businessId/assets` mais permettre un nouveau kind :
- `hero_image`

Changements :
- étendre `normalizeAssetKind()` pour accepter `hero_image`
- stocker l’asset en base dans `asset.kind = 'hero_image'`

### 2) Persistance de l’URL hero image

La persistance se fait via `PATCH /api/v1/backoffice/:businessId/settings` (déjà en place), en mettant à jour :
- `branding.hero_image_url`
- `branding.hero_image_alt` (optionnel)

## UI — Backoffice

Dans Backoffice → Réglages, ajouter un bloc **Contenu du site** avec onglets :
- Accueil
- Services
- Zones
- Tarifs

### Champs V1 (exemples)

**Accueil**
- Hero : `h1`, `subtitle`, `ctas[]`
- Services list (liste de strings)
- FAQ (liste de `{ q, a }`)
- CTA banner : `text`, `cta`

**Services**
- Intro : `headline`, `subtitle`
- CTA banner : `text`, `cta`
- Services list
- FAQ (si affichée sur la page)

**Zones**
- Intro : `headline`, `subtitle`
- CTA banner : `text`, `cta`
- Zones list (si souhaité via config existante)

**Tarifs**
- Hero common : `h1`, `subtitle`, `ctas[]` (via `tarifs_common_override`)
- Sections (bullets/blocks) : champs structurés minimaux (title + bullets / title + content)
- FAQ tarifs (Q/R)

### Médias (dans “Hero” de chaque page)

Bloc “Image hero” :
- preview
- upload (fichier)
- URL directe (optionnel)
- supprimer (remise à null)

## Rendu — Site public

### Placement de l’image hero (image “dans le layout”)

Dans la section hero (renderer Blueprint) :
- Si `branding.hero_image_url` est défini :
  - `hero.variant = split` : image à droite (card) avec ratio fixe
  - `hero.variant = centered` : image au-dessus du bloc texte (centrée)
  - `hero.variant = classic` : image à droite sur desktop, en dessous sur mobile

L’image suit le thème via les tokens existants :
- wrapper en `site-card`
- arrondis/shadow gérés par tokens

## Sécurité / Permissions

- Édition contenu : permission `settings_write` (même modèle que Réglages)
- Upload hero image : passe par l’endpoint site assets (à protéger si nécessaire), ou exposer un endpoint backoffice si on veut strictement `settings_write`

## Tests / Validation

- Unit/UI :
  - `branding.hero_image_url` présent → rendu d’une image dans hero
  - upload `hero_image` retourne une URL valide
  - patch settings persiste `branding.hero_image_url`
- Régression :
  - typecheck OK
  - vitest `src` + `server` OK

## Critères d’acceptation

- Un utilisateur backoffice peut modifier les textes principaux (au moins hero + intro + FAQ) et voir le site public refléter ces changements.
- Un utilisateur backoffice peut définir une image hero (upload ou URL) et elle apparaît dans le hero du site public, en cohérence avec le variant hero.

