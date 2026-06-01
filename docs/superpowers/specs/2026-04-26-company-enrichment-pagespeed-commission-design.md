# Enrichissement “Entreprise” (effectifs/CA/secteur) + PageSpeed + Commissions — Design

**Date :** 2026-04-26  
**Contexte :** l’application contient déjà :
- un module **Backoffice** (table `business` + gestion des leads),
- un module **Prospection interne** (table `prospect`) pour collecter des entreprises à contacter,
- un module **Site Audits** (crawl + audit “rules/IA”) rattaché à `business_id`.

**Objectif :** stocker et exploiter des informations “entreprise” pour **les clients (business)** et **les prospects (prospect)**, avec :
- effectifs (tranches),
- contact email issu des mentions légales (et éditable),
- dates de création/refonte du site (saisie manuelle),
- CA + calcul commission (taux %) + charges (%) + historique mensuel,
- PageSpeed Insights (scores, dont accessibilité) + filtres “accessibilité < X”.

---

## 1) Portée fonctionnelle

### 1.1 Données “profil entreprise” (communes)
Champs (tous optionnels) :
- **Effectifs** : enum `0_1 | 2_10 | 11_20 | 21_49 | 50_plus`
- **Contact email (mentions légales)** : `legal_contact_email`
- **Site web** : `website_url`
- **Dates site** :
  - `website_created_at` (date)
  - `website_redesign_at` (date, nullable)
- **Secteur d’activité** :
  - `naf_code` (optionnel, ex `4332A`)
  - `sector_label` (texte libre)
- **CA** : `annual_revenue_eur` (nombre, plutôt géré côté interne)

Règle d’accès :
- Backoffice (artisan) : lecture/écriture des champs “profil” (effectifs/secteur/dates/site/email).
- Interne (admin) : lecture/écriture de tout + ajout CA + commission + PageSpeed.
- CA/commission : **uniquement interne**.

### 1.2 PageSpeed Insights (PSI)
Pour chaque entreprise, stocker un **historique** de mesures PSI pour :
- **mobile**
- **desktop**

Scores attendus :
- performance
- accessibility
- seo
- best_practices

Fonctions :
- “Refresh” PSI (par entreprise, et en bulk optionnel)
- filtre : “accessibility < X”
- affichage du score PSI par entreprise

API Key :
- supporte PSI **sans clé** (quota faible) + supporte une clé via `PAGESPEED_API_KEY` quand elle existe.

### 1.3 Commissions
But : suivre “ce que je touche” mensuellement, avec :
- saisie d’un **CA** (par entreprise et par mois, ou global si non rattaché),
- choix du **taux de commission** (ex 10%/15%),
- déduction de **charges** via un **% fixe**,
- calcul et stockage :
  - `commission_gross = ca_eur × (rate_pct/100)`
  - `charges_amount = commission_gross × (charges_pct/100)`
  - `commission_net = commission_gross - charges_amount`
- agrégation par mois (total net).

---

## 2) Modèle de données

### 2.1 Table `company_profile` (profil partagé)
But : unifier les champs “entreprise” pour `business` et `prospect` sans duplication.

Colonnes (proposition) :
- `company_profile_id` (uuid)
- `business_id` (uuid, nullable)
- `prospect_id` (uuid, nullable)
- `website_url` (text, nullable)
- `legal_contact_email` (text, nullable)
- `headcount_range` (text, nullable)
- `naf_code` (text, nullable)
- `sector_label` (text, nullable)
- `annual_revenue_eur` (integer, nullable)
- `website_created_at` (text date `YYYY-MM-DD`, nullable)
- `website_redesign_at` (text date `YYYY-MM-DD`, nullable)
- `created_at` / `updated_at` (iso)

Contraintes :
- exactement un des deux : `(business_id IS NULL) != (prospect_id IS NULL)`
- unicité :
  - `UNIQUE(business_id)` où non-null
  - `UNIQUE(prospect_id)` où non-null

### 2.2 Table `company_pagespeed_run` (historique PSI)
Colonnes :
- `run_id` (uuid)
- `business_id` (uuid, nullable)
- `prospect_id` (uuid, nullable)
- `strategy` (`mobile|desktop`)
- `performance_score` (integer 0..100, nullable)
- `accessibility_score` (integer 0..100, nullable)
- `seo_score` (integer 0..100, nullable)
- `best_practices_score` (integer 0..100, nullable)
- `raw_json` (text JSON, nullable)
- `fetched_at` (iso)

Index :
- `(business_id, fetched_at)`
- `(prospect_id, fetched_at)`
- `(strategy, accessibility_score)`

### 2.3 Table `commission_entry` (historique commissions)
Colonnes :
- `entry_id` (uuid)
- `month` (text `YYYY-MM`, required)
- `business_id` (uuid, nullable)
- `prospect_id` (uuid, nullable)
- `ca_eur` (integer, required)
- `rate_pct` (number/real, required)
- `charges_pct` (number/real, required)
- `commission_gross_eur` (integer, required)
- `charges_amount_eur` (integer, required)
- `commission_net_eur` (integer, required)
- `created_at` / `updated_at`

Règles :
- `business_id`/`prospect_id` optionnels pour permettre une entrée “globale” non rattachée.
- Pour éviter les doublons accidentels : `UNIQUE(month, business_id, prospect_id)` (avec `NULL` géré côté logique : on applique la règle au niveau applicatif).

---

## 3) Backend (API)

### 3.1 Backoffice (auth business)
Ajouter dans `backoffice.ts` :
- `GET /backoffice/:businessId/company_profile`
  - retourne le profil (crée implicitement si absent)
  - `website_url` peut être pré-remplie depuis `config_json.integrations.google_business_profile_url` si pertinent (sinon vide)
- `PATCH /backoffice/:businessId/company_profile`
  - champs autorisés : `website_url`, `legal_contact_email`, `headcount_range`, `naf_code`, `sector_label`, `website_created_at`, `website_redesign_at`
  - `annual_revenue_eur` non exposé ici

### 3.2 Interne (auth interne)
Créer un nouveau router `internalCompanies.ts` protégé par `requireInternalAuth`.

Endpoints :
- `GET /internal/companies`
  - retourne une liste unifiée :
    - clients `business` + prospects `prospect`
    - jointure éventuelle `company_profile`
    - dernière mesure PSI par strategy (mobile/desktop)
  - filtres :
    - `type=business|prospect|all`
    - `accessibility_lt=<number>` (utilise le **pire** score entre mobile et desktop si les deux existent)
    - `q=<string>` (nom / site / ville)
- `POST /internal/companies/:companyKey/pagespeed/run`
  - `companyKey` encode `business:<id>` ou `prospect:<id>`
  - récupère `website_url` (profil) sinon fallback :
    - prospect.website si présent
    - business : aucun fallback automatique (sinon erreur “missing website_url”)
  - appelle PSI (mobile+desktop) et insère 2 runs
- `POST /internal/companies/:companyKey/legal_email/scrape`
  - fetch du site + tentative découverte page mentions légales + extraction email
  - met à jour `company_profile.legal_contact_email` si trouvé

Commissions :
- `GET /internal/commissions?from=YYYY-MM&to=YYYY-MM`
  - retourne agrégations + lignes
- `POST /internal/commissions`
  - upsert d’une entrée (month + companyKey optionnel)
  - calcule et stocke les montants

---

## 4) Intégration PageSpeed Insights (tech)

### 4.1 Appel PSI
Endpoint :
`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=<url>&strategy=<mobile|desktop>`
- si `PAGESPEED_API_KEY` présent : ajouter `&key=...`
- gérer erreurs :
  - 4xx/5xx PSI : retourner 502 côté API interne
  - quota : surface error clair + status 429 si identifiable

Extraction scores :
- `lighthouseResult.categories.performance.score` etc (0..1) → convertir en `0..100` arrondi.

### 4.2 Accessibilité “< X”
Filtre interne calcule le “worst_accessibility” :
- si mobile+desktop existent : `min(mobile, desktop)`
- sinon : celui existant

---

## 5) Extraction email “mentions légales”

Approche robuste mais simple :
- télécharger la page d’accueil
- chercher un lien `<a>` dont `href` contient :
  - `mentions-legales`, `mentions_legales`, `legal`, `impressum`
- si trouvé, fetch cette page (même host) + extraire les emails via regex
- heuristique : prendre le premier email non “no-reply”, non image-only

Sécurité :
- réutiliser la logique anti-SSRF déjà utilisée dans `siteAudit` (allowlist host, interdit IP privées).

---

## 6) Frontend (UI)

### 6.1 Backoffice (artisan)
Dans `Settings` (ou un onglet “Entreprise”) :
- form :
  - effectifs (select)
  - secteur : NAF + libellé
  - site url
  - email mentions légales
  - dates (création/refonte)
- save via `PATCH /company_profile`

### 6.2 Interne (admin)
Ajouter 2 pages :
- `/internal/companies`
  - tableau unifié prospects + clients
  - colonne accessibilité (mobile/desktop + worst)
  - filtre accessibilité < X
  - boutons : “Refresh PSI”, “Scrape email”
- `/internal/commissions`
  - saisie : month, company (optionnel), CA, taux, charges%
  - affiche : brut, charges, net
  - tableau mensuel : total net + détail

---

## 7) Tests

Backend :
- tests routes internes :
  - `internal/companies` list + filtre accessibilité
  - run pagespeed : mock fetch PSI
  - scrape legal email : mock fetch HTML
  - commissions : calc + agrégation

Frontend :
- smoke tests `tsc --noEmit`
- tests vitest ciblés : rendu des nouveaux écrans et appels API mockés

