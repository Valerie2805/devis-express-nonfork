# Backoffice — Preview instantanée (modal + iframe) — Design

## Objectif

Permettre une **preview instantanée** du site public depuis le Backoffice (Réglages), incluant :
- brouillon “Contenu du site” (ex: `branding.hero_image_url`, `site_copy_override.hero`)
- brouillon “Apparence” (thème + variants)

Sans sauvegarder en base tant que l’utilisateur ne clique pas “Sauvegarder”.

## Principes

- Preview locale (même navigateur) via `localStorage`
- Modal plein écran avec `iframe` vers `/site/:businessId?preview=1`
- Le site public, en mode preview, applique un patch local (deep-merge) au `config` récupéré depuis l’API

## UX

### Entrée

Dans Backoffice → Réglages :
- Bouton “Preview” dans le bloc “Contenu du site” (et/ou dans l’entête de page)

### Modal preview

Modal plein écran :
- `iframe` du site public
- actions :
  - “Rafraîchir”
  - “Ouvrir dans un onglet”
  - “Fermer”
  - (option) “Effacer le brouillon”

## Stockage brouillon

### Clé

- `localStorage["site_preview:<businessId>"]`

### Payload minimal

```json
{
  "updated_at": "2026-04-30T00:00:00.000Z",
  "patch": {
    "branding": { "hero_image_url": "https://..." },
    "site_copy_override": { "hero": { "h1": "...", "subtitle": "...", "ctas": ["..."] } },
    "appearance": { "theme_id": "ocean", "sections": { "hero": { "variant": "split" } } }
  }
}
```

## Site public — application du patch

### Activation

- Si `location.search` contient `preview=1` :
  - charger `localStorage["site_preview:<businessId>"]`
  - `config = deepMerge(config, patch)` (deep merge)

### Re-merge contenu “site_copy”

Le serveur renvoie déjà `content.site_copy` (template + overrides persistés).
En preview, pour refléter le brouillon “site_copy_override” non persisté :
- re-calculer côté client :
  - `content.site_copy = deepMerge(content.site_copy, config.site_copy_override)`

## Sécurité / contraintes

- Le patch n’est disponible que localement (pas partagé, pas public).
- Aucun endpoint “preview” serveur requis en V1.
- La preview peut afficher des données live (reviews/photos) sans risques particuliers.

## Implémentation (high-level)

### Front (Backoffice)

- Ajouter un composant modal avec iframe.
- À l’ouverture :
  - écrire le snapshot du draft dans `localStorage`
  - ouvrir le modal avec iframe `src="/site/:businessId?preview=1"`

### Front (Site public)

- Ajouter une lecture du mode preview après `useBusinessConfig()` :
  - deep merge sur `data.config`
  - re-merge `content.site_copy`

## Tests / validation

- Unit:
  - `deepMerge` appliqué correctement (si helper existant, sinon test du merge choisi)
- UI (vitest + RTL):
  - `preview=1` + localStorage patch → l’image hero et le h1 changent

## Critères d’acceptation

- Depuis Backoffice, modifier thème/variants + hero texte/image, cliquer “Preview” → le site public reflète immédiatement le brouillon.
- Fermer sans “Sauvegarder” → aucun changement en DB.

