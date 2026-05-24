# Déployer DevisExpress sur Vercel (Vercel Postgres + Vercel Blob)

Ce guide explique comment déployer et configurer DevisExpress sur Vercel avec :
- Vercel Postgres (intégration Neon)
- Vercel Blob (stockage fichiers)

## Pré-requis

- Un repo GitHub contenant ce projet
- Un projet Vercel
- Vercel Storage : Postgres + Blob
- (Optionnel) Un domaine (ex: `app.example.com`)
- (Optionnel) Twilio / SMTP / Sentry

## 1) Importer le repo dans Vercel

1. Vercel Dashboard → **Add New… → Project**
2. Sélectionner le repo GitHub
3. **Root Directory** : `app`
4. Framework preset : laisser Vercel détecter automatiquement (Vite)
5. Build Command : `npm run build`
6. Output Directory : `dist`
7. Node.js Version : **22.x** (recommandé)

Notes :
- Ce projet utilise `better-sqlite3` en dev (SQLite) : éviter Node 24/25+ qui peut casser les bindings natifs.
- En prod sur Vercel, utiliser Postgres (cf. section 2).

Déploiements :
- **Production** : la branche `main` (ou ta branche prod)
- **Preview** : toutes les PR (automatique)

## 2) Configurer Vercel Postgres (DATABASE_URL)

L’app utilise Postgres via `DATABASE_URL` (pas de SDK spécifique).

Dans Vercel :
1. Project → **Storage → Postgres** (Neon)
2. Créer / connecter une base
3. Vérifier que Vercel a injecté `DATABASE_URL` (dans Environment Variables)

Important :
- Sur Vercel, le filesystem est en lecture seule : **SQLite n’est pas supporté** en prod. Utiliser `DB_DRIVER=postgres`.

Notes :
- Sur le plan Hobby, la base Postgres est soumise à des quotas (compute/storage). Quand tu dépasses, ça se bloque jusqu’au reset du cycle.

## 3) Variables d’environnement (Vercel)

Vercel → Project → **Settings → Environment Variables**.

Créer ces variables en **Production** (et aussi en **Preview** si tu veux tester sur les URLs de preview).

### Obligatoires (prod)

- `NODE_ENV=production`
- `DB_DRIVER=postgres`
- `DATABASE_URL=...` (injecté par Vercel Postgres)
- `JWT_SECRET=...` (string long aléatoire, min 32 chars)
- `FILE_STORAGE=vercel_blob`
- `SEED_DEMO=true` (pour valider le déploiement avec `demo-business`, puis passer à `false` ensuite)

Secrets :
- `JWT_SECRET` : secret JWT (ne jamais commiter, uniquement dans Vercel)
- `BLOB_READ_WRITE_TOKEN` : token Vercel Blob (injecté par Vercel)

### Recommandées (prod)

- `APP_URL=https://<ton-domaine>` (utilisé pour générer les liens email, ex reset password)
- `CORS_ORIGINS=https://<ton-domaine>` (recommandé)
- `ADMIN_KEY=...` (clé admin `/api/v1/admin/*`)
- `GOOGLE_PLACES_API_KEY=...` (si prospection activée)
- `RESEND_API_KEY=...` + `RESEND_FROM_EMAIL=...`
- `MAILGUN_SIGNING_KEY=...` + `MAILGUN_INBOUND_DOMAIN=...`

### Cron (Vercel Cron)

Recommandé :
- `CRON_SECRET=...` (string aléatoire)

Optionnel (fallback pour appels manuels) :
- `CRON_KEY=...`

### Vercel Blob

- `BLOB_READ_WRITE_TOKEN=...`
- `FILE_STORAGE=vercel_blob`

Le token est généralement créé automatiquement quand tu ajoutes Vercel Blob au projet.

### Générer des secrets

Exemples (à exécuter en local, puis copier dans Vercel → Environment Variables) :

```bash
openssl rand -hex 32  # JWT_SECRET
openssl rand -hex 32  # ADMIN_KEY / CRON_SECRET (ou plus long)
```

### RGPD / rétention

- `RETENTION_DAYS=...` (fallback global)
- `RETENTION_MODE=anonymize` (recommandé) ou `delete`

### Email (reset password)

- `EMAIL_PROVIDER=smtp`
- `EMAIL_FROM=...`
- `SMTP_HOST=...`
- `SMTP_PORT=...`
- `SMTP_USER=...`
- `SMTP_PASS=...`

### Twilio (SMS/WhatsApp)

- `MESSAGE_PROVIDER=twilio`
- `TWILIO_ACCOUNT_SID=...`
- `TWILIO_AUTH_TOKEN=...`
- `TWILIO_FROM_SMS=...`
- `TWILIO_FROM_WHATSAPP=...` (si WhatsApp)
- `TWILIO_SKIP_SIGNATURE=false`

### IA (optionnel)

Par défaut, l’audit fonctionne en mode rules. Si tu actives l’IA :

- `AI_PROVIDER=openai_compatible`
- `AI_API_KEY=...`
- `AI_MODEL=...`
- `AI_BASE_URL=...` (optionnel)

### Paramètres audit (optionnel)

- `PUBLIC_AUDIT_TTL_DAYS=30` (TTL du lien public)
- `AUDIT_FETCH_TIMEOUT_MS=8000` (timeout crawl)
- `AUDIT_FETCH_MAX_BYTES=500000` (taille max HTML)

### Sentry (optionnel)

- `SENTRY_DSN=...`
- `SENTRY_ENVIRONMENT=production`

## 4) Cron jobs (automatique via vercel.json)

Le projet contient déjà une configuration cron Vercel dans [vercel.json](file:///workspace/app/vercel.json).

Elle déclenche :
- Automations (séquences) : `/api/v1/admin/cron/automation`
- Rétention RGPD : `/api/v1/admin/cron/retention`
- Cleanup assets : `/api/v1/admin/cron/cleanup_assets`
- Cleanup site audits : `/api/v1/admin/cron/cleanup_site_audits`

Sécurisation :
- Vercel enverra `Authorization: Bearer <CRON_SECRET>` automatiquement si `CRON_SECRET` est défini.
- Les endpoints supportent aussi `x-cron-key` / `?key=` si tu utilises `CRON_KEY`.

## 5) Domaines

Vercel → Project → **Settings → Domains**

- Ajouter ton domaine (ex: `app.example.com`)
- Configurer les DNS selon les instructions Vercel

Ensuite :
- Mettre à jour `APP_URL` et `CORS_ORIGINS` avec le domaine final.

## 6) Migrations / seed

Les migrations s’exécutent automatiquement au runtime au premier accès DB.

Après un déploiement, faire un warm-up (smoke) pour forcer l’initialisation :

- `GET https://<ton-domaine>/api/v1/site/<businessId>/config`
- ou `POST https://<ton-domaine>/api/v1/backoffice/<businessId>/login`

Si tu vois `relation "business" does not exist` :
- Les migrations n’ont pas pu s’exécuter (souvent un souci de config Postgres ou un déploiement qui n’inclut pas `server/migrations`).
- Vérifier `DB_DRIVER=postgres` + `DATABASE_URL` + redeploy.

## 7) Smoke tests post-déploiement

### Vérifier le site et l’API

- Site public : `https://<ton-domaine>/site/<businessId>`
- API config : `GET https://<ton-domaine>/api/v1/site/<businessId>/config`

### Vérifier le backoffice

- Login : `https://<ton-domaine>/backoffice/<businessId>/login`
- Stats : `https://<ton-domaine>/backoffice/<businessId>/stats`

### Vérifier Audit IA

- Backoffice : `https://<ton-domaine>/backoffice/<businessId>/site-audits`
- Créer un audit → vérifier :
  - HTML public : `GET /api/v1/public/site_audits/:auditId/html?t=...`
  - DOCX : `GET /api/v1/public/site_audits/:auditId/docx?t=...`
  - JSON : `GET /api/v1/public/site_audits/:auditId/json?t=...`

### Vérifier les crons (manuel)

Depuis un terminal, tu peux tester un cron manuellement :

- Avec `CRON_SECRET` :

```bash
curl -X POST "https://<ton-domaine>/api/v1/admin/cron/automation?limit=5" \
  -H "Authorization: Bearer $CRON_SECRET"
```

- Ou avec `CRON_KEY` :

```bash
curl -X POST "https://<ton-domaine>/api/v1/admin/cron/automation?limit=5&key=$CRON_KEY"
```

## 8) Troubleshooting rapide

- **“Chargement…” infini sur le site** : ouvrir `/api/v1/site/<businessId>/config` et corriger l’erreur côté API.
- **500 sur l’API** : vérifier `DATABASE_URL` + `DB_DRIVER=postgres` + redeploy après changement d’env vars.
- **Erreur SQLite sur Vercel** (`mkdir /var/task/...` / FS read-only) : `DB_DRIVER` est resté en `sqlite` (mettre `postgres`).
- **ENOENT sur `machine-a-devis/content/...yml`** : activer **Build and Deployment → Root Directory → Include files outside root directory** (doit inclure le dossier `machine-a-devis`).
- **Cron 401** : `CRON_SECRET` manquant/mauvais (ou `CRON_KEY` incorrect).
- **Assets manquants après redeploy** : vérifier `FILE_STORAGE=vercel_blob` + Blob activé.
- **Reset password ne part pas** : vérifier SMTP (`EMAIL_PROVIDER=smtp` + creds).
- **Twilio webhooks refusés** : vérifier `TWILIO_AUTH_TOKEN` et `TWILIO_SKIP_SIGNATURE=false`.
