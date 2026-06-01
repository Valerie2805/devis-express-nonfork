# Fichier global “prospects + leads” — Mode opératoire (utilisateur interne)

Ce guide explique **comment produire un fichier exploitable** (CSV/Excel) qui mélange :
- des **prospects** (prospection sortante)
- des **leads** (demandes entrantes via site public)

Sans parler technique : uniquement le “quoi cliquer / quoi remplir / quoi exporter”.

## 1) Comprendre les 2 sources (en 30 secondes)

- **Prospects** : entreprises ciblées avant contact (Google Places / import / inbox interne).
  - Objectif : constituer un vivier, faire de l’outbound (email), enrichir (site, PageSpeed…).
- **Leads** : demandes entrantes qualifiées via le formulaire public (devis).
  - Objectif : rappeler, qualifier, planifier un RDV, transformer en client.

Ton “fichier global” va donc être la **fusion de 2 exports**.

## 2) Étape A — Constituer le fichier “Prospects”

### 2.1 Importer des prospects (si tu n’en as pas)

**Qui ?** Prospection

1. Ouvre l’espace **Interne**.
2. Clique l’onglet **Prospection**.
3. Dans la recherche, saisis métier + ville.
4. Lance la recherche.
5. Sélectionne les résultats pertinents.
6. Clique **Importer**.

Bonnes pratiques :
- fais des imports par zone géographique / métier pour garder une base propre
- évite les imports trop larges (beaucoup de doublons potentiels)

### 2.2 Enrichir les prospects (recommandé avant export)

**Qui ?** Prospection

1. Interne → onglet **Entreprises**.
2. Filtre “Prospects”.
3. Pour les entreprises importantes :
   - clique l’action **PageSpeed**
   - clique l’action **Scrape email légal**

### 2.3 Exporter les prospects

Le projet n’a pas encore un bouton “Export prospects” dédié.
La méthode opérationnelle la plus simple est :

**Qui ?** Prospection / Manager

1. Interne → onglet **Entreprises**.
2. Filtre “Prospects” (+ recherche si nécessaire).
3. Clique **Export CSV**.
4. Renomme le fichier téléchargé en `prospects.csv`.

Si tu veux un fichier “commercial” :
- garde uniquement les colonnes utiles (nom, ville, site, contact, PageSpeed…)
- supprime les colonnes techniques (IDs) si ton CRM n’en a pas besoin

## 3) Étape B — Constituer le fichier “Leads” (demandes entrantes)

### 3.1 Vérifier que tu reçois bien des leads

**Qui ?** Sales / Ops / Manager

1. Ouvre le **Backoffice** du business.
2. Dans le menu de gauche, clique **Demandes**.
3. Vérifie que des demandes apparaissent dans la liste.

Si la liste est vide :
- fais une demande “test” sur le **site public** (bouton **Devis**) puis reviens sur **Demandes**

### 3.2 Filtrer les leads avant export (conseillé)

**Qui ?** Sales / Manager

Dans Backoffice → **Demandes** :
1. Filtre par **statut** (ex: `qualified` / `needs_followup`).
2. Filtre par **période** (ex: 7 derniers jours / mois en cours).
3. Filtre par **tag** si tu fais un tri “commercial” (ex: urgences, zone, etc.).
4. Utilise **Rechercher…** pour retrouver une demande spécifique.

### 3.3 Exporter les leads

**Qui ?** Sales / Manager

1. Backoffice → **Demandes**.
2. Clique **Exporter CSV** (en haut de la page).
3. Renomme le fichier téléchargé en `leads.csv`.

Bonnes pratiques :
- fais un export par période (hebdo/mensuel) pour garder des fichiers gérables
- exporte séparément `qualified` vs `lost` si tu veux piloter ta conversion

## 4) Étape C — Fusionner “prospects + leads” dans un fichier global

Comme prospects et leads n’ont pas exactement les mêmes champs, le plus simple est de standardiser un fichier cible.

### 4.1 Outil recommandé

- Google Sheets (simple)
- Excel (si tu as des volumes importants)

### 4.2 Créer une structure commune (colonnes standard)

Crée un fichier `fichier_global.xlsx` avec ces colonnes “pivot” (exemple) :

- `type` (valeur : `prospect` ou `lead`)
- `nom` (entreprise pour prospects / prénom pour leads — ou sépare en 2 colonnes)
- `phone`
- `email`
- `ville`
- `code_postal`
- `site_web`
- `statut` (statut lead, ou statut prospection si tu en suis un)
- `source` (valeurs possibles : `google_places`, `site_public`, etc.)
- `notes`

### 4.3 Importer les 2 CSV et mapper les colonnes

1. Onglet 1 : importe `prospects.csv`.
2. Onglet 2 : importe `leads.csv`.
3. Onglet 3 : “Global” :
   - copie/colle les lignes des 2 onglets
   - complète la colonne `type`
   - mappe les champs vers les colonnes standard

Astuce :
- si tu utilises un CRM, crée directement ces colonnes au format attendu par ton CRM.

## 5) Contrôles qualité (avant d’envoyer au CRM)

### 5.1 Doublons

Dans l’onglet “Global” :
- dédoublonne par `phone` (le plus fiable)
- puis par `email`
- puis par `site_web`

### 5.2 Conformité (opt-in)

Pour les leads :
- si tu fais du SMS/WhatsApp, ne contacte que les personnes qui ont accepté (opt-in).

Pour les prospects :
- attention à la conformité (RGPD) si tu fais de l’outbound.

## 6) Résultat attendu

Tu obtiens un fichier unique :
- exploitable par ton équipe (tri, priorisation)
- importable dans un CRM
- mélangeant “pipeline inbound” (leads) et “pipeline outbound” (prospects)

Si tu veux, je peux ajouter :
- une “recette” par usage (ex : fichier pour campagne SMS, fichier pour campagne email, fichier pour suivi commercial)
- une version “one-click” (feature produit) : export global directement depuis l’app
