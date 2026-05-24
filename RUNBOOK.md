# RUNBOOK — Déploiement “DevisExpress”

Ce document décrit les étapes opérationnelles pour déployer, configurer et opérer l’application (site public + API + backoffice).

## Architecture (résumé)

- Frontend (Vite/React) : sert le site public + backoffice.
- Backend (Express) : routes sous `/api/v1/*`.
- Base de données : SQLite (dev) ou Postgres (prod) — Supabase est supporté via `DB_DRIVER=postgres`.
- Stockage fichiers : local (dev) ou Vercel Blob (prod recommandé sur Vercel) ou S3.
- Messaging : noop (dev) ou Twilio (prod).
- Email : noop (dev) ou SMTP (prod).
- Cron : endpoints protégés par clé (`CRON_KEY`) à déclencher via un scheduler (Vercel Cron, GitHub Actions, autre).

## Pré-requis

- Node.js (version conforme à l’environnement Vercel/CI)
- Accès à :
  - une DB Postgres (Supabase)
  - un store Blob Vercel (recommandé sur Vercel) ou un bucket S3 (optionnel)
  - un compte Twilio (SMS/WhatsApp si utilisé)
  - un SMTP sortant (ou provider email)
  - Sentry (optionnel)

## Convention de déploiement

Recommandé :
- Code sur GitHub.
- Déployer sur Vercel (frontend + API serverless via `app/api/index.ts`) connecté au repo GitHub.
- DB sur Supabase.
- Stockage fichiers sur Vercel Blob.

## GitHub → Vercel (flux de déploiement)

- Créer un repo GitHub et pousser le code.
- Dans Vercel, importer le repo (Import Project).
- Root Directory : `app`.
- Branches :
  - Production : `main` (ou la branche de prod)
  - Preview : toutes les PR (déploiements automatiques)
- Renseigner les env vars en distinguant `Production` / `Preview` si nécessaire.
- CI recommandé : GitHub Actions (workflow [ci.yml](file:///workspace/app/.github/workflows/ci.yml)) exécute `npm run check` + `npm run test:api` sur push/PR.

## Variables d’environnement (prod)

### Core

- `NODE_ENV=production`
- `CORS_ORIGINS` : CSV des origines autorisées (ex: `https://app.example.com,https://www.example.com`)
- `APP_URL` : URL du frontend (utilisée dans les emails reset password), ex: `https://app.example.com`

### DB

- `DB_DRIVER=postgres`
- `DATABASE_URL` : URL Postgres (Supabase)

### Auth / sécurité

- `JWT_SECRET` : secret JWT long et aléatoire
- `ADMIN_KEY` : clé admin pour routes `/api/v1/admin/*`
- `CRON_SECRET` : secret cron Vercel (env var) envoyé automatiquement en header `Authorization: Bearer ...` lors des invocations
- `CRON_KEY` : clé cron alternative pour invocations manuelles (header `x-cron-key` ou `?key=`), optionnel si `CRON_SECRET` est en place

### Email

- `EMAIL_PROVIDER=smtp`
- `EMAIL_FROM` : ex: `noreply@example.com`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`

### Messaging / Twilio

- `MESSAGE_PROVIDER=twilio`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_SMS`
- `TWILIO_FROM_WHATSAPP` (si WhatsApp)

Webhooks :
- `TWILIO_SKIP_SIGNATURE=false` (dev uniquement si true)

### S3 (stockage fichiers)

- `FILE_STORAGE=s3`
- `S3_BUCKET`
- `S3_REGION`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`

Optionnels :
- `S3_ENDPOINT` (S3 compatible)
- `S3_FORCE_PATH_STYLE=true|false`
- `S3_PUBLIC_BASE_URL` (si URL publique custom)

### Vercel Blob (stockage fichiers)

- `FILE_STORAGE=vercel_blob`
- `BLOB_READ_WRITE_TOKEN`

### RGPD / rétention

- `RETENTION_DAYS` : fallback global (si un business n’a pas `settings.retention_days`)
- `RETENTION_MODE=anonymize|delete` (recommandé : `anonymize`)

### Sentry (optionnel)

- `SENTRY_DSN`
- `SENTRY_ENVIRONMENT`
- `SENTRY_RELEASE`
- `SENTRY_TRACES_SAMPLE_RATE`

### Mode démo (recommandations prod)

Par défaut le projet seede des données démo, mais en prod il est recommandé de désactiver :
- `SEED_DEMO=false`
- `VITE_DEMO_MODE=false`

## Préparation DB Postgres (Supabase)

### 1) Provisionner la DB

- Créer un projet Supabase.
- Récupérer une chaîne de connexion Postgres :
  - Recommandé sur Vercel (serverless) : utiliser le **pooler** Supabase (Transaction mode) si disponible.
  - Ajouter `sslmode=require` si nécessaire (selon l’URL fournie).
- Renseigner `DB_DRIVER=postgres` + `DATABASE_URL` dans Vercel (Production/Preview).

### 2) Migrations

Les migrations s’exécutent au runtime via `runMigrations(db)` au premier accès DB.

Recommandation opérationnelle :
- Prévoir un “warm-up” post-deploy (smoke test) qui hit une route simple pour forcer la migration.

Exemples de routes qui touchent la DB :
- `GET /api/v1/site/<businessId>/config`
- `POST /api/v1/backoffice/<businessId>/login`

### Notes Supabase (prod)

- L’app n’utilise pas le SDK Supabase : elle se connecte uniquement à Postgres via `DATABASE_URL`.
- Les features Supabase (RLS, policies) ne sont pas utilisées ici : l’accès DB est “server-side only”.
- En environnement serverless, privilégier un pooler / PgBouncer pour éviter d’épuiser les connexions.

## Provisionnement S3

### 1) Bucket

- Créer un bucket (ex: `mad-prod-uploads`)
- Activer un mode d’accès public si l’app doit afficher les images publiquement via URL (sinon fournir une URL publique via CDN).

### 2) Permissions IAM minimales

Le service a besoin a minima :
- `s3:PutObject`
- `s3:DeleteObject`

Note : `ListBucket` n’est pas requis par le code actuel.

### 3) Vérification

Endpoint upload public (site) :
- `POST /api/v1/site/:businessId/assets` (multipart `file`)

## Provisionnement Twilio

### 1) Sender

- Configurer un numéro / sender ID pour SMS (`TWILIO_FROM_SMS`)
- Configurer WhatsApp si nécessaire (`TWILIO_FROM_WHATSAPP`)

### 2) Webhooks

Configurer dans Twilio :
- Status callback : `POST https://<host>/api/v1/twilio/status`
- Inbound messages : `POST https://<host>/api/v1/twilio/inbound`

La signature est vérifiée via `TWILIO_AUTH_TOKEN` (ne pas activer `TWILIO_SKIP_SIGNATURE` en prod).

## Déploiement Vercel

### 1) Créer le projet

- Importer le repo dans Vercel
- Root Directory : `app`
- Ajouter les env vars ci-dessus (prod + preview si besoin)

### 2) Build

La build front est `npm run build`.

### 3) API Serverless

Vercel utilise `app/api/index.ts` comme handler.

### 4) Post-deploy (smoke)

Après un déploiement, exécuter un smoke test manuel :

- Site config :
  - `GET https://<host>/api/v1/site/<businessId>/config`
- Login backoffice (si un business existe) :
  - `POST https://<host>/api/v1/backoffice/<businessId>/login`

## Cron (Vercel Cron ou autre)

Tous les endpoints cron sont protégés par `CRON_KEY` :

### 1) Rétention RGPD

- Endpoint : `POST /api/v1/admin/cron/retention`
- Périodicité recommandée : 1×/jour
- Mode :
  - `RETENTION_MODE=anonymize` (recommandé) : anonymise + status `deleted`
  - `RETENTION_MODE=delete` : suppression DB (et suppression assets tracés)

### 2) Nettoyage assets orphelins

- Endpoint : `POST /api/v1/admin/cron/cleanup_assets?dry_run=true|false&limit=200&business_id=...`
- Périodicité recommandée : 1×/jour
- Recommandation : exécuter un dry-run en monitoring avant d’activer en “delete” permanent.

### 3) Automations (séquences + tâches différées)

- Endpoint : `POST /api/v1/admin/cron/automation?limit=200&business_id=...`
- Périodicité recommandée :
  - Vercel Hobby : 1×/jour (limite Vercel)
  - Vercel Pro : toutes les 1–5 minutes
- Rôle : exécute les `lead_task` arrivées à échéance (ex: envoi de relance SMS) en respectant consentements + opt-out.

## Exploitation (opérations courantes)

### Créer un business (admin)

Endpoint :
- `POST /api/v1/admin/businesses` avec header `x-admin-key: <ADMIN_KEY>`

### Purge manuelle de leads (admin)

Endpoint :
- `POST /api/v1/admin/purge_leads` avec header `x-admin-key: <ADMIN_KEY>` et body `{ "days": 30 }`

### Export CSV (RBAC)

Endpoint :
- `GET /api/v1/backoffice/:businessId/leads/export`

Accès :
- `owner` toujours
- `staff` si `config.settings.staff_permissions.export_leads=true`

### Paramètres RBAC staff (owner)

Dans le business config JSON :

```json
{
  "settings": {
    "staff_permissions": {
      "export_leads": true,
      "settings_write": false,
      "proof_write": false,
      "lead_anonymize": false
    }
  }
}
```

## Backups

### Backup JSON (outil)

Commande :

```bash
npm run db:backup > backup.json
```

### Restore JSON (outil)

Commande :

```bash
RESTORE_ALLOW=true npm run db:restore -- backup.json
```

Notes :
- Le restore fait des inserts idempotents (ignore en cas de conflit).
- En prod Postgres, préférer un processus de restore hors application si besoin (selon politique d’exploitation).

## Tests / validation

### Smoke tests automatisés

Commande :

```bash
npm run test:api
```

Ce test exécute un serveur temporaire et vérifie :
- login owner/demo (avec seed)
- RBAC export (staff autorisé par permission)
- settings write interdit par défaut au staff
- retention cron via `settings.retention_days`
- resend MFA (rate limit + compteur)

## Troubleshooting

### “Invalid credentials” sur la démo

- Vérifier que la DB a été seedée :
  - `SEED_DEMO=true` (ou ne pas avoir `SEED_DEMO=false`)
- Relancer :
  - `npm run db:migrate`

### Erreurs Twilio “Unauthorized”

- `TWILIO_AUTH_TOKEN` absent ou incorrect
- URL de webhook incorrecte (host/proto)
- Si proxy/CDN, vérifier `x-forwarded-proto` et `x-forwarded-host`

### Uploads S3 non accessibles

- Vérifier `S3_PUBLIC_BASE_URL` ou la policy de lecture du bucket/CDN.
- Vérifier que les URLs générées sont atteignables publiquement si le front les affiche directement.

### Cron renvoie 401

- `CRON_KEY` manquant, ou mauvais `key=...` / header `x-cron-key`.

## Sécurité (check rapide)

- Ne jamais utiliser `dev-secret`, `dev-admin` ou clés triviales en prod.
- Garder `TWILIO_SKIP_SIGNATURE=false` en prod.
- Désactiver la démo en prod si l’environnement n’est pas explicitement une instance “demo”.
