# Prospection Reviews & Archiving Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Afficher les avis Google importés sur les prospects (inline) et ajouter un archivage complet des prospects (toggle archivés, restaurer, bulk “tout affiché”).

**Architecture:** Ajoute 2 endpoints backoffice (lister les avis d’un prospect, archiver en masse) et étend l’endpoint de liste prospects (filtre archivés). Côté UI, Prospection affiche un panneau inline d’avis, un toggle “Afficher archivés”, et des actions “Archiver/Restaurer” + “Archiver tous les prospects filtrés”.

**Tech Stack:** React + react-router-dom, TypeScript, Express, SQLite/PG via `getDb`, vitest, @testing-library/react.

---

## Structure des fichiers

**Server**
- Modify: [backoffice.ts](file:///Users/b.delb/Documents/trae_projects/devis-express/app/server/routes/v1/backoffice.ts)
- Create tests:
  - `app/server/routes/v1/backoffice.prospectionProspectReviews.test.ts`
  - `app/server/routes/v1/backoffice.prospectionArchiveBulk.test.ts`

**Front**
- Modify: [Prospection.tsx](file:///Users/b.delb/Documents/trae_projects/devis-express/app/src/pages/backoffice/Prospection.tsx)
- Modify tests: [Prospection.test.tsx](file:///Users/b.delb/Documents/trae_projects/devis-express/app/src/pages/backoffice/Prospection.test.tsx)

---

### Task 1: Endpoint — Lister les avis d’un prospect

**Files:**
- Modify: [backoffice.ts](file:///Users/b.delb/Documents/trae_projects/devis-express/app/server/routes/v1/backoffice.ts)
- Create: `app/server/routes/v1/backoffice.prospectionProspectReviews.test.ts`

- [ ] **Step 1: Write failing test**

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

describe('backoffice prospection prospect reviews', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('liste les avis d’un prospect', async () => {
    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        get: async () => ({ business_id: 'b1' }),
        all: async () => [
          { author_name: 'Alice', rating: 5, text: 'Super', created_at: '2024-01-01T00:00:00.000Z' },
          { author_name: 'Bob', rating: 4, text: 'Bien', created_at: '2023-12-01T00:00:00.000Z' },
        ],
        run: async () => {},
      }),
    }))

    const router = (await import('./backoffice')).default as any
    const handler = getRouteHandler(router, '/backoffice/:businessId/prospection/prospects/:prospectId/reviews', 'get')

    const req: any = {
      params: { businessId: 'b1', prospectId: 'p1' },
      query: {},
      auth: { business_id: 'b1', role: 'owner', user_id: 'u1' },
      header: () => '',
      ip: '127.0.0.1',
    }
    const res = createRes()
    await handler(req, res as any, (e: any) => {
      if (e) throw e
    })
    await res.done
    expect(res.statusCode).toBe(200)
    expect(Array.isArray(res.body.items)).toBe(true)
    expect(res.body.items[0].author_name).toBe('Alice')
  }, 20_000)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd app
npx vitest run server/routes/v1/backoffice.prospectionProspectReviews.test.ts --maxWorkers=1
```

Expected: FAIL avec `route not found`.

- [ ] **Step 3: Implement route**

Ajouter dans `backoffice.ts` (zone prospection) :
- `GET /backoffice/:businessId/prospection/prospects/:prospectId/reviews`
- Validation owner + business scope via `business_prospect`
- Query:

```sql
SELECT author_name, rating, text, created_at
FROM prospect_review
WHERE business_id = ? AND prospect_id = ?
ORDER BY created_at DESC
LIMIT ? OFFSET ?
```

Réponse:

```ts
res.status(200).json({ items: rows.map(...) })
```

- [ ] **Step 4: Run tests to verify pass**

```bash
cd app
npx vitest run server/routes/v1/backoffice.prospectionProspectReviews.test.ts --maxWorkers=1
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/server/routes/v1/backoffice.ts app/server/routes/v1/backoffice.prospectionProspectReviews.test.ts
git commit -m "feat(prospection): add endpoint to list prospect reviews"
```

---

### Task 2: Endpoint — Prospects (filtre archivés) + bulk archive “tout affiché”

**Files:**
- Modify: [backoffice.ts](file:///Users/b.delb/Documents/trae_projects/devis-express/app/server/routes/v1/backoffice.ts)
- Create: `app/server/routes/v1/backoffice.prospectionArchiveBulk.test.ts`

- [ ] **Step 1: Write failing tests**

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

describe('backoffice prospection archive bulk', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('GET prospects masque archived par défaut', async () => {
    const allCalls: any[] = []
    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        get: async () => ({ c: 0 }),
        all: async (sql: string, params: any[]) => {
          allCalls.push({ sql, params })
          return []
        },
        run: async () => {},
      }),
    }))

    const router = (await import('./backoffice')).default as any
    const handler = getRouteHandler(router, '/backoffice/:businessId/prospection/prospects', 'get')
    const req: any = {
      params: { businessId: 'b1' },
      query: { limit: '50', offset: '0' },
      auth: { business_id: 'b1', role: 'owner', user_id: 'u1' },
      header: () => '',
      ip: '127.0.0.1',
    }
    const res = createRes()
    await handler(req, res as any, (e: any) => {
      if (e) throw e
    })
    await res.done
    expect(allCalls.some((c) => String(c.sql).toLowerCase().includes('archived'))).toBe(true)
  }, 20_000)

  it('archive tous les prospects filtrés (limit)', async () => {
    const runCalls: any[] = []
    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        all: async (sql: string) => {
          if (sql.includes('SELECT p.prospect_id')) return [{ prospect_id: 'p1' }, { prospect_id: 'p2' }]
          return []
        },
        get: async () => null,
        run: async (sql: string, params: any[]) => runCalls.push({ sql, params }),
      }),
    }))

    const router = (await import('./backoffice')).default as any
    const handler = getRouteHandler(router, '/backoffice/:businessId/prospection/prospects/archive_bulk', 'post')
    const req: any = {
      params: { businessId: 'b1' },
      auth: { business_id: 'b1', role: 'owner', user_id: 'u1' },
      body: { q: 'elec', limit: 200 },
      header: () => '',
      ip: '127.0.0.1',
    }
    const res = createRes()
    await handler(req, res as any, (e: any) => {
      if (e) throw e
    })
    await res.done
    expect(res.statusCode).toBe(200)
    expect(runCalls.some((c) => String(c.sql).includes('UPDATE prospect SET status') && c.params.includes('archived'))).toBe(true)
  }, 20_000)
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd app
npx vitest run server/routes/v1/backoffice.prospectionArchiveBulk.test.ts --maxWorkers=1
```

Expected: FAIL (route bulk inexistante, filtre archived pas appliqué).

- [ ] **Step 3: Implement**

1) Étendre `GET /backoffice/:businessId/prospection/prospects`:
- Nouveau query param `include_archived=1` (string)
- Par défaut: ajouter `AND p.status != 'archived'` dans `where`
- Si `include_archived=1`: ne pas filtrer

2) Ajouter `POST /backoffice/:businessId/prospection/prospects/archive_bulk`:
- body: `{ q?: string, limit?: number }`
- Calculer la même clause `where` que la liste (business scope + q)
- Sélectionner `prospect_id` via `business_prospect JOIN prospect`
- Filtrer `p.status != 'archived'`
- Limiter `limit` à `[1..500]` (par défaut `200`)
- Loop: `UPDATE prospect SET status='archived', updated_at=? WHERE prospect_id=?`
- Réponse: `{ success: true, archived: number }`
- Audit: `prospection.prospect.archive_bulk`

- [ ] **Step 4: Re-run tests**

```bash
cd app
npx vitest run server/routes/v1/backoffice.prospectionArchiveBulk.test.ts --maxWorkers=1
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/server/routes/v1/backoffice.ts app/server/routes/v1/backoffice.prospectionArchiveBulk.test.ts
git commit -m "feat(prospection): add archived filtering and bulk archive endpoint"
```

---

### Task 3: UI Prospection — toggle archivés, restaurer, bulk archive

**Files:**
- Modify: [Prospection.tsx](file:///Users/b.delb/Documents/trae_projects/devis-express/app/src/pages/backoffice/Prospection.tsx)
- Modify: [Prospection.test.tsx](file:///Users/b.delb/Documents/trae_projects/devis-express/app/src/pages/backoffice/Prospection.test.tsx)

- [ ] **Step 1: Write failing UI tests**

Ajouter à `Prospection.test.tsx` :

```ts
it('masque les prospects archivés par défaut et permet de les afficher', async () => {
  useAuthStore.getState().setToken('t')
  const calls: any[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: any, init?: any) => {
      calls.push([input, init])
      const url = String(input)
      if (url.includes('/api/v1/backoffice/b1/me')) return new Response(JSON.stringify({ role: 'owner' }), { status: 200 })
      if (url.includes('/api/v1/backoffice/b1/settings')) return new Response(JSON.stringify({ config: { settings: {} } }), { status: 200 })
      if (url.includes('/api/v1/backoffice/b1/prospection/stats')) return new Response(JSON.stringify({ total: 0, series: [] }), { status: 200 })
      if (url.includes('/api/v1/backoffice/b1/prospection/prospects')) return new Response(JSON.stringify({ items: [], total: 0 }), { status: 200 })
      return new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
    }),
  )

  render(
    <MemoryRouter initialEntries={['/backoffice/b1/prospection']}>
      <Routes>
        <Route path="/backoffice/:businessId/prospection" element={<Prospection />} />
      </Routes>
    </MemoryRouter>,
  )

  expect(await screen.findByText('Prospects')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Afficher archivés' }))
  expect(calls.some((c) => String(c[0]).includes('include_archived=1'))).toBe(true)
})

it('archive tous les prospects filtrés', async () => {
  useAuthStore.getState().setToken('t')
  vi.stubGlobal('confirm', vi.fn(() => true))
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: any, init?: any) => {
      const url = String(input)
      if (url.includes('/api/v1/backoffice/b1/me')) return new Response(JSON.stringify({ role: 'owner' }), { status: 200 })
      if (url.includes('/api/v1/backoffice/b1/settings')) return new Response(JSON.stringify({ config: { settings: {} } }), { status: 200 })
      if (url.includes('/api/v1/backoffice/b1/prospection/stats')) return new Response(JSON.stringify({ total: 0, series: [] }), { status: 200 })
      if (url.includes('/api/v1/backoffice/b1/prospection/prospects') && (!init || !init.method || init.method === 'GET'))
        return new Response(JSON.stringify({ items: [{ prospect_id: 'p1', name: 'X', city: null, website: null, status: 'new' }], total: 1 }), { status: 200 })
      if (url.includes('/api/v1/backoffice/b1/prospection/prospects/archive_bulk') && init?.method === 'POST')
        return new Response(JSON.stringify({ success: true, archived: 1 }), { status: 200 })
      return new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
    }),
  )

  render(
    <MemoryRouter initialEntries={['/backoffice/b1/prospection']}>
      <Routes>
        <Route path="/backoffice/:businessId/prospection" element={<Prospection />} />
      </Routes>
    </MemoryRouter>,
  )

  expect(await screen.findByText('X')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Archiver tous les prospects filtrés' }))
  expect((fetch as any).mock.calls.some((c: any[]) => String(c[0]).includes('/archive_bulk') && c[1]?.method === 'POST')).toBe(true)
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd app
npx vitest run src/pages/backoffice/Prospection.test.tsx --reporter dot
```

Expected: FAIL (boutons inexistants / URL non modifiée).

- [ ] **Step 3: Implement UI**

Modifier `Prospection.tsx` :
- Ajouter state:
  - `prospectQuery` (string) et l’envoyer vers `GET prospects` via `?q=...`
  - `includeArchived` (boolean) et l’envoyer via `?include_archived=1`
- Ajouter en haut de la section Prospects:
  - input “Rechercher un prospect”
  - bouton toggle `Afficher archivés` / `Masquer archivés`
  - bouton `Archiver tous les prospects filtrés` (avec `window.confirm`)
- Ajouter bouton “Restaurer” si `p.status === 'archived'` qui fait PATCH `{status:'new'}`
- Ajouter endpoint bulk call:

```ts
await apiFetch(`/api/v1/backoffice/${businessId}/prospection/prospects/archive_bulk`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
  body: JSON.stringify({ q: prospectQuery.trim() || undefined, limit: 200 }),
})
```

- [ ] **Step 4: Run tests to verify pass**

```bash
cd app
npx vitest run src/pages/backoffice/Prospection.test.tsx --reporter dot
```

- [ ] **Step 5: Commit**

```bash
git add app/src/pages/backoffice/Prospection.tsx app/src/pages/backoffice/Prospection.test.tsx
git commit -m "feat(prospection): add archived toggle and bulk archive UI"
```

---

### Task 4: UI Prospection — Avis inline (Option 1)

**Files:**
- Modify: [Prospection.tsx](file:///Users/b.delb/Documents/trae_projects/devis-express/app/src/pages/backoffice/Prospection.tsx)
- Modify: [Prospection.test.tsx](file:///Users/b.delb/Documents/trae_projects/devis-express/app/src/pages/backoffice/Prospection.test.tsx)

- [ ] **Step 1: Write failing UI test**

```ts
it('affiche les avis en inline quand on clique Voir avis', async () => {
  useAuthStore.getState().setToken('t')
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: any, init?: any) => {
      const url = String(input)
      if (url.includes('/api/v1/backoffice/b1/me')) return new Response(JSON.stringify({ role: 'owner' }), { status: 200 })
      if (url.includes('/api/v1/backoffice/b1/settings')) return new Response(JSON.stringify({ config: { settings: {} } }), { status: 200 })
      if (url.includes('/api/v1/backoffice/b1/prospection/stats')) return new Response(JSON.stringify({ total: 0, series: [] }), { status: 200 })
      if (url.includes('/api/v1/backoffice/b1/prospection/prospects'))
        return new Response(JSON.stringify({ items: [{ prospect_id: 'p1', name: 'X', city: null, website: null, status: 'new' }], total: 1 }), { status: 200 })
      if (url.includes('/api/v1/backoffice/b1/prospection/prospects/p1/reviews'))
        return new Response(JSON.stringify({ items: [{ author_name: 'Alice', rating: 5, text: 'Super', created_at: '2024-01-01T00:00:00.000Z' }] }), { status: 200 })
      return new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
    }),
  )

  render(
    <MemoryRouter initialEntries={['/backoffice/b1/prospection']}>
      <Routes>
        <Route path="/backoffice/:businessId/prospection" element={<Prospection />} />
      </Routes>
    </MemoryRouter>,
  )

  expect(await screen.findByText('X')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Voir avis' }))
  expect(await screen.findByText('Alice')).toBeInTheDocument()
  expect(await screen.findByText('5/5')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd app
npx vitest run src/pages/backoffice/Prospection.test.tsx --reporter dot
```

- [ ] **Step 3: Implement inline panel**

Dans `Prospection.tsx`:
- State:
  - `expandedReviewsId: string | null`
  - `reviewsByProspectId: Record<string, { loading: boolean; error: string | null; items: any[] }>`
- Actions:
  - `toggleReviews(prospectId)`:
    - si déjà ouvert: fermer
    - sinon: ouvrir + fetch `.../reviews` + set state
- Render:
  - bouton `Voir avis` / `Masquer avis`
  - si ouvert: bloc sous la carte avec:
    - loading, error
    - map items: auteur + `rating/5` + date + texte

- [ ] **Step 4: Run tests to verify pass**

```bash
cd app
npx vitest run src/pages/backoffice/Prospection.test.tsx --reporter dot
```

- [ ] **Step 5: Commit**

```bash
git add app/src/pages/backoffice/Prospection.tsx app/src/pages/backoffice/Prospection.test.tsx
git commit -m "feat(prospection): show reviews inline per prospect"
```

---

### Task 5: Final verification

- [ ] **Step 1: Typecheck**

```bash
cd app
npm run check
```

- [ ] **Step 2: Server tests**

```bash
cd app
npx vitest run server/routes/v1/backoffice.prospectionProspectReviews.test.ts --maxWorkers=1
npx vitest run server/routes/v1/backoffice.prospectionArchiveBulk.test.ts --maxWorkers=1
```

- [ ] **Step 3: Front tests**

```bash
cd app
npx vitest run src/pages/backoffice/Prospection.test.tsx --reporter dot
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(prospection): reviews UI + archiving UX"
```

