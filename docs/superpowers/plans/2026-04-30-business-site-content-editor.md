# Éditeur de contenu (business) + hero image — Plan d’implémentation

## Objectif

Ajouter un éditeur “Contenu du site” dans Backoffice → Réglages, permettant :
- d’éditer des champs structurés qui se traduisent en `config.site_copy_override` (textes)
- d’ajouter une **image hero** stockée en `config.branding.hero_image_url`
- de rendre l’image hero sur le site public “dans le layout” en fonction de `hero.variant`

## Contexte technique (déjà en place)

- L’API site renvoie `config` + `content.site_copy` (merge template + `site_copy_override`) :
  - [site.ts](file:///Users/b.delb/Documents/trae_projects/devis-express/app/server/routes/v1/site.ts#L160-L170)
- Uploads existants :
  - logo : `POST /api/v1/backoffice/:businessId/logo/upload`
  - galerie : `POST /api/v1/backoffice/:businessId/photos/upload`
  - assets génériques : `POST /api/v1/site/:businessId/assets` (avec `kind`)

---

## Étapes

### 1) Backend — Autoriser `kind=hero_image` (assets)

**Fichiers**
- Modifier : [site.ts](file:///Users/b.delb/Documents/trae_projects/devis-express/app/server/routes/v1/site.ts)

**Actions**
- [ ] Étendre `normalizeAssetKind()` pour accepter `hero_image`
- [ ] Laisser l’endpoint `POST /site/:businessId/assets` stocker l’asset avec `asset.kind='hero_image'`
- [ ] Ajouter 1 test server sur l’endpoint assets avec `kind=hero_image` (upload simple)

### 2) Backoffice — UI “Contenu du site” (V1)

**Fichiers**
- Modifier : [Settings.tsx](file:///Users/b.delb/Documents/trae_projects/devis-express/app/src/pages/backoffice/Settings.tsx)

**UI**
- [ ] Ajouter un bloc “Contenu du site” (sous “Apparence”)
- [ ] V1 : onglet “Accueil” avec :
  - Hero h1, subtitle, ctas (3 champs)
  - Image hero : upload fichier + champ URL + bouton supprimer

**Persistance**
- [ ] Écrire dans `config.site_copy_override.hero.h1/subtitle/ctas`
- [ ] Écrire dans `config.branding.hero_image_url`
- [ ] Utiliser `PATCH /backoffice/:businessId/settings` existant

**Upload image hero**
- [ ] Utiliser `POST /api/v1/site/:businessId/assets` avec `kind=hero_image`
- [ ] À la réponse `{ url }`, remplir `branding.hero_image_url` et sauvegarder via PATCH settings

### 3) Site public — Afficher l’image hero “dans le layout”

**Fichiers**
- Modifier : [BlueprintPage.tsx](file:///Users/b.delb/Documents/trae_projects/devis-express/app/src/components/site/BlueprintPage.tsx)

**Règles de placement**
- [ ] Si `config.branding.hero_image_url` est défini :
  - `hero.variant=split` : image à droite (card)
  - `hero.variant=centered` : image au-dessus du texte
  - `hero.variant=classic` : image à droite sur desktop, sous le texte sur mobile

**Styles**
- [ ] Wrapper image en `site-card` + `<img>` en `object-cover` + ratio fixe (ex: `aspect-[4/3]`)

### 4) Tests + Vérif

- [ ] `./node_modules/.bin/tsc --noEmit`
- [ ] `npx vitest run src --reporter dot`
- [ ] `npx vitest run server --reporter dot --maxWorkers=1`

---

## Critères d’acceptation

- Backoffice : on peut définir une image hero (upload ou URL) + modifier h1/subtitle/cta.
- Site public : l’image hero apparaît dans le layout, et change de position selon `hero.variant`.
- Typecheck + tests OK.

