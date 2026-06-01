# Company Enrichment + PageSpeed + Commissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un “profil entreprise” commun prospects+clients, intégrer PageSpeed Insights (scores + filtre accessibilité), et suivre les commissions mensuelles (taux + charges %).

**Architecture:** Introduit des tables SQL dédiées (`company_profile`, `company_pagespeed_run`, `commission_entry`), des routes internes sécurisées pour l’admin, et un écran backoffice pour que l’artisan renseigne le profil. PageSpeed + scraping email sont exécutés côté serveur avec protections SSRF et stockage d’historique.

**Tech Stack:** Node/Express, SQLite/Postgres via `db.run/db.get/db.all`, React (Vite), Vitest, Tailwind.

---

## Files to Touch (Map)

**DB**
- Create: `app/server/migrations/0013_company_profile_pagespeed_commission.sql`

**Backend**
- Create: `app/server/company/companyProfile.ts`
- Create: `app/server/company/pagespeed.ts`
- Create: `app/server/company/legalEmail.ts`
- Create: `app/server/company/commission.ts`
- Create: `app/server/routes/v1/internalCompanies.ts`
- Modify: `app/server/app.ts` (mount new router)
- Modify: `app/server/routes/v1/backoffice.ts` (endpoints backoffice company_profile)

**Frontend**
- Modify: `app/src/App.tsx` (routes internes)
- Create: `app/src/pages/internal/Companies.tsx`
- Create: `app/src/pages/internal/Commissions.tsx`
- Modify: `app/src/pages/backoffice/Settings.tsx` (section Entreprise)
- Modify: `app/src/components/backoffice/BackofficeShell.tsx` (optionnel: lien)
- Modify: `app/src/pages/internal/InternalLogin.tsx` (optionnel: nav)

**Tests**
- Create: `app/server/routes/v1/internalCompanies.list.test.ts`
- Create: `app/server/routes/v1/internalCompanies.pagespeed.test.ts`
- Create: `app/server/routes/v1/internalCompanies.legalEmail.test.ts`
- Create: `app/server/routes/v1/internalCommissions.test.ts`
- Create: `app/src/pages/internal/Companies.test.tsx`
- Create: `app/src/pages/internal/Commissions.test.tsx`

---

### Task 1: Migration SQL (profil + pagespeed + commissions)

**Files:**
- Create: `app/server/migrations/0013_company_profile_pagespeed_commission.sql`
- Modify: `app/server/migrate.test.ts` (assert migration id added)

- [ ] **Step 1: Write failing migration test**

Update the expectation list:

```ts
expect(ids).toContain('0013_company_profile_pagespeed_commission.sql')
```

- [ ] **Step 2: Run test**

Run: `cd app && npx vitest run server/migrate.test.ts`  
Expected: FAIL (missing id)

- [ ] **Step 3: Write the migration**

```sql
-- 0013_company_profile_pagespeed_commission.sql
CREATE TABLE IF NOT EXISTS company_profile (
  company_profile_id TEXT PRIMARY KEY,
  business_id TEXT,
  prospect_id TEXT,
  website_url TEXT,
  legal_contact_email TEXT,
  headcount_range TEXT,
  naf_code TEXT,
  sector_label TEXT,
  annual_revenue_eur INTEGER,
  website_created_at TEXT,
  website_redesign_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_company_profile_business ON company_profile (business_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_company_profile_prospect ON company_profile (prospect_id);

CREATE TABLE IF NOT EXISTS company_pagespeed_run (
  run_id TEXT PRIMARY KEY,
  business_id TEXT,
  prospect_id TEXT,
  strategy TEXT NOT NULL,
  performance_score INTEGER,
  accessibility_score INTEGER,
  seo_score INTEGER,
  best_practices_score INTEGER,
  raw_json TEXT,
  fetched_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_company_pagespeed_business ON company_pagespeed_run (business_id, fetched_at);
CREATE INDEX IF NOT EXISTS idx_company_pagespeed_prospect ON company_pagespeed_run (prospect_id, fetched_at);
CREATE INDEX IF NOT EXISTS idx_company_pagespeed_strategy_accessibility ON company_pagespeed_run (strategy, accessibility_score);

CREATE TABLE IF NOT EXISTS commission_entry (
  entry_id TEXT PRIMARY KEY,
  month TEXT NOT NULL,
  business_id TEXT,
  prospect_id TEXT,
  ca_eur INTEGER NOT NULL,
  rate_pct REAL NOT NULL,
  charges_pct REAL NOT NULL,
  commission_gross_eur INTEGER NOT NULL,
  charges_amount_eur INTEGER NOT NULL,
  commission_net_eur INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_commission_month ON commission_entry (month);
CREATE INDEX IF NOT EXISTS idx_commission_business_month ON commission_entry (business_id, month);
CREATE INDEX IF NOT EXISTS idx_commission_prospect_month ON commission_entry (prospect_id, month);
```

- [ ] **Step 4: Run tests**

Run:
- `cd app && npm run check`
- `cd app && npx vitest run server/migrate.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/server/migrations/0013_company_profile_pagespeed_commission.sql app/server/migrate.test.ts
git commit -m "feat(db): add company profile, pagespeed runs, commissions"
```

---

### Task 2: Company profile service (shared business/prospect)

**Files:**
- Create: `app/server/company/companyProfile.ts`
- Test: `app/server/company/companyProfile.test.ts`

- [ ] **Step 1: Write failing unit test**

```ts
import { describe, expect, it } from 'vitest'
import { upsertCompanyProfile } from './companyProfile'

describe('companyProfile', () => {
  it('calculates SQL params for business profile upsert', async () => {
    const calls: any[] = []
    const db: any = { run: async (sql: string, params: any[]) => calls.push({ sql, params }), get: async () => null }
    await upsertCompanyProfile(db, { business_id: 'b1' }, { headcount_range: '2_10' })
    expect(calls.length).toBe(1)
    expect(String(calls[0].sql)).toContain('INSERT INTO company_profile')
  })
})
```

- [ ] **Step 2: Run test**

Run: `cd app && npx vitest run server/company/companyProfile.test.ts`  
Expected: FAIL (module missing)

- [ ] **Step 3: Implement service**

```ts
import { newId, nowIso } from '../utils.js'

export type CompanyKey = { business_id?: string | null; prospect_id?: string | null }

export function parseCompanyKey(raw: string): CompanyKey | null {
  const s = String(raw || '')
  if (s.startsWith('business:')) return { business_id: s.slice('business:'.length) }
  if (s.startsWith('prospect:')) return { prospect_id: s.slice('prospect:'.length) }
  return null
}

export function companyKeyToString(k: CompanyKey): string {
  if (k.business_id) return `business:${k.business_id}`
  if (k.prospect_id) return `prospect:${k.prospect_id}`
  return 'unknown'
}

export async function getCompanyProfile(db: any, key: CompanyKey) {
  if (key.business_id) return db.get('SELECT * FROM company_profile WHERE business_id = ?', [key.business_id])
  if (key.prospect_id) return db.get('SELECT * FROM company_profile WHERE prospect_id = ?', [key.prospect_id])
  return null
}

export async function ensureCompanyProfile(db: any, key: CompanyKey) {
  const row = await getCompanyProfile(db, key)
  if (row) return row
  const now = nowIso()
  const id = newId()
  await db.run(
    `INSERT INTO company_profile (
      company_profile_id, business_id, prospect_id,
      website_url, legal_contact_email, headcount_range, naf_code, sector_label, annual_revenue_eur,
      website_created_at, website_redesign_at,
      created_at, updated_at
    ) VALUES (
      ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?,
      ?, ?
    )`,
    [id, key.business_id || null, key.prospect_id || null, null, null, null, null, null, null, null, null, now, now],
  )
  return getCompanyProfile(db, key)
}

export async function upsertCompanyProfile(db: any, key: CompanyKey, patch: any) {
  const existing = await ensureCompanyProfile(db, key)
  const now = nowIso()
  const allowed = [
    'website_url',
    'legal_contact_email',
    'headcount_range',
    'naf_code',
    'sector_label',
    'annual_revenue_eur',
    'website_created_at',
    'website_redesign_at',
  ]
  const updates: string[] = []
  const params: any[] = []
  for (const f of allowed) {
    if (patch[f] === undefined) continue
    updates.push(`${f} = ?`)
    params.push(patch[f] === '' ? null : patch[f])
  }
  if (!updates.length) return existing
  updates.push('updated_at = ?')
  params.push(now)
  if (key.business_id) {
    params.push(key.business_id)
    await db.run(`UPDATE company_profile SET ${updates.join(', ')} WHERE business_id = ?`, params)
  } else if (key.prospect_id) {
    params.push(key.prospect_id)
    await db.run(`UPDATE company_profile SET ${updates.join(', ')} WHERE prospect_id = ?`, params)
  }
  return getCompanyProfile(db, key)
}
```

- [ ] **Step 4: Run test**

Run: `cd app && npx vitest run server/company/companyProfile.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/server/company/companyProfile.ts app/server/company/companyProfile.test.ts
git commit -m "feat(company): add shared company profile service"
```

---

### Task 3: Internal API — list unified companies + filter accessibilité

**Files:**
- Create: `app/server/routes/v1/internalCompanies.ts`
- Create: `app/server/routes/v1/internalCompanies.list.test.ts`
- Modify: `app/server/app.ts`

- [ ] **Step 1: Write failing route test**

```ts
import { describe, expect, it, vi, afterEach } from 'vitest'

function createRes() {
  let resolveDone: (() => void) | null = null
  const done = new Promise<void>((r) => (resolveDone = r))
  const out: any = { statusCode: 200, body: null, done }
  out.status = (c: number) => ((out.statusCode = c), out)
  out.json = (b: any) => ((out.body = b), resolveDone?.(), out)
  out.end = () => (resolveDone?.(), out)
  return out
}

describe('internal companies list', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('returns companies with pagespeed worst accessibility filter', async () => {
    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        all: async (sql: string) => {
          if (sql.includes('FROM business')) return [{ business_id: 'b1', trade_id: 't1', company_name: 'ACME', city: 'Paris', config_json: '{}' }]
          if (sql.includes('FROM prospect')) return []
          if (sql.includes('FROM company_profile')) return [{ business_id: 'b1', website_url: 'https://example.com' }]
          if (sql.includes('FROM company_pagespeed_run')) return [{ business_id: 'b1', strategy: 'mobile', accessibility_score: 40, fetched_at: new Date().toISOString() }]
          return []
        },
        get: async () => null,
        run: async () => {},
      }),
    }))
    const router = (await import('./internalCompanies')).default as any
    const req: any = { query: { accessibility_lt: '50' }, header: () => 'Bearer token' }
    const res = createRes()
    await (router as any).handle(req, res, () => {})
    await res.done
    expect(res.statusCode).toBe(200)
    expect(res.body.items.length).toBe(1)
  })
})
```

- [ ] **Step 2: Implement router**

Create router with:
- `GET /internal/companies`
- Uses `requireInternalAuth`
- Loads:
  - businesses: `SELECT business_id, trade_id, company_name, city, config_json FROM business`
  - prospects: `SELECT prospect_id, trade_id, name, city, website, status FROM prospect`
  - profiles: `SELECT * FROM company_profile`
  - pagespeed runs: query latest per company+strategy (simplify first pass: load recent N and reduce in JS)
- Builds `items` normalized:
  - `company_key` (`business:<id>` / `prospect:<id>`)
  - `name`, `city`, `website_url` (from profile; fallback prospect.website)
  - `headcount_range`, `naf_code`, `sector_label`, `legal_contact_email`
  - `pagespeed`: `{ mobile: {...}, desktop: {...}, worst_accessibility: number|null }`
- Apply filter `accessibility_lt` on `worst_accessibility`.

- [ ] **Step 3: Mount in server**

Modify `app/server/app.ts`:

```ts
import v1InternalCompaniesRoutes from './routes/v1/internalCompanies.js'
app.use('/api/v1', v1InternalCompaniesRoutes)
```

- [ ] **Step 4: Run tests**

Run:
- `cd app && npm run check`
- `cd app && npx vitest run server/routes/v1/internalCompanies.list.test.ts`

- [ ] **Step 5: Commit**

```bash
git add app/server/routes/v1/internalCompanies.ts app/server/routes/v1/internalCompanies.list.test.ts app/server/app.ts
git commit -m "feat(internal): list companies with pagespeed filter"
```

---

### Task 4: PageSpeed integration (server) + history storage

**Files:**
- Create: `app/server/company/pagespeed.ts`
- Create: `app/server/routes/v1/internalCompanies.pagespeed.test.ts`
- Modify: `app/server/routes/v1/internalCompanies.ts`

- [ ] **Step 1: Write failing test (mock PSI fetch)**

Test should:
- mock `global.fetch` to return a PSI payload with category scores
- call `POST /internal/companies/:companyKey/pagespeed/run`
- assert 2 inserts into `company_pagespeed_run` (mobile+desktop)

- [ ] **Step 2: Implement PSI client**

`pagespeed.ts` exports:
- `runPageSpeed(url: string, strategy: 'mobile'|'desktop')`
- Uses `PAGESPEED_API_KEY` if set
- Returns normalized `{ performance_score, accessibility_score, seo_score, best_practices_score, raw_json }`

- [ ] **Step 3: Implement route**

In `internalCompanies.ts` add:
- `POST /internal/companies/:companyKey/pagespeed/run`
- Resolve `website_url`:
  - profile.website_url
  - else for prospect: `prospect.website`
- Insert 2 rows in `company_pagespeed_run` with `newId()` + `nowIso()`

- [ ] **Step 4: Run tests**

Run:
- `cd app && npm run check`
- `cd app && npx vitest run server/routes/v1/internalCompanies.pagespeed.test.ts`

- [ ] **Step 5: Commit**

```bash
git add app/server/company/pagespeed.ts app/server/routes/v1/internalCompanies.ts app/server/routes/v1/internalCompanies.pagespeed.test.ts
git commit -m "feat(pagespeed): store mobile+desktop runs with history"
```

---

### Task 5: Scrape email from legal mentions

**Files:**
- Create: `app/server/company/legalEmail.ts`
- Create: `app/server/routes/v1/internalCompanies.legalEmail.test.ts`
- Modify: `app/server/routes/v1/internalCompanies.ts`
- Modify: `app/server/company/companyProfile.ts` (reuse upsert)

- [ ] **Step 1: Write failing test**

Mock `fetch`:
- homepage HTML contains `<a href="/mentions-legales">Mentions légales</a>`
- legal page contains `contact@acme.fr`
Expect:
- `company_profile.legal_contact_email` updated to `contact@acme.fr`

- [ ] **Step 2: Implement scraper**

`legalEmail.ts` exports:
- `scrapeLegalEmail(url: string): Promise<string | null>`
- Finds legal url (same origin)
- Extract emails with regex

- [ ] **Step 3: Add route**

`POST /internal/companies/:companyKey/legal_email/scrape`
- Resolve website_url as in pagespeed
- If email found: `upsertCompanyProfile(..., { legal_contact_email: email })`
- Return `{ found: boolean, email?: string }`

- [ ] **Step 4: Run tests**

Run:
- `cd app && npm run check`
- `cd app && npx vitest run server/routes/v1/internalCompanies.legalEmail.test.ts`

- [ ] **Step 5: Commit**

```bash
git add app/server/company/legalEmail.ts app/server/routes/v1/internalCompanies.ts app/server/routes/v1/internalCompanies.legalEmail.test.ts
git commit -m "feat(company): scrape legal email and store in profile"
```

---

### Task 6: Backoffice API for company profile

**Files:**
- Modify: `app/server/routes/v1/backoffice.ts`
- Create: `app/server/routes/v1/backoffice.companyProfile.test.ts`
- Reuse: `app/server/company/companyProfile.ts`

- [ ] **Step 1: Write failing route test**

Test:
- mocks db get/run
- hits `GET /backoffice/:businessId/company_profile`
- expects `company_profile` exists

- [ ] **Step 2: Implement endpoints**

In `backoffice.ts` add:
- `GET /backoffice/:businessId/company_profile`
- `PATCH /backoffice/:businessId/company_profile`

Constraints:
- do not allow patching `annual_revenue_eur` from backoffice.

- [ ] **Step 3: Run tests**

Run:
- `cd app && npm run check`
- `cd app && npx vitest run server/routes/v1/backoffice.companyProfile.test.ts`

- [ ] **Step 4: Commit**

```bash
git add app/server/routes/v1/backoffice.ts app/server/routes/v1/backoffice.companyProfile.test.ts
git commit -m "feat(backoffice): company profile endpoints"
```

---

### Task 7: Backoffice UI — section “Entreprise” (effectifs/secteur/dates/email/site)

**Files:**
- Modify: `app/src/pages/backoffice/Settings.tsx`
- Test: `app/src/pages/backoffice/Settings.companyProfile.test.tsx` (optional)

- [ ] **Step 1: Add UI state + fetch**

Fetch:
- `GET /api/v1/backoffice/${businessId}/company_profile`

State fields:
- headcount_range
- naf_code
- sector_label
- website_url
- legal_contact_email
- website_created_at
- website_redesign_at

- [ ] **Step 2: Add save handler**

PATCH payload only includes fields that changed.

- [ ] **Step 3: Manual QA**

Run:
- `cd app && npm run dev`
- Open `/backoffice/:businessId/settings`
- Verify save + reload persists.

- [ ] **Step 4: Commit**

```bash
git add app/src/pages/backoffice/Settings.tsx
git commit -m "feat(backoffice): add company profile section in settings"
```

---

### Task 8: Internal UI — Companies list + filters + actions

**Files:**
- Create: `app/src/pages/internal/Companies.tsx`
- Modify: `app/src/App.tsx`
- Create: `app/src/pages/internal/Companies.test.tsx`

- [ ] **Step 1: Add route**

In `App.tsx`:

```tsx
<Route
  path="/internal/companies"
  element={
    <RequireInternalAuth>
      <Companies />
    </RequireInternalAuth>
  }
/>
```

- [ ] **Step 2: Implement page**

UI:
- filter type (all/business/prospect)
- input accessibility threshold
- search q
- table rows show: name, city, website, legal email, headcount, sector, accessibility (mobile/desktop + worst)
- actions: “Refresh PSI”, “Scrape email”

Calls:
- `GET /api/v1/internal/companies?...`
- `POST /api/v1/internal/companies/${company_key}/pagespeed/run`
- `POST /api/v1/internal/companies/${company_key}/legal_email/scrape`

- [ ] **Step 3: Write minimal test**

Test just checks page renders and calls list endpoint once (mock `fetch`).

- [ ] **Step 4: Commit**

```bash
git add app/src/pages/internal/Companies.tsx app/src/pages/internal/Companies.test.tsx app/src/App.tsx
git commit -m "feat(internal): companies page with pagespeed and legal email"
```

---

### Task 9: Internal commissions (API + UI)

**Files:**
- Create: `app/server/company/commission.ts`
- Modify: `app/server/routes/v1/internalCompanies.ts` (or create `internalCommissions.ts`)
- Create: `app/server/routes/v1/internalCommissions.test.ts`
- Create: `app/src/pages/internal/Commissions.tsx`
- Create: `app/src/pages/internal/Commissions.test.tsx`
- Modify: `app/src/App.tsx`

- [ ] **Step 1: API tests (calc + persist + totals)**

Test:
- POST an entry month+ca+rate+charges
- assert stored gross/charges/net are correct and GET aggregates totals.

- [ ] **Step 2: Implement commission calc service**

`commission.ts` exports:
- `computeCommission(ca_eur, rate_pct, charges_pct)`
- `upsertCommissionEntry(db, payload)`
- `listCommissionEntries(db, from, to)`

- [ ] **Step 3: Implement routes**

Suggested:
- `POST /internal/commissions`
- `GET /internal/commissions`

- [ ] **Step 4: UI**

Page `/internal/commissions`:
- form inputs:
  - month (YYYY-MM)
  - company optional (dropdown from `/internal/companies?type=...` or autocomplete)
  - CA
  - rate pct
  - charges pct
- computed preview (gross/charges/net)
- list grouped by month with totals

- [ ] **Step 5: Commit**

```bash
git add app/server/company/commission.ts app/server/routes/v1/internalCommissions.test.ts app/src/pages/internal/Commissions.tsx app/src/pages/internal/Commissions.test.tsx app/src/App.tsx
git commit -m "feat(internal): commissions tracking with charges"
```

---

### Task 10: Full verification

- [ ] **Step 1: Typecheck**

Run: `cd app && npm run check`  
Expected: PASS

- [ ] **Step 2: Full test suite**

Run: `cd app && npx vitest run --reporter dot`  
Expected: PASS

- [ ] **Step 3: Manual smoke**

- Backoffice: open settings, save profile fields.
- Internal: companies list loads, pagespeed run stores history, filter accessibility works.
- Internal: commissions create entry and monthly totals update.

---

## Notes (Ops)

Add env var (optional):
- `PAGESPEED_API_KEY` (Google PageSpeed Insights)

No secrets stored in DB or logs.

