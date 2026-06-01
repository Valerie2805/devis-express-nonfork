# Prospection (Owner) + Portail Client + Commissions (par lead) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter dans le backoffice (business) un module Prospection réservé à l’owner (Valérie), un workflow “site en cours / livré” géré par Émilie (staff) sur les leads assignés, un portail client (lien secret + PIN) avec preview protégée et activable par Émilie, et un suivi des commissions (Valérie = % du CA) par lead.

**Architecture:** On réutilise la table `prospect` existante (déjà alimentée via Google Places) mais on expose des endpoints backoffice owner. On verrouille l’accès staff aux leads via `assignee_user_id`. On ajoute des tables dédiées pour l’accès portail + factures/CA par lead, puis on expose un portail public (PIN + token) et une interface backoffice staff/owner pour gérer statuts, preview et copie de liens.

**Tech Stack:** React + react-router (frontend), Express (backend), SQLite migrations, Vitest (tests), ExcelJS déjà ajouté pour exports.

---

## Périmètre fonctionnel (validé)

- Prospection Google Places : **dans le backoffice**, **owner uniquement**
- Émilie est **staff** dans le business
  - voit **uniquement les leads assignés** (`assignee_user_id = emilie.user_id`)
  - peut marquer **site_status** (`todo` / `in_progress` / `delivered`)
  - peut activer/désactiver le lien de preview “site en dev”
- Portail client : lien secret + **PIN unique par lead**
  - lien preview distinct (secret distinct) + **même PIN**
  - lien preview visible/actif **seulement** si Émilie l’a validé
- Commission Valérie : **% sur le CA**, **par lead**, **toutes les factures futures** liées à ce lead, sans limite de temps
- Page home portail client : **tout-en-un** (suivi + liens + checklist + messages)
- Émilie voit une vue “portail enrichie” (actions extra) dans le backoffice

---

## Décomposition des livrables

1) **Sécurité & permissions** : restreindre les leads visibles pour staff (assignee), ajouter permissions “site_work” et “prospection_owner”
2) **DB** :
   - table `lead_portal_access` (token + pin + preview)
   - table `lead_revenue_entry` (factures / CA)
   - champs site sur lead (ou table `lead_site_state`)
3) **API** :
   - backoffice prospection owner (search/import/list)
   - backoffice site workflow (staff assigned)
   - portail public (PIN + token)
   - revenue/commission (owner)
4) **UI** :
   - menu backoffice Prospection (owner)
   - page backoffice “Sites” pour Émilie (assigned leads, statut, actions)
   - portail client public (PIN, home)
   - backoffice owner “Commissions”
5) **Stats/graphes** (V1 simple, V2 carte)
   - V1: listes + mini graphes “sparklines” en HTML/CSS (pas de lib externe)

---

## Conventions de données

### lead.site_status
Enum:
- `todo`
- `in_progress`
- `delivered`

Champs complémentaires:
- `site_started_at` (ISO)
- `site_delivered_at` (ISO)

### lead_portal_access
Une ligne par lead.
Champs:
- `portal_id` (id opaque public)
- `business_id`, `lead_id`
- `portal_token_hash` + `portal_token_set_at`
- `preview_token_hash` + `preview_token_set_at`
- `pin_hash` + `pin_set_at`
- `preview_enabled` (0/1) + `preview_enabled_at`
- `created_at`, `updated_at`

### lead_revenue_entry
Factures/CA rattachés à un lead (saisie manuelle d’abord).
Champs:
- `entry_id`, `business_id`, `lead_id`
- `amount_cents`, `currency`
- `invoiced_at` (ISO)
- `description` (string)
- `created_by_user_id` (staff/owner)
- `created_at`

### commission rate
Stockage dans `business.config_json`:
`config.settings.commissions.lead_ca_rate_pct` (number)

---

# Task 1: Restreindre l’accès staff aux leads (assignee_user_id)

**Files:**
- Modify: `app/server/routes/v1/backoffice.ts`
- Test: `app/server/routes/v1/backoffice.staffVisibility.test.ts`

- [ ] **Step 1: Write failing test (RED)**

Create `app/server/routes/v1/backoffice.staffVisibility.test.ts`:

```ts
import { describe, expect, it, vi, afterEach } from 'vitest'

function createRes() {
  let resolveDone: (() => void) | null = null
  const done = new Promise<void>((r) => (resolveDone = r))
  const out: any = { statusCode: 200, body: null, done }
  out.status = (code: number) => ((out.statusCode = code), out)
  out.json = (body: any) => ((out.body = body), resolveDone?.(), out)
  return out
}

function getRouteHandler(router: any, path: string, method: string) {
  const layer = router.stack.find((l: any) => l.route && l.route.path === path && l.route.methods?.[method])
  if (!layer) throw new Error('route not found')
  const stack = layer.route.stack
  return stack[stack.length - 1].handle
}

describe('staff lead visibility', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('staff ne voit que ses leads assignés', async () => {
    const allCalls: any[] = []
    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        get: async () => ({ config_json: JSON.stringify({ settings: { staff_permissions: { lead_read: true } } }) }),
        all: async (sql: string, params: any[]) => {
          allCalls.push({ sql, params })
          return []
        },
      }),
    }))

    const router = (await import('./backoffice')).default as any
    const handler = getRouteHandler(router, '/backoffice/:businessId/leads', 'get')
    const req: any = {
      params: { businessId: 'b1' },
      query: {},
      auth: { business_id: 'b1', role: 'staff', user_id: 'u_staff' },
    }
    const res = createRes()
    await handler(req, res as any, () => {})
    await res.done
    expect(res.statusCode).toBe(200)
    const call = allCalls.find((c) => String(c.sql).includes('FROM lead'))
    expect(call.params).toContain('u_staff')
  })
})
```

- [ ] **Step 2: Run test to confirm RED**

Run:
```bash
cd app
npx vitest run server/routes/v1/backoffice.staffVisibility.test.ts --reporter dot --maxWorkers=1
```
Expected: FAIL (le endpoint n’applique pas assignee_user_id).

- [ ] **Step 3: Minimal implementation (GREEN)**

Dans `router.get('/backoffice/:businessId/leads'...)` dans `backoffice.ts`:
- si `req.auth.role === 'staff'` alors ajouter par défaut `assignee_user_id = req.auth.user_id` (sauf si owner).

Code à ajouter juste après la construction `where`:

```ts
if (req.auth?.role === 'staff' && req.auth.user_id) {
  where += ' AND assignee_user_id = ?'
  params.push(String(req.auth.user_id))
}
```

⚠️ Le tableau `params` et `where` existent déjà dans cet endpoint; ajuster la position pour ne pas casser les `LIMIT/OFFSET`.

- [ ] **Step 4: Run test (GREEN)**

Run:
```bash
cd app
npx vitest run server/routes/v1/backoffice.staffVisibility.test.ts --reporter dot --maxWorkers=1
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/server/routes/v1/backoffice.ts app/server/routes/v1/backoffice.staffVisibility.test.ts
git commit -m "feat: restrict staff lead visibility to assigned leads"
```

---

# Task 2: Migration DB pour site_status + portail + revenus par lead

**Files:**
- Create: `app/server/migrations/0014_lead_portal_site_revenue.sql`
- Test: `app/server/migrate.test.ts` (déjà présent) + ajout tests ciblés

- [ ] **Step 1: Add migration file**

Create `app/server/migrations/0014_lead_portal_site_revenue.sql`:

```sql
ALTER TABLE lead ADD COLUMN assignee_user_id TEXT;
ALTER TABLE lead ADD COLUMN site_status TEXT;
ALTER TABLE lead ADD COLUMN site_started_at TEXT;
ALTER TABLE lead ADD COLUMN site_delivered_at TEXT;

CREATE INDEX IF NOT EXISTS idx_lead_assignee_created ON lead(business_id, assignee_user_id, created_at);

CREATE TABLE IF NOT EXISTS lead_portal_access (
  portal_id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  lead_id TEXT NOT NULL,
  portal_token_hash TEXT NOT NULL,
  portal_token_set_at TEXT NOT NULL,
  preview_token_hash TEXT NOT NULL,
  preview_token_set_at TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  pin_set_at TEXT NOT NULL,
  preview_enabled INTEGER NOT NULL DEFAULT 0,
  preview_enabled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_lead_portal_access_lead ON lead_portal_access(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_portal_access_business ON lead_portal_access(business_id);

CREATE TABLE IF NOT EXISTS lead_revenue_entry (
  entry_id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  lead_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  invoiced_at TEXT NOT NULL,
  description TEXT,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lead_revenue_business_invoiced ON lead_revenue_entry(business_id, invoiced_at);
CREATE INDEX IF NOT EXISTS idx_lead_revenue_lead_invoiced ON lead_revenue_entry(lead_id, invoiced_at);
```

Note: si `assignee_user_id` existe déjà via une migration plus ancienne, remplacer les `ALTER TABLE` par une migration “safe” (SQLite ne supporte pas `IF NOT EXISTS` sur ADD COLUMN). Dans ce cas, la migration doit omettre l’ALTER existant et ne créer que les nouvelles colonnes manquantes.

- [ ] **Step 2: Run migrations**

Run:
```bash
cd app
npm run db:migrate
```
Expected: applied migration without error.

- [ ] **Step 3: Commit**

```bash
git add app/server/migrations/0014_lead_portal_site_revenue.sql
git commit -m "feat: add portal access, lead site status, and lead revenue tables"
```

---

# Task 3: API portail public (lien secret + PIN) + preview distinct

**Files:**
- Create: `app/server/routes/v1/public.portal.ts`
- Modify: `app/server/routes/v1/public.ts` (ou router v1 index) pour monter la route
- Create: `app/server/routes/v1/public.portal.test.ts`
- Modify: `app/server/utils.ts` (si besoin) ou réutiliser `crypto` utilitaires existants

## Endpoints

- `GET /api/v1/public/portal/:portalId` (retourne infos non sensibles si token OK, sinon 404)
- `POST /api/v1/public/portal/:portalId/unlock` (PIN -> session_token court)
- `GET /api/v1/public/portal/:portalId/home` (nécessite session_token)
- `GET /api/v1/public/portal/:portalId/preview` (nécessite session_token + preview_enabled)

Implémentation simple: le `session_token` est un token HMAC signé côté serveur qui encode `portal_id` + expiry 2h.

- [ ] **Step 1: Write failing test (RED)**

Create `app/server/routes/v1/public.portal.test.ts`:

```ts
import { describe, expect, it, vi, afterEach } from 'vitest'

function createRes() {
  let resolveDone: (() => void) | null = null
  const done = new Promise<void>((r) => (resolveDone = r))
  const out: any = { statusCode: 200, body: null, done, headers: {} }
  out.status = (c: number) => ((out.statusCode = c), out)
  out.json = (b: any) => ((out.body = b), resolveDone?.(), out)
  return out
}

function getRouteHandler(router: any, path: string, method: string) {
  const layer = router.stack.find((l: any) => l.route && l.route.path === path && l.route.methods?.[method])
  if (!layer) throw new Error('route not found')
  const stack = layer.route.stack
  return stack[stack.length - 1].handle
}

describe('public portal', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('refuse si token invalide', async () => {
    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        get: async () => ({ portal_id: 'p1', portal_token_hash: '00', portal_token_set_at: 'x', preview_token_hash: '00', preview_token_set_at: 'x', pin_hash: '00', pin_set_at: 'x', preview_enabled: 0 }),
      }),
    }))
    const router = (await import('./public.portal')).default as any
    const handler = getRouteHandler(router, '/public/portal/:portalId', 'get')
    const req: any = { params: { portalId: 'p1' }, query: { t: 'bad' } }
    const res = createRes()
    await handler(req, res as any, () => {})
    await res.done
    expect(res.statusCode).toBe(404)
  })
})
```

- [ ] **Step 2: Run test (Verify RED)**

Run:
```bash
cd app
npx vitest run server/routes/v1/public.portal.test.ts --reporter dot --maxWorkers=1
```
Expected: FAIL (module/route not found).

- [ ] **Step 3: Implement router (GREEN)**

Create `app/server/routes/v1/public.portal.ts`:

```ts
import type { Request, Response } from 'express'
import crypto from 'crypto'
import { getDb } from '../../db.js'
import { createRouter } from '../router.js'

const router = createRouter()

function sha256(s: string) {
  return crypto.createHash('sha256').update(s).digest('hex')
}

function tokenOk(storedHash: string, provided: string) {
  const computed = sha256(provided)
  try {
    return crypto.timingSafeEqual(Buffer.from(storedHash, 'hex'), Buffer.from(computed, 'hex'))
  } catch {
    return false
  }
}

router.get('/public/portal/:portalId', async (req: Request, res: Response) => {
  const portalId = String(req.params.portalId || '').trim()
  const token = String((req.query as any).t || '').trim()
  if (!portalId || !token) return res.status(404).json({ success: false, error: 'Not found' })
  const db = await getDb()
  const row = await db.get<any>('SELECT * FROM lead_portal_access WHERE portal_id = ?', [portalId])
  if (!row) return res.status(404).json({ success: false, error: 'Not found' })
  if (!tokenOk(String(row.portal_token_hash || ''), token)) return res.status(404).json({ success: false, error: 'Not found' })
  res.status(200).json({ portal_id: portalId, preview_enabled: Boolean(row.preview_enabled) })
})

export default router
```

Mount router in main v1 public router (where `public.ts` is mounted):
- either import and `router.use(publicPortal)` or ensure server mounts both routers.

- [ ] **Step 4: Run test (GREEN)**

Run:
```bash
cd app
npx vitest run server/routes/v1/public.portal.test.ts --reporter dot --maxWorkers=1
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/server/routes/v1/public.portal.ts app/server/routes/v1/public.portal.test.ts app/server/routes/v1/public.ts
git commit -m "feat: add public portal router (token-gated)"
```

---

# Task 4: Backoffice staff “Sites” (assigned leads) + actions Émilie

**Files:**
- Create: `app/src/pages/backoffice/Sites.tsx`
- Modify: `app/src/App.tsx`
- Modify: `app/src/components/backoffice/BackofficeShell.tsx`
- Create: `app/src/pages/backoffice/Sites.test.tsx`
- Modify: `app/server/routes/v1/backoffice.ts` (endpoints site actions)

## UI behavior
- Liste des leads assignés (staff) ou tous (owner) filtrés sur `site_status != null` (ou “tous” + filtre).
- Actions:
  - set `site_status`
  - générer/afficher le lien portail + copier
  - activer preview (toggle)
  - générer/rotation token preview

## API additions
- `POST /api/v1/backoffice/:businessId/leads/:leadId/portal` (create/rotate portal+pin+preview tokens)
- `PATCH /api/v1/backoffice/:businessId/leads/:leadId/site` (update site_status + preview_enabled)

Tests: use route handler pattern like existing tests.

---

# Task 5: Backoffice owner “Prospection” (Google Places)

**Files:**
- Create: `app/src/pages/backoffice/Prospection.tsx`
- Modify: `app/src/App.tsx`
- Modify: `app/src/components/backoffice/BackofficeShell.tsx`
- Create: `app/src/pages/backoffice/Prospection.test.tsx`
- Create: `app/server/routes/v1/backofficeProspection.ts`
- Create: `app/server/routes/v1/backofficeProspection.test.ts`

## Endpoints
- `POST /api/v1/backoffice/:businessId/prospection/search_places` (calls `searchPlaces`)
- `POST /api/v1/backoffice/:businessId/prospection/import_places` (calls `getPlaceDetails` + upsert `prospect`)
- `GET /api/v1/backoffice/:businessId/prospection/prospects` (list prospects)

Access: owner only (`mustBeOwner`).

---

# Task 6: Commissions owner par lead (CA facturé)

**Files:**
- Create: `app/src/pages/backoffice/Commissions.tsx` (backoffice)
- Modify: `app/src/App.tsx` + `BackofficeShell.tsx`
- Create: `app/src/pages/backoffice/Commissions.test.tsx`
- Create: `app/server/routes/v1/backofficeCommissions.ts`
- Create: `app/server/routes/v1/backofficeCommissions.test.ts`
- Modify: `app/server/routes/v1/backoffice.ts` (mount router)

## Endpoints
- `GET /api/v1/backoffice/:businessId/commissions` -> returns invoices grouped by month + totals + current rate
- `POST /api/v1/backoffice/:businessId/commissions` -> create `lead_revenue_entry`
- `PATCH /api/v1/backoffice/:businessId/commissions/rate` -> set `config.settings.commissions.lead_ca_rate_pct`

Calculation:
- commission_cents = round(amount_cents * rate_pct / 100)

---

# Task 7: Portail client UI + home tout-en-un + copy link

**Files:**
- Create: `app/src/pages/portal/PortalHome.tsx`
- Create: `app/src/pages/portal/PortalPin.tsx`
- Modify: `app/src/App.tsx` (route public)
- Create: `app/src/pages/portal/PortalHome.test.tsx`

Implementation:
- Step 1: fetch `/api/v1/public/portal/:portalId?t=...` to check token and if preview enabled
- Step 2: PIN unlock -> get session token
- Step 3: home includes:
  - status site
  - checklist items (stored in lead JSON state or new table)
  - messages (reuse messaging tables or new `portal_message` table)
  - preview link shown only if preview_enabled
  - copy portal link button

---

# Task 8: Validation globale

Run:
```bash
cd app
./node_modules/.bin/tsc --noEmit
npx vitest run src --reporter dot
npx vitest run server --reporter dot --maxWorkers=1
```

