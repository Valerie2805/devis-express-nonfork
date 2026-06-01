# Thèmes (V2) — Styles composants très marqués — Site public “produit” — Design

## Objectif

Rendre les 12 thèmes **beaucoup plus distincts** (au-delà des couleurs/typos) en ajoutant des **tokens de styles composants** (boutons, cards, badges, liens, hero) pilotés par CSS variables, sans dupliquer les composants React.

## Contrainte

- **Pas de duplication** de composants (pas de `ButtonOcean`, `ButtonTerra`, etc.)
- Un même markup doit rendre différemment selon le thème via **CSS variables**
- Différences **très marquées** (pill vs sharp, flat vs glass, bordures accent, ombres fortes, etc.)

## Hors scope

- Toggle dark/light
- Builder visuel
- Variantes de sections supplémentaires (déjà gérées séparément)

## Approche

### 1) Étendre le modèle de thème

On étend `ThemeVars` pour inclure des tokens “component styles” :

**Boutons**
- `--btn-primary-bg` (gradient, flat, neon)
- `--btn-primary-text`
- `--btn-primary-border`
- `--btn-primary-shadow`
- `--btn-primary-radius`

**Surfaces / Cards**
- `--card-bg` (flat / glass / patterned)
- `--card-border`
- `--card-shadow`
- `--card-radius`

**Badges**
- `--badge-bg`
- `--badge-border`
- `--badge-text`
- `--badge-radius`

**Liens**
- `--link`
- `--link-hover`

**Hero**
- `--hero-overlay` (none / glow / gradient / noise)

### 2) Ajouter/adapter des classes utilitaires “site-*”

Dans `index.css`, on fait évoluer les helpers :
- `.site-primary` devient le bouton primaire (utilise tokens btn)
- `.site-surface` / `.site-surface2` restent des surfaces, mais `.site-card` devient la “card standard”
- `.site-badge` pour chips / badges
- `.site-link` pour les liens
- `.site-hero` utilise `--hero-overlay` pour un rendu très distinct

### 3) Appliquer sur les points clés

On applique ces classes aux endroits déjà utilisés :
- Header CTA (Appeler / WhatsApp / Devis) dans `SiteShell`
- CTA group dans `BlueprintPage`
- Cards (services, proof, FAQ blocks) dans `BlueprintPage`
- Formulaire devis (`QuoteForm`) : inputs et bouton submit (si nécessaire)

## Catalogue (12 thèmes, styles très marqués)

Chaque thème conserve :
- bg / surface / text / border / primary / accent / accentGlow
- fonts

Et ajoute des styles “signature”, par exemple :
- `mono` : sharp radius, flat, border noir, shadow minimal
- `sunset` : pill radius, gradient chaud, glow fort, badges néon
- `royal` : glass cards + bordures violettes, shadow forte
- `forest` : boutons “mat”, cards avec border accent verte, radius medium
- etc.

## Tests / validation

- Unit test : `?theme=` continue d’override
- Smoke test UI : au moins 4 thèmes ont des différences visibles sur :
  - hero
  - CTA buttons
  - cards (services/tarifs)

## Critères d’acceptation

- Sur une même page (home + tarifs), passer de `ivory` à `sunset` ou `mono` change clairement :
  - forme des boutons
  - style des cards
  - style des badges
  - style du hero (overlay)
- Aucun nouveau composant “dupliqué” par thème
- Typecheck + tests passent

