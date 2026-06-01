# Hero “Fond IA” (métier) + Zoom Dynamique — Design

**Contexte:** Le site public (`/site/:businessId`) affiche une Hero. On veut pouvoir afficher une image de fond “IA selon métier” uniquement sur la Hero, avec un zoom lent type Ken Burns. L’image doit rester optionnelle et paramétrable via Réglages.

## Objectifs

- Afficher un **fond image** sur la section Hero du site public quand `branding.hero_image_url` est présent.
- Appliquer un **zoom dynamique** (Ken Burns) en continu (~20s) sur ce fond.
- Garantir la **lisibilité du texte** via un overlay “moyen”.
- Ajouter une option dans **Réglages** pour **générer** un fond IA (sans infra serveur additionnelle) en remplissant `branding.hero_image_url`.

## Hors scope

- Fond image sur toutes les sections/pages (seulement Hero).
- Parallax/zoom lié au scroll.
- Stockage serveur d’images générées (on utilise une URL directe de génération).

## Sources de données / configuration

- Champ existant: `config.branding.hero_image_url` (déjà editable/uploadable dans Réglages).
- Génération optionnelle: un bouton “Générer fond IA (métier)” met une URL de génération d’image dans `config.branding.hero_image_url`.

## UX / UI

### Réglages (Backoffice)

Dans “Image hero”:
- Conserver:
  - input URL `branding.hero_image_url`
  - upload image
  - supprimer
- Ajouter:
  - bouton **“Générer fond IA (métier)”**:
    - génère une URL de type:
      - `https://coreva-normal.trae.ai/api/ide/v1/text_to_image?prompt=...&image_size=landscape_16_9`
    - remplit `branding.hero_image_url` avec cette URL
    - ne fait pas d’appel backend dédié

### Site public (Hero)

- Quand `branding.hero_image_url` est présent:
  - l’image est utilisée **comme fond de Hero** (pas comme “card image” à côté)
  - overlay “moyen” pour lisibilité
  - animation Ken Burns (~20s, `alternate`, easing doux)
- Quand absent:
  - rendu actuel inchangé

## Implémentation (vue d’ensemble)

### CSS

Ajouter dans `src/index.css`:
- une classe `.site-hero-bg` (div absolue dans la Hero) avec:
  - `background-image` inline
  - `background-size: cover`, `background-position: center`
  - `animation: site-kenburns 20s ease-in-out infinite alternate`
- layering:
  - `.site-hero-bg` en z-index bas
  - l’overlay existant (pseudo-element) au-dessus
  - le contenu au-dessus de l’overlay
- `prefers-reduced-motion`: désactiver l’animation

### Rendu Hero

Dans `BlueprintPage.tsx` (section `hero`):
- si `hero_image_url`:
  - rendre `<div className="site-hero-bg" style={{ backgroundImage: `url(...)` }} />` au début de la section
  - ajouter une classe `site-hero-has-bg` sur la section
  - ne plus rendre la “card image” à droite (évite la duplication)

### Génération URL “fond IA”

Dans `Settings.tsx`:
- construire un prompt SDXL “photo réaliste web hero background” basé sur:
  - `config.trade_id`
  - `config.city` / `config.zone_label`
  - `config.company_name`
  - règles: “no text, no logo, no watermark”
- encoder le prompt avec `encodeURIComponent`
- `image_size=landscape_16_9`

## Tests

- Ajouter un test React:
  - quand `branding.hero_image_url` est défini, `BlueprintPage` rend `.site-hero-bg` et n’affiche pas l’image hero en card.
- Vérifier `tsc --noEmit` et suite vitest existante ciblée.

