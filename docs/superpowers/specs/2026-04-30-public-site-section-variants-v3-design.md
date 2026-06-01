# Variantes multi-sections (V3) — Site public “produit” — Design

## Objectif

Permettre de varier fortement l’apparence d’un site public, **même à thème identique**, en ajoutant des variantes de layout/styling sur plusieurs sections clés.

Les variantes sont **choisies manuellement** dans Backoffice → Réglages → Apparence.

## Données

Stockage dans `business.config_json.appearance` :

- `appearance.sections.services.variant` : `grid | split | list`
- `appearance.sections.zones.variant` : `chips | columns | mapless`
- `appearance.sections.reviews.variant` : `compact | cards | carousel_like`
- `appearance.sections.faq.variant` : `cards | accordion | two_columns`
- `appearance.sections.footer.variant` : `minimal | rich | contact_focus`

Defaults (si absent) :
- `services=grid`
- `zones=chips`
- `reviews=cards`
- `faq=cards`
- `footer=rich`

## Rendu

### Services

- `grid` : cartes en grille
- `split` : lignes 2 colonnes (titre à gauche, détails/CTA à droite)
- `list` : liste compacte (sans “cards”)

### Zones

- `chips` : badges (chips)
- `columns` : liste en colonnes
- `mapless` : encart “texte + liste” (sans carte)

### Avis / preuves

- `cards` : grille de cards (actuel)
- `compact` : liste minimaliste (une colonne)
- `carousel_like` : horizontal scroll (sans carousel JS)

### FAQ

- `cards` : cards (actuel)
- `accordion` : `details/summary`
- `two_columns` : 2 colonnes compactes

### Footer

- `rich` : footer actuel (infos + promesses)
- `minimal` : footer ultra simple
- `contact_focus` : footer orienté contact + CTA

## UI Backoffice

Extension du bloc “Apparence” :
- dropdowns variants : Services, Zones, Avis, FAQ, Footer
- persist via le PATCH settings existant, en mettant à jour `config.appearance`

## Critères d’acceptation

- Changer uniquement les variants modifie clairement l’apparence (home/services/zones).
- Les valeurs par défaut s’appliquent si `appearance` est absent.
- Typecheck + tests passent.

