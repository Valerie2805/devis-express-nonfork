# Déploiement Vercel — Configuration des variables d’environnement

Ce document explique comment configurer une instance complète sur Vercel, avec un socle minimal (login + site public + backoffice) et les options (SMS, Places, IA, emails…).

## 1) Pré-requis Vercel (intégrations)

### 1.1 Vercel Postgres (Neon)

1. Dans Vercel → ton projet → **Storage** → ajoute **Postgres**.
2. Vercel crée automatiquement des variables (dont `DATABASE_URL`) dans le projet.

### 1.2 Vercel Blob (uploads + audits)

1. Dans Vercel → ton projet → **Storage** → ajoute **Blob**.
2. Vercel ajoute `BLOB_READ_WRITE_TOKEN`.

## 2) Réglages projet (Build & Output)

Dans Vercel → Project Settings :

- **Root Directory** : `app`
- **Build Command** : `npm run build`
- **Output Directory** : `dist`

## 3) Variables indispensables (pour éviter les HTTP 500)

À définir au minimum en **Production**.
Si tu utilises des **Preview Deployments**, duplique aussi ces variables en **Preview**.

- `DB_DRIVER=postgres`
- `DATABASE_URL=...` (normalement injectée par Vercel Postgres)
- `NODE_ENV=production`
- `JWT_SECRET=<secret long aléatoire>`
- `FILE_STORAGE=vercel_blob`
- `BLOB_READ_WRITE_TOKEN=...` (injecté par Vercel Blob)

Notes :
- Sur Vercel, le mode `sqlite` n’est pas supporté pour la prod (filesystem non fiable), d’où `DB_DRIVER=postgres`.
- Certains 500 viennent simplement du fait que ces variables sont “Production only” alors que tu testes une URL Preview.

## 4) Variables fortement recommandées (sécurité / ops)

- `ADMIN_KEY=<secret>`  
  Protège les routes `/api/v1/admin/*` via `x-admin-key`.
- `CORS_ORIGINS=https://ton-domaine.fr,https://www.ton-domaine.fr`  
  Restreint les origines autorisées.
- `APP_URL=https://ton-domaine.fr`  
  Sert à construire des liens absolus (ex : reset password si activé).

## 5) Activer les fonctionnalités optionnelles

### 5.1 SMS / WhatsApp (Twilio)

Par défaut : `MESSAGE_PROVIDER=noop` (aucun envoi réel).
Pour envoyer réellement :

- `MESSAGE_PROVIDER=twilio`
- `TWILIO_ACCOUNT_SID=...`
- `TWILIO_AUTH_TOKEN=...`
- `TWILIO_FROM_SMS=...` (numéro Twilio SMS)
- `TWILIO_FROM_WHATSAPP=...` (numéro WhatsApp Twilio)

Option (dev uniquement, à éviter en prod) :
- `TWILIO_SKIP_SIGNATURE=true`

### 5.2 Google Places (prospection)

- `GOOGLE_PLACES_API_KEY=...`

Sans cette clé, les pages de prospection Places ne peuvent pas importer de prospects depuis Google.

### 5.3 PageSpeed Insights (PSI)

- `PAGESPEED_API_KEY=...`

Sans clé, l’appel PSI peut fonctionner mais avec quota plus faible.

### 5.4 Email sortant (SMTP)

Par défaut : `EMAIL_PROVIDER=noop`.
Pour envoyer via SMTP :

- `EMAIL_PROVIDER=smtp`
- `SMTP_HOST=...`
- `SMTP_USER=...`
- `SMTP_PASS=...`
- `SMTP_FROM=...`
- (optionnel) `SMTP_PORT=587`

### 5.5 Email sortant (Resend) — prospection

- `RESEND_API_KEY=...`
- `RESEND_FROM_EMAIL=...`

### 5.6 Email entrant (Mailgun inbound)

Si tu actives l’ingestion d’emails entrants :

- `MAILGUN_SIGNING_KEY=...`
- `MAILGUN_INBOUND_DOMAIN=...`

### 5.7 Audit IA (OpenAI-compatible)

Par défaut, l’audit fonctionne en mode “rules” (sans IA).
Pour activer un provider OpenAI-compatible :

- `AI_PROVIDER=openai_compatible`
- `AI_API_KEY=...`
- `AI_MODEL=...`
- (optionnel) `AI_BASE_URL=https://api.openai.com/v1` (ou endpoint compatible)

### 5.8 Monitoring (Sentry)

Backend :
- `SENTRY_DSN=...`
- (optionnels) `SENTRY_ENVIRONMENT`, `SENTRY_TRACES_SAMPLE_RATE`, `SENTRY_RELEASE`

Frontend (Vite) :
- `VITE_SENTRY_DSN=...`
- (optionnel) `VITE_SENTRY_TRACES_SAMPLE_RATE=...`

## 6) Seed démo (recommandation)

Le seed démo est utile pour démarrer vite (données de test).

- `SEED_DEMO=true` pour initialiser une base “demo”.
- Puis repasser `SEED_DEMO=false` en prod si tu veux une base “clean”.

## 7) Debug des erreurs (checklist)

### 7.1 HTTP 500 sur le site public ou au login

Vérifie en priorité :
- tu n’es pas sur une URL **Preview** avec des variables uniquement en Production
- `DB_DRIVER=postgres` et `DATABASE_URL` existent dans l’environnement testé

Dans Vercel :
- Project → **Functions** → `/api/index` → **Logs**

### 7.2 Erreurs liées au filesystem (ENOENT / read-only)

Sur Vercel, évite d’écrire dans le filesystem de déploiement.
Les audits et uploads doivent passer par Vercel Blob (`FILE_STORAGE=vercel_blob` + `BLOB_READ_WRITE_TOKEN`).

