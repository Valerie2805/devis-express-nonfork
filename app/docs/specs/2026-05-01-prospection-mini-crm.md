# Spec — Prospection “Mini CRM” (validation manuelle)

## Objectifs

- Transformer Prospection en mini-CRM actionnable : pipeline, relances, séquences, scoring.
- Préparer automatiquement les actions, mais exiger une validation utilisateur avant tout envoi (SMS/email).
- Rendre la recherche/import Places plus robuste via un diagnostic UI (causes + actions correctrices).

## Non-objectifs

- Envois automatiques sans validation utilisateur.
- Synchronisation externe CRM, enrichissement avancé (SIRET, scraping massif).
- Modification de l’écran “Demandes” (leads) pour devenir un annuaire d’entreprises.

## Périmètre fonctionnel

### 1) Recherche & import (Google Places)

- UI : champs séparés `métier`, `ville`, `département`, concaténés en query.
- Résultats Places : sélection multi + import.
- Diagnostic UI en cas d’erreur (voir section dédiée).

### 2) Prospects (mini CRM)

- Liste des prospects importés (business scoped).
- Filtres:
  - statut prospect (pipeline)
  - “avec téléphone”, “avec email”, “avec site web”
  - score (min/max ou tri)
  - texte libre (name/city/website)
- Détail prospect (panneau ou section) :
  - infos (tel, site, ville, rating/avis)
  - notes internes
  - historique des messages
  - actions : activer une séquence, préparer une relance, marquer “perdu/converti”

### 3) Séquences

- Une séquence définit des étapes (J0/J+2/J+7…) qui créent des tâches.
- Activation :
  - sur un prospect (1)
  - en bulk sur une sélection de prospects
- Les tâches créées sont en `pending_review` (à valider) avec un `run_at` calculé.

### 4) “Outbox” à valider

- Dans Prospection : vue/onglet “À valider”.
- Liste des tâches `pending_review`, triées par `run_at`.
- Validation utilisateur :
  - par tâche : “Envoyer maintenant”, “Planifier”, “Annuler”
  - par séquence : “Valider la séquence” (envoie les tâches dues / sélectionnées)
- Canal : choix au moment de valider (toggle SMS/email).

## Modèle de données

### État actuel (existant)

- `prospect` : fiche entreprise (source, place_id, coordonnées, etc.).
- `prospect_message` : journal des messages (direction/provider/from/to/subject/text/html).
- `prospect_sequence` : définition de séquences (`steps_json`).
- `prospect_task` : tâches planifiées (`run_at`, `payload_json`, `status`, `attempts`, `last_error`).
- `business_prospect` : lien multi-tenant business ↔ prospect.

### Évolutions proposées

#### Multi-tenant explicite

Pour éviter tout mélange entre businesses :

- Ajouter `business_id` sur :
  - `prospect_task`
  - `prospect_sequence`
  - `prospect_message`
- Indexer :
  - `(business_id, status, run_at)` sur tasks
  - `(business_id, prospect_id, created_at)` sur messages

#### Statuts

- `prospect.status` :
  - `new | contacted | follow_up | converted | lost`
- `prospect_task.status` :
  - `pending_review | approved | sent | failed | canceled`

#### Payload de task

Le payload doit permettre :
- de prévisualiser le message
- de choisir le canal au moment de valider

Exemple (indicatif) :

```json
{
  "kind": "send_message",
  "sequence_id": "seq_...",
  "step_id": "step_...",
  "templates": {
    "sms": { "template_id": "prospect_intro_sms", "variables": { "company": "..." } },
    "email": { "template_id": "prospect_intro_email", "variables": { "company": "..." } }
  }
}
```

## API (backoffice owner)

### Prospects

- `GET /backoffice/:businessId/prospection/prospects`
  - ajoute filtres et tri (statut/score/has_phone/has_email/has_website/q)
- `PATCH /backoffice/:businessId/prospection/prospects/:prospectId`
  - notes, statut prospect

### Séquences

- `GET /backoffice/:businessId/prospection/sequences`
- `POST /backoffice/:businessId/prospection/sequences`
- `PATCH /backoffice/:businessId/prospection/sequences/:sequenceId`
- `DELETE /backoffice/:businessId/prospection/sequences/:sequenceId`

### Tasks (validation)

- `GET /backoffice/:businessId/prospection/tasks`
  - filtres: status, sequence_id, prospect_id, due (run_at <= now)
- `POST /backoffice/:businessId/prospection/tasks/:taskId/approve`
  - body: `{ channel: "sms"|"email", send: true|false, run_at?: iso }`
  - si `send=true` : envoie immédiatement (et écrit `prospect_message`)
  - sinon : passe `approved` et conserve `run_at`
- `POST /backoffice/:businessId/prospection/sequences/:sequenceId/approve`
  - bulk approve/send sur toutes les tâches `pending_review` de la séquence (avec filtre “due only”)
- `POST /backoffice/:businessId/prospection/tasks/:taskId/cancel`

## Envoi (providers)

- SMS : via provider messaging existant (Twilio/noop).
- Email : via provider email existant (SMTP/noop).
- Les envois doivent journaliser dans `prospect_message` avec :
  - `direction=outbound`
  - `provider` (twilio/smtp/noop)
  - `provider_message_id` si dispo

## Diagnostic UI (Prospection)

### Déclenchement

- Si `searchError` existe : afficher un bloc “Diagnostic” sous l’erreur.
- Le bloc montre :
  - Cause probable (1 phrase)
  - Actions correctrices (2–4 bullets)
  - Bouton “Copier l’erreur technique”

### Mapping (exemples)

- Missing API key:
  - `Missing GOOGLE_PLACES_API_KEY`
  - Action: Vercel env vars + redeploy
- Key restrictions (server-side):
  - `not authorized to use this API key` / `empty referer`
  - Action: Google Cloud → API key → Application restrictions = None
- Billing/API non activée:
  - `REQUEST_DENIED` + mentions billing
  - Action: activer billing + activer Places API
- Quota:
  - `OVER_QUERY_LIMIT`
  - Action: augmenter quotas / attendre / limiter volume

## UX / écrans

### Prospection (page)

- Section Recherche/Import
- Section Diagnostics (conditionnelle)
- Section Résultats Places (sélection + import)
- Section Prospects (filtres + liste)
- Onglet “À valider” (tasks)

### Détail prospect (panneau)

- Infos (tel/email/site/rating)
- Notes
- Historique messages
- Actions: activer séquence, valider tâches prospect, statut

## Sécurité & permissions

- Prospection reste owner-only (menu + endpoints), sauf décision contraire.
- Toutes les queries doivent filtrer par `business_id`.
- Aucun secret (API keys) ne doit remonter au frontend.

## Tests (cibles)

- Server (vitest)
  - création séquence + génération tasks `pending_review`
  - approve task (sms/email) → écrit message + status `sent`
  - approve sequence (bulk)
- Front (vitest)
  - diagnostic UI : pour une erreur “not authorized/empty referer”, affiche actions correctrices
  - vue “À valider” : toggle canal + appel endpoint approve

