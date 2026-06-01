# Prospection centralisée + Inbox + Multi-démos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un module prospection centralisée (Google Places → Resend outbound → Mailgun inbound inbox) + 6 démos métiers, hébergé sur Vercel.

**Architecture:** Introduit une authentification “internal” séparée du backoffice des businesses, expose des endpoints dédiés `api/v1/internal/*` (auth JWT), et un webhook inbound Mailgun. Les prospects/messages/séquences sont stockés en Postgres. Les démos métiers sont seedées en base.

**Tech Stack:** React + Vite, Express, Postgres (Neon), Resend, Mailgun inbound parse, Vitest/RTL.

---

## File structure (nouveaux fichiers)

**Backend**
- Create: `app/server/migrations/0011_internal_auth.sql`
- Create: `app/server/migrations/0012_prospection.sql`
- Create: `app/server/internal/auth.ts`
- Create: `app/server/internal/password.ts`
- Create: `app/server/internal/types.ts`
- Create: `app/server/internal/middleware.ts`
- Create: `app/server/prospection/types.ts`
- Create: `app/server/prospection/utils.ts`
- Create: `app/server/prospection/resend.ts`
- Create: `app/server/prospection/mailgun.ts`
- Create: `app/server/prospection/places.ts`
- Create: `app/server/prospection/sequences.ts`
- Create: `app/server/prospection/tasks.ts`
- Create: `app/server/routes/v1/internal.ts`
- Create: `app/server/routes/v1/internalProspection.ts`

**Frontend**
- Create: `app/src/pages/internal/InternalLogin.tsx`
- Create: `app/src/pages/internal/Prospection.tsx`
- Create: `app/src/pages/internal/Inbox.tsx`
- Create: `app/src/pages/internal/ProspectDetail.tsx`
- Create: `app/src/components/internal/InternalShell.tsx`
- Create: `app/src/store/internalAuthStore.ts`
- Create: `app/src/lib/internalApi.ts`

**Tests**
- Create: `app/server/internal/auth.test.ts`
- Create: `app/server/prospection/utils.test.ts`
- Create: `app/server/prospection/mailgun.test.ts`
- Create: `app/server/prospection/sequences.test.ts`
- Create: `app/src/pages/internal/InternalLogin.test.tsx`

---

### Task 1: Auth interne (DB + API login)

**Files:**
- Create: `app/server/migrations/0011_internal_auth.sql`
- Create: `app/server/internal/password.ts`
- Create: `app/server/internal/auth.ts`
- Create: `app/server/internal/types.ts`
- Create: `app/server/internal/middleware.ts`
- Create: `app/server/routes/v1/internal.ts`
- Modify: `app/server/app.ts`
- Test: `app/server/internal/auth.test.ts`

- [ ] **Step 1: Write failing test (login OK + JWT)**

```ts
import { describe, expect, it } from 'vitest'
import jwt from 'jsonwebtoken'
import { signInternalToken, verifyInternalToken } from './auth'

describe('internal auth', () => {
  it('signe et vérifie un token', () => {
    const secret = 'test-secret'
    const token = signInternalToken({ internal_user_id: 'iu-1', email: 'a@b.c' }, secret)
    const payload = verifyInternalToken(token, secret)
    expect(payload.internal_user_id).toBe('iu-1')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run server/internal/auth.test.ts`  
Expected: FAIL (module missing)

- [ ] **Step 3: Write minimal implementation**

Créer `internal_user` :
```sql
CREATE TABLE IF NOT EXISTS internal_user (
  internal_user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at TEXT NOT NULL
);
```

Impl `auth.ts` :
```ts
import jwt from 'jsonwebtoken'

export type InternalAuthPayload = { internal_user_id: string; email: string; role?: string }

export function signInternalToken(payload: InternalAuthPayload, secret: string) {
  return jwt.sign(payload, secret, { expiresIn: '7d' })
}

export function verifyInternalToken(token: string, secret: string) {
  return jwt.verify(token, secret) as InternalAuthPayload
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npx vitest run server/internal/auth.test.ts`  
Expected: PASS

- [ ] **Step 5: Mount API routes**

Créer `POST /api/v1/internal/login` qui :
- valide `email/password`
- vérifie `internal_user.password_hash`
- retourne `{ token }`

Ajouter middleware `requireInternalAuth` pour les routes internes.

- [ ] **Step 6: Commit**

```bash
git add app/server/migrations/0011_internal_auth.sql app/server/internal app/server/routes/v1/internal.ts app/server/app.ts app/server/internal/auth.test.ts
git commit -m "feat(internal): add internal auth login"
```

---

### Task 2: Prospection DB (prospect + messages + sequences + tasks)

**Files:**
- Create: `app/server/migrations/0012_prospection.sql`
- Test: `app/server/migrate.test.ts`

- [ ] **Step 1: Write failing test**

Dans `server/migrate.test.ts`, ajouter un test qui attend que `runMigrations()` insère `0012_prospection.sql` dans `schema_migrations`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run server/migrate.test.ts`  
Expected: FAIL

- [ ] **Step 3: Write minimal migration**

Tables:
- `prospect` (pk `prospect_id`, `place_id` nullable unique, `emails_json`, `tags_json`, `status`)
- `prospect_message` (fk `prospect_id`, `direction`, `provider`, `text`, `html`)
- `prospect_sequence` (name, enabled, steps_json)
- `prospect_task` (run_at, payload_json, status, attempts, last_error)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npx vitest run server/migrate.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/server/migrations/0012_prospection.sql app/server/migrate.test.ts
git commit -m "feat(prospection): add prospect tables"
```

---

### Task 3: Prospection utils (reply-to parsing, dedup helpers)

**Files:**
- Create: `app/server/prospection/utils.ts`
- Create: `app/server/prospection/types.ts`
- Test: `app/server/prospection/utils.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, expect, it } from 'vitest'
import { parseInboundAlias } from './utils'

describe('parseInboundAlias', () => {
  it('extrait prospectId', () => {
    expect(parseInboundAlias('p_abc@inbound.example.com', 'inbound.example.com')).toBe('abc')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run server/prospection/utils.test.ts`  
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```ts
export function parseInboundAlias(to: string, inboundDomain: string) {
  const s = String(to || '').trim().toLowerCase()
  const m = s.match(/^p_([a-z0-9-]+)@(.+)$/)
  if (!m) return null
  if (m[2] !== inboundDomain.toLowerCase()) return null
  return m[1]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npx vitest run server/prospection/utils.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/server/prospection/types.ts app/server/prospection/utils.ts app/server/prospection/utils.test.ts
git commit -m "feat(prospection): add utils for inbound alias and dedupe"
```

---

### Task 4: Outbound Resend (send + persist message)

**Files:**
- Create: `app/server/prospection/resend.ts`
- Modify: `app/server/routes/v1/internalProspection.ts`
- Test: `app/server/prospection/resend.test.ts`

- [ ] **Step 1: Write failing test**

Test que `buildReplyTo(prospectId)` renvoie `p_<id>@<MAILGUN_INBOUND_DOMAIN>`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run server/prospection/resend.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement**

Impl via `fetch` HTTP Resend (évite dépendances supposées):
- `POST https://api.resend.com/emails`
- headers `Authorization: Bearer ${RESEND_API_KEY}`

Enregistrer en DB dans `prospect_message` (direction outbound, provider resend).

- [ ] **Step 4: Run tests**

Run: `cd app && npx vitest run server/prospection/resend.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/server/prospection/resend.ts app/server/prospection/resend.test.ts
git commit -m "feat(prospection): send outbound emails via resend"
```

---

### Task 5: Inbound Mailgun webhook (signature + insert inbound message + stop tasks)

**Files:**
- Create: `app/server/prospection/mailgun.ts`
- Modify: `app/server/routes/v1/internalProspection.ts`
- Test: `app/server/prospection/mailgun.test.ts`

- [ ] **Step 1: Write failing test**

Test de signature:
- signature invalide → 401
- signature valide + `recipient=p_<id>@domain` → 204 + message inbound en DB

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run server/prospection/mailgun.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement**

Validation Mailgun (HMAC SHA256):
- utiliser `timestamp` + `token` + `MAILGUN_SIGNING_KEY`
- comparer `signature`

Persistance:
- insérer `prospect_message` inbound
- mettre `prospect.status='replied'` si applicable
- annuler les `prospect_task` queued du prospect

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npx vitest run server/prospection/mailgun.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/server/prospection/mailgun.ts app/server/prospection/mailgun.test.ts
git commit -m "feat(prospection): add mailgun inbound webhook"
```

---

### Task 6: Places search/import (server-side)

**Files:**
- Create: `app/server/prospection/places.ts`
- Modify: `app/server/routes/v1/internalProspection.ts`
- Test: `app/server/prospection/places.test.ts`

- [ ] **Step 1: Write failing test**

Test `mapPlacesResultToProspect()` pour garantir `place_id`, `name`, `phone`, `website` mapping.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run server/prospection/places.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement**

Endpoints internes:
- `POST /api/v1/internal/prospection/search_places`
- `POST /api/v1/internal/prospection/import_places`

Rate limiting côté API (réutiliser `limiterSensitive` ou `limiterWrite`).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npx vitest run server/prospection/places.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/server/prospection/places.ts app/server/prospection/places.test.ts
git commit -m "feat(prospection): add google places search and import"
```

---

### Task 7: Séquences + scheduler (prospect_task runner)

**Files:**
- Create: `app/server/prospection/sequences.ts`
- Create: `app/server/prospection/tasks.ts`
- Modify: `app/server/routes/v1/internalProspection.ts`
- Test: `app/server/prospection/sequences.test.ts`

- [ ] **Step 1: Write failing test**

Test:
- enroll séquence crée 3 tasks
- stop sur inbound annule tasks queued

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run server/prospection/sequences.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement**

Ajouter endpoint:
- `POST /api/v1/internal/prospection/prospects/:id/enroll_default_sequence`

Runner:
- `POST /api/v1/internal/prospection/run_due_tasks?limit=...` protégé (internal auth)
- (Option) brancher sur cron Vercel via `/api/v1/admin/cron/*` avec clé séparée plus tard.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npx vitest run server/prospection/sequences.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/server/prospection/sequences.ts app/server/prospection/tasks.ts app/server/prospection/sequences.test.ts
git commit -m "feat(prospection): add sequences and task runner"
```

---

### Task 8: UI Internal (login + prospection + inbox)

**Files:**
- Create: `app/src/store/internalAuthStore.ts`
- Create: `app/src/lib/internalApi.ts`
- Create: `app/src/components/internal/InternalShell.tsx`
- Create: `app/src/pages/internal/InternalLogin.tsx`
- Create: `app/src/pages/internal/Prospection.tsx`
- Create: `app/src/pages/internal/Inbox.tsx`
- Create: `app/src/pages/internal/ProspectDetail.tsx`
- Modify: `app/src/App.tsx`
- Test: `app/src/pages/internal/InternalLogin.test.tsx`

- [ ] **Step 1: Write failing test**

Test login:
- render page
- mock fetch `/api/v1/internal/login`
- store token + navigate vers `/internal/prospection`

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run src/pages/internal/InternalLogin.test.tsx`  
Expected: FAIL

- [ ] **Step 3: Implement minimal UI**

Routes:
- `/internal/login`
- `/internal/prospection`
- `/internal/inbox`
- `/internal/prospects/:id`

Store:
- `internal_token_v1` en localStorage

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npx vitest run src/pages/internal/InternalLogin.test.tsx`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/src/store/internalAuthStore.ts app/src/lib/internalApi.ts app/src/components/internal/InternalShell.tsx app/src/pages/internal app/src/App.tsx app/src/pages/internal/InternalLogin.test.tsx
git commit -m "feat(internal-ui): add internal login and prospection shell"
```

---

### Task 9: Multi-démos (6 métiers) + landing

**Files:**
- Modify: `app/server/db.ts`
- Modify: `app/src/pages/Landing.tsx`

- [ ] **Step 1: Write failing test**

Ajouter un test API (ou unit) qui garantit que `seed()` crée les 6 `business_id` attendus si `SEED_DEMO=true`.

- [ ] **Step 2: Implement**

Créer 6 businesses:
- `demo-plombier`, `demo-serrurier`, `demo-electricien`, `demo-chauffage`, `demo-vitrier`, `demo-peintre`

Landing:
- 6 cartes démo (site + backoffice)

- [ ] **Step 3: Verify**

Run (local): `cd app && npm run dev` puis ouvrir les liens.

- [ ] **Step 4: Commit**

```bash
git add app/server/db.ts app/src/pages/Landing.tsx
git commit -m "feat(demo): add 6 trade demos and landing selector"
```

---

## Configuration Vercel (checklist)

- Env vars:
  - `INTERNAL_JWT_SECRET`
  - `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
  - `MAILGUN_SIGNING_KEY`, `MAILGUN_INBOUND_DOMAIN`
  - `GOOGLE_PLACES_API_KEY`
- DNS:
  - MX pour `MAILGUN_INBOUND_DOMAIN` vers Mailgun
- Webhook Mailgun:
  - URL: `https://<domain>/api/v1/internal/prospection/inbound-email`

