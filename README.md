# DevisExpress (Site + Backoffice)

Monorepo applicatif :
- Frontend : React + Vite dans `app/src`
- Backend : Express dans `app/api` (monté sous `/api/v1`)

## Démarrage rapide

```bash
nvm use
npm i
npm run db:migrate
npm run dev
```

- Front : http://localhost:5173
- API : http://localhost:3001

Pré-requis :
- Node.js 22 (recommandé) ou 20/22. Éviter Node 25+ (incompatible avec better-sqlite3).

Mode démo (par défaut) :
- Données démo + credentials :
  - `owner / demo` (owner)
  - `emilie / demo` (staff)
- Backoffice démo : http://localhost:5173/backoffice/demo-business/login
- Désactiver les seeds : `SEED_DEMO=false`
- Désactiver l’UI démo : `VITE_DEMO_MODE=false`

## Scripts

- `npm run dev` : client + server
- `npm run check` : TypeScript (noEmit)
- `npm run test:api` : smoke tests API (login, RBAC, 2FA resend, retention cron)
- `npm run db:migrate` : migrations + seed démo (par défaut hors prod)
- `npm run db:backup` : backup JSON sur stdout
- `RESTORE_ALLOW=true npm run db:restore -- <backup.json>` : restore JSON idempotent

## Architecture API

Routes principales :
- Site public : `/api/v1/site/:businessId/*` ([site.ts](file:///workspace/app/api/routes/v1/site.ts))
- Backoffice : `/api/v1/backoffice/:businessId/*` ([backoffice.ts](file:///workspace/app/api/routes/v1/backoffice.ts))
- Auth : `/api/v1/backoffice/:businessId/login` + reset password + 2FA ([auth.ts](file:///workspace/app/api/routes/v1/auth.ts))
- Admin (protégé clé) : `/api/v1/admin/*` ([admin.ts](file:///workspace/app/api/routes/v1/admin.ts))
- Webhooks Twilio : `/api/v1/twilio/*` ([twilio.ts](file:///workspace/app/api/routes/v1/twilio.ts))

Fichiers uploadés en local :
- Servis depuis `/api/uploads/*` ([app.ts](file:///workspace/app/api/app.ts))

## Variables d’environnement

### Base
- `NODE_ENV`
- `CORS_ORIGINS` : liste séparée par virgules (optionnel)
- `APP_URL` : base URL front, utilisée dans les emails (ex: `https://app.example.com`)

### Base de données
- `DB_DRIVER=sqlite|postgres` (défaut `sqlite`)
- `DATABASE_URL` (obligatoire si `DB_DRIVER=postgres`, ex: Supabase)
- `SEED_DEMO=true|false` (défaut: true)

### Mode démo (frontend)
- `VITE_DEMO_MODE=true|false` (défaut: true) : affiche le texte “Démo” + pré-remplit owner/demo côté UI.

### Auth / sécurité
- `JWT_SECRET` (recommandé en prod)
- `ADMIN_KEY` (clé admin pour `/api/v1/admin/*`)
- `CRON_KEY` (clé cron pour endpoints cron)

### Email (reset password)
- `EMAIL_PROVIDER=noop|smtp` (défaut `noop`)
- `EMAIL_FROM` (smtp)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` (smtp)

Debug dev :
- `EMAIL_PROVIDER=noop` : loggue l’email dans les logs (sans envoi)

### Messaging (SMS/WhatsApp)
- `MESSAGE_PROVIDER=noop|twilio` (défaut `noop`)

Twilio (si `MESSAGE_PROVIDER=twilio`) :
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_SMS`
- `TWILIO_FROM_WHATSAPP` (si WhatsApp)

Webhooks Twilio :
- `TWILIO_SKIP_SIGNATURE=true` (dev uniquement) pour bypass la signature

Debug dev :
- `NOOP_MESSAGE_ECHO=true` (dev) : affiche les messages envoyés par le provider noop (utile pour 2FA)

### Stockage fichiers

- `FILE_STORAGE=local|vercel_blob|s3` (défaut `local`)

Vercel Blob (recommandé sur Vercel) :
- `BLOB_READ_WRITE_TOKEN` (créé automatiquement quand tu ajoutes un Blob store dans Vercel)

S3 (optionnel) :
- `S3_BUCKET`, `S3_REGION`
- `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`
- `S3_ENDPOINT` (optionnel, S3 compatible)
- `S3_FORCE_PATH_STYLE=true|false` (optionnel)
- `S3_PUBLIC_BASE_URL` (optionnel)

### Sentry (optionnel)
- `SENTRY_DSN`
- `SENTRY_ENVIRONMENT`
- `SENTRY_RELEASE`
- `SENTRY_TRACES_SAMPLE_RATE`

## Backoffice : endpoints clés

Login / reset / 2FA :
- `POST /api/v1/backoffice/:businessId/login` → `{ token }` ou `{ mfa_required, challenge_id }`
- `POST /api/v1/backoffice/:businessId/login/verify_mfa` → `{ token }`
- `POST /api/v1/backoffice/:businessId/request_password_reset` → `204`
- `POST /api/v1/backoffice/:businessId/reset_password` → `204`

Équipe (owner-only) :
- `GET /api/v1/backoffice/:businessId/users`
- `POST /api/v1/backoffice/:businessId/users`
- `PATCH /api/v1/backoffice/:businessId/users/:userId` (2FA)
- `DELETE /api/v1/backoffice/:businessId/users/:userId`

## Cron / maintenance

### Rétention RGPD
Endpoint :
- `POST /api/v1/admin/cron/retention?key=<CRON_KEY>`

Comportement :
- `RETENTION_DAYS` (fallback) ou `config_json.settings.retention_days` par business
- `RETENTION_MODE=anonymize|delete` (défaut `anonymize`)

### Nettoyage assets orphelins
Endpoint :
- `POST /api/v1/admin/cron/cleanup_assets?key=<CRON_KEY>&dry_run=true&limit=200&business_id=...`

Réponse dry-run :
- `{ would_delete: [...], count, limit }`

Réponse exécution :
- `{ deleted, limit }`

## Exemples curl

### Backup / restore

```bash
npm run db:backup > backup.json
RESTORE_ALLOW=true npm run db:restore -- backup.json
```

### Cron retention

```bash
curl -X POST "https://<host>/api/v1/admin/cron/retention?key=$CRON_KEY"
```

### Cleanup assets (dry-run)

```bash
curl -X POST "https://<host>/api/v1/admin/cron/cleanup_assets?key=$CRON_KEY&dry_run=true&limit=200"
```

## Notes

- Le backoffice applique un RBAC simple (`owner` vs `staff`). Certaines actions sont owner-only (export CSV, écriture settings, preuve/galerie, gestion équipe).
- Les suppressions RGPD (anonymize/retention/purge) suppriment aussi les fichiers (local/S3) quand ils sont tracés via `asset.storage_key`.
