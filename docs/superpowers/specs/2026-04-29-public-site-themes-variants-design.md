# Thèmes (12) + Variantes de sections — Site public “produit” (V1) — Design

## Objectif

Permettre de produire des sites publics visuellement très différents, sans dupliquer toute l’UI, via :
- **12 thèmes prédéfinis** (couleurs + styles + typographies)
- **variantes de sections** (au moins 2 sections en V1)
- sélection du thème :
  - depuis le **Backoffice → Réglages → Apparence**
  - via un paramètre de **preview** `?theme=<theme_id>` (override non persisté)

## Hors scope (V1)

- Builder visuel libre
- Thème “custom” au pixel près (couleurs/typos totalement libres)
- Variantes illimitées sur toutes les sections
- Thèmes du backoffice/interne (on ne les touche pas en V1)

## Concepts

### Thème

Un **thème** est identifié par `theme_id` et définit :
- Palette (CSS variables) :
  - `--bg`, `--surface`, `--surface-2`
  - `--text`, `--muted`
  - `--border`
  - `--primary`, `--primary-contrast`
  - `--accent`
- Style composants :
  - `--radius` (arrondi)
  - `--shadow` (ombre)
- Typographies :
  - `--font-sans` (texte)
  - `--font-display` (titres)

### Variantes de sections

Une page est composée de sections (ex : hero, tarifs). Chaque section peut avoir une variante sélectionnée (ex : `hero.variant = "split"`).

En V1 :
- `hero.variant` : au moins 3 variantes
- `pricing.variant` : au moins 3 variantes

## UX cible

### Backoffice : choisir un style

Dans **Réglages**, un nouvel écran (ou un bloc) **Apparence** :
- Champ **Thème** : dropdown + aperçu (nom + mini preview)
- Bloc **Variantes** :
  - “Hero” : dropdown variant
  - “Tarifs” : dropdown variant
- Bouton **Enregistrer**

### Preview rapide

Sur le site public, support d’un paramètre `?theme=<theme_id>` :
- applique le thème uniquement pour l’affichage en cours
- n’écrit rien en base
- sert au QA / à la démo

## Données

### Stockage du thème

Dans `business.config_json` :
- `appearance.theme_id` (string)
- `appearance.sections.hero.variant` (string)
- `appearance.sections.pricing.variant` (string)

Defaults (si absent) :
- `theme_id = "ivory"`
- `hero.variant = "classic"`
- `pricing.variant = "cards"`

## Catalogue de thèmes (V1)

Les thèmes sont prédéfinis dans le frontend (site public) et exposés en choix dans le backoffice.

Liste proposée (modifiable) :
- `ivory`
- `ocean`
- `terra`
- `forest`
- `sunset`
- `mono`
- `royal`
- `mint`
- `sand`
- `slate`
- `cherry`
- `sky`

Typographies (V1) :
- chaque thème choisit un duo `display` + `sans` (avec fallback system)
- chargement via CSS (Google Fonts) ou via `@font-face` si nécessaire

## Implémentation (structure)

### Front (site public)

- Ajouter une couche “theme” au root du site public :
  - lit `appearance.theme_id` depuis le endpoint config site
  - applique les CSS variables sur un wrapper (ou `:root` dans le scope site)
  - si `?theme=` présent : override
- Ajouter la bibliothèque de thèmes (JS/TS) :
  - `theme_id` → palette + radius + shadow + fonts
- Ajouter les variantes de sections :
  - `Hero` : 3 variantes
  - `Pricing` : 3 variantes

### Front (backoffice)

- Ajouter “Apparence” dans Réglages :
  - dropdown thème (liste des 12)
  - dropdown variantes (hero/pricing)
  - sauvegarde via `PATCH /backoffice/:businessId/settings` (déjà existant)

### API

- Pas de nouvel endpoint.
- Le site public consomme déjà `GET /api/v1/site/:businessId/config` qui expose `config_json`.
- Le backoffice modifie déjà la config via settings.

## Tests

- Unit/UI :
  - sélection d’un thème dans “Apparence” → persist dans config → reload → le site public le reflète
  - `?theme=` override : change l’apparence sans persister
- Snapshot CSS non nécessaire, mais tests doivent vérifier la présence des variables appliquées (ex: style attr sur wrapper) et le variant rendu.

## Critères d’acceptation

- Un business peut choisir un `theme_id` parmi 12, et le site public change clairement de style (pas seulement la couleur primaire).
- `?theme=` permet de preview n’importe quel thème sans enregistrer.
- Au moins 2 sections ont des variantes sélectionnables et visibles (hero + pricing).
- Aucun impact sur le backoffice/interne (hors écran “Apparence”).

