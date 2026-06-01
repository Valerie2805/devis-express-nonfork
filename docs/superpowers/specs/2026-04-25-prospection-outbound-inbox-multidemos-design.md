# Prospection Outbound + Inbox + Multi-démos — Design

**Contexte**
- Produit : DevisExpress (site public + backoffice)
- Cible : professionnels (artisans/TPE + petites PME)
- Hébergement : Vercel
- Objectif : ajouter un module de prospection **centralisé** (opéré par l’équipe DevisExpress, pas par les businesses) incluant sourcing, outreach email, inbox de réponses, et conversion en “business” (client).

---

## Objectifs

### Objectifs produit (V1)
- Découvrir des prospects (entreprises) via Google Places, les qualifier, les contacter par email.
- Centraliser les réponses dans une inbox interne.
- Suivre un pipeline de prospection (statuts, tags, notes, tâches).
- Convertir un prospect en “business” DevisExpress (création d’un business + pré-configuration + démo métier).
- Proposer 6 démos métiers prêtes à l’emploi pour maximiser la compréhension et la conversion.

### Non-objectifs (V1)
- Multicanal (SMS/WhatsApp) automatisé.
- Scoring “data heavy” (SIRENE/Pappers, détection tech stack, etc.) au-delà d’un scoring simple.
- Gestion fine d’opt-in marketing / consentement avancé (on garde un opt-out minimal + conformité opérationnelle).

---

## Architecture (haut niveau)

### Services externes
- **Google Places API** : sourcing de prospects.
- **Resend** : envoi email (outbound).
- **Mailgun** : réception email (inbound parse) + webhook HTTP vers Vercel.
- **Vercel Postgres (Neon)** : stockage (prospects, messages, pipeline, tâches, démos).
- **Vercel Blob** : stockage (si on décide de garder des pièces jointes, option V1.1).

### Composants internes
- API Express (serverless sur Vercel)
  - endpoints de prospection (admin-only)
  - endpoint inbound email (webhook Mailgun)
- UI backoffice (section “Prospection” + “Inbox”)
- Job runner (réutiliser l’infra existante de “tasks” si possible, sinon `prospect_task` dédié)

---

## Multi-démos (6 métiers)

### Métiers (V1)
- Plombier
- Serrurier
- Électricien
- Chauffagiste / Clim
- Vitrier
- Peintre / Rénov

### UX
- Landing : ajout d’un sélecteur “Voir la démo par métier”
- Chaque démo = un `business_id` dédié + site public + backoffice
  - Ex : `demo-plombier`, `demo-serrurier`, …

### Données
- Seeds DB : création/maintien des 6 businesses démo et du user `owner/demo` pour chacun.
- Contenus : config + copy + services + tarifs + zones cohérents par métier.

---

## Prospection centralisée (V1)

### Rôles & contrôle d’accès
- Le module est **centralisé** : seuls les admins DevisExpress y accèdent.
- Option technique : réutiliser `ADMIN_KEY` + endpoints `/api/v1/admin/*` ou introduire une authentification “staff interne” dédiée.
- V1 recommandée : endpoints sous `/api/v1/admin/prospection/*` protégés par `x-admin-key`.

### Pipeline
Statuts proposés :
- `new` (importé)
- `to_contact` (prêt à contacter)
- `contacted`
- `replied`
- `meeting_booked`
- `won` (converti / signé)
- `lost`
- `do_not_contact`

### Sourcing Google Places
Fonctions V1 :
- Recherche : query = métier + ville + rayon (km)
- Récupération des champs essentiels :
  - `place_id`, nom, catégories, adresse, lat/lng, téléphone, site, rating, reviews_count
- Import :
  - déduplication (place_id, puis fallback par phone/domaine)
  - mapping vers entité `prospect`

### Enrichissement (léger)
- Si `website` présent :
  - fetch HTML de la home et éventuellement `/contact`, `/mentions-legales`
  - extraction email(s) (regex + heuristiques)
  - stockage : `emails[]`, `enrichment_status`
- Limites : timeouts + max bytes + robots/UA prudent (V1 pragmatique).

---

## Email Outbound (Resend)

### Identité d’envoi
- `FROM` : adresse vérifiée (ex: `hello@devisexpress.fr`)
- `REPLY-TO` : alias unique par prospect (voir Inbox)

### Séquences
V1 :
- Séquence par défaut 3 étapes (J0, J+2, J+5)
- Conditions d’arrêt :
  - si réponse inbound reçue
  - si statut passe à `do_not_contact`, `lost`, `won`
- Tracking minimal :
  - `queued/sent/failed`
  - (V1.1) open/click si on ajoute tracking

### Templates
- Templates paramétrables avec variables (au minimum) :
  - `{{company_name}}`, `{{city}}`, `{{trade}}`, `{{demo_url}}`
- Versionnement des templates (pour itérations)

---

## Inbox (Mailgun inbound parse → Vercel webhook)

### Principe des alias par prospect
- Domaine inbound dédié, ex: `inbound.devisexpress.fr`
- Adresse par prospect :
  - `p_<prospectId>@inbound.devisexpress.fr`
- Tous les emails sortants utilisent :
  - `reply_to = p_<prospectId>@...`
  - `message-id` conservé pour thread si possible (V1 : thread par prospect suffit)

### Réception
- Mailgun reçoit via MX `inbound.*`
- Mailgun POST un webhook vers :
  - `POST /api/v1/admin/prospection/inbound-email`
- Sécurité :
  - validation de signature Mailgun (timestamp/token/signature)
  - rate limit spécifique inbound

### Parsing & stockage
À stocker :
- `from`, `to`, `subject`, `text`, `html` (si fourni), `stripped-text` (Mailgun), `message-id`, `in-reply-to`, `references`, `attachments` (V1.1)
Mapping :
- identification `prospectId` à partir de l’adresse `to`
Effets :
- création `prospect_message` inbound
- mise à jour statut prospect vers `replied` (si pas déjà won/lost/do_not_contact)
- arrêt des tâches de séquence en cours

---

## Modèle de données (proposition)

### Table `prospect`
- `prospect_id` (pk)
- `source` (`google_places` | `manual`)
- `place_id` (unique nullable)
- `name`
- `trade` (enum / string)
- `phone`
- `website`
- `emails_json`
- `address`
- `city`
- `lat`, `lng`
- `rating`, `reviews_count`
- `status`
- `tags_json`
- `notes`
- `created_at`, `updated_at`

### Table `prospect_message`
- `message_id` (pk)
- `prospect_id` (fk)
- `direction` (`outbound` | `inbound`)
- `provider` (`resend` | `mailgun`)
- `provider_message_id` (nullable)
- `from`, `to`, `subject`
- `text`, `html` (nullable)
- `headers_json` (nullable)
- `created_at`

### Table `prospect_sequence`
- `sequence_id` (pk)
- `name`
- `enabled`
- `steps_json` (ou table steps)
- `created_at`, `updated_at`

### Table `prospect_task`
- `task_id` (pk)
- `prospect_id` (fk)
- `kind` (`send_email_step` | `enrich` | etc.)
- `run_at`
- `payload_json`
- `status` (`queued` | `running` | `done` | `failed` | `canceled`)
- `attempts`, `last_error`
- `created_at`, `updated_at`

---

## Endpoints API (proposition)

Sous `/api/v1/admin/prospection/*` (admin-only) :
- `POST /search_places` (query, city, radius, filters) → résultats “non importés”
- `POST /import_places` → création prospects (dedup)
- `GET /prospects` (filtres, pagination)
- `GET /prospects/:id`
- `PATCH /prospects/:id` (status, tags, notes, assign)
- `POST /prospects/:id/enrich`
- `POST /prospects/:id/send` (send single email)
- `POST /prospects/:id/enroll_sequence`
- `GET /inbox` (threads)
- `GET /inbox/:prospectId` (messages)
- `POST /inbox/:prospectId/reply` (Resend send)
- `POST /inbound-email` (Mailgun webhook)

---

## Observabilité / erreurs
- Toute erreur inbound/outbound doit être capturée (pas de “Unhandled Rejection”).
- Logs structurés (niveau, request_id, route, message).
- Pour les erreurs externes (Places/Resend/Mailgun), stocker `last_error` et exposer dans l’UI.

---

## Configuration (env vars)

### Resend
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`

### Mailgun
- `MAILGUN_SIGNING_KEY`
- `MAILGUN_INBOUND_DOMAIN` (ex: `inbound.devisexpress.fr`)

### Google Places
- `GOOGLE_PLACES_API_KEY`

---

## Plan de livraison (itératif)

### V1 (valeur immédiate)
- Multi-démos (6)
- Import Places + fiche prospect
- Envoi Resend (email simple + séquence J0/J+2/J+5)
- Inbound webhook Mailgun → inbox + stop séquence

### V1.1 (améliorations)
- Pièces jointes inbound (store Blob)
- Tracking opens/clicks (si besoin)
- Enrichissement plus robuste (pages multiples, détection emails)

---

## Questions ouvertes (à valider avant implémentation)
- Choix exact des catégories Places par métier (mapping).
- Politique d’opt-out et messages légaux (anti-spam / conformité).
- Gestion multi-domaines (prod vs preview) pour inbound.

