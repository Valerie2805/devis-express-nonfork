# Plan d’implémentation — Prospection “Mini CRM” (validation manuelle)

## Pré-requis

- La spec est validée : [2026-05-01-prospection-mini-crm.md](file:///Users/b.delb/Documents/trae_projects/devis-express/app/docs/specs/2026-05-01-prospection-mini-crm.md)
- Les routes Prospection existantes (Places + import + liste) restent compatibles.

## Étape 1 — Migration DB (multi-tenant + statuts)

1. Ajouter `business_id` sur :
   - `prospect_task`
   - `prospect_sequence`
   - `prospect_message`
2. Ajouter / standardiser les statuts :
   - `prospect.status` (valeurs proposées) + index (optionnel)
   - `prospect_task.status` + index `(business_id, status, run_at)`
3. Adapter les indexes existants pour inclure `business_id` là où nécessaire.
4. Migration idempotente + test migrate.

## Étape 2 — Modèle & services serveur (prospection)

1. Créer un petit module `server/prospection/miniCrm.ts` (ou équivalent) :
   - CRUD sequences (business-scoped)
   - Génération de tasks `pending_review` lors de l’activation d’une séquence
   - Approve task (validation + envoi immédiat)
   - Approve sequence (bulk)
   - Cancel task
2. Définir un format `payload_json` stable (templates sms/email + variables).

## Étape 3 — Endpoints backoffice (owner)

Ajouter dans `server/routes/v1/backoffice.ts` :

- Prospects
  - `PATCH /backoffice/:businessId/prospection/prospects/:prospectId` (notes + status)
  - Étendre `GET /prospects` (filtres/tri)
- Sequences (business scoped)
  - `GET /prospection/sequences`
  - `POST /prospection/sequences`
  - `PATCH /prospection/sequences/:sequenceId`
  - `DELETE /prospection/sequences/:sequenceId`
- Tasks
  - `GET /prospection/tasks`
  - `POST /prospection/tasks/:taskId/approve`
  - `POST /prospection/tasks/:taskId/cancel`
  - `POST /prospection/sequences/:sequenceId/approve` (bulk)

## Étape 4 — Envoi (providers) + journal

1. Implémenter l’envoi email (via provider existant) + SMS (provider messaging existant).
2. Enregistrer `prospect_message` (business_id + prospect_id + provider + outbound + contenu).
3. Mettre à jour `prospect.status` automatiquement :
   - quand un message sortant est envoyé → `contacted`

## Étape 5 — UI Prospection

1. Diagnostic UI Places
   - Mapper les erreurs connues vers “cause + actions”
   - Bouton “Copier l’erreur technique”
2. “Prospects” enrichi
   - filtres (status, has_phone, has_email, has_website, score, q)
   - panneau détail prospect (notes + historique + actions)
3. Vue “À valider”
   - liste `pending_review`
   - toggle SMS/email
   - “Envoyer maintenant”, “Planifier”, “Annuler”
   - bulk “Envoyer sélection”
4. Actions “par séquence”
   - valider une séquence (bulk)
   - valider toutes les tâches du prospect

## Étape 6 — Tests

- Server
  - tests routes sequences/tasks (happy paths + erreurs)
  - validation sms/email : écrit `prospect_message` + status `sent`
  - bulk approve : n’envoie que les tasks `pending_review`
- Front
  - diagnostic UI (erreur “not authorized / empty referer”)
  - vue “À valider” : toggle + call approve

## Étape 7 — Vérification finale

- `npm run check`
- `npx vitest run src`
- `npx vitest run server --maxWorkers=1`

