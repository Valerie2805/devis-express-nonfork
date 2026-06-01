# Internal Companies Bulk PageSpeed Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a “Refresh PSI (filtrés)” button on `/internal/companies` to refresh PageSpeed runs sequentially for all currently listed companies and show progress.

**Architecture:** Frontend-only change. Reuse the existing endpoint `POST /api/v1/internal/companies/:companyKey/pagespeed/run` in a sequential loop. Keep the existing list reload (`load()`) at the end to display updated scores.

**Tech Stack:** React + react-router, `apiFetch` wrapper, Vitest + React Testing Library

---

### Task 1: UI bulk refresh state + handler

**Files:**
- Modify: [Companies.tsx](file:///Users/b.delb/Documents/trae_projects/devis-express/app/src/pages/internal/Companies.tsx)

- [ ] **Step 1: Add UI state for bulk refresh**

Add new state near the existing “actions” state:

```ts
const [bulkRefreshing, setBulkRefreshing] = useState(false)
const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null)
```

- [ ] **Step 2: Add handler `refreshPsiFiltered`**

Implement a sequential loop using the current `items` list:

```ts
async function refreshPsiFiltered() {
  if (bulkRefreshing) return
  setActionError(null)
  setBulkRefreshing(true)
  setBulkProgress({ done: 0, total: items.length })
  try {
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      try {
        await apiFetch(`/api/v1/internal/companies/${encodeURIComponent(it.company_key)}/pagespeed/run`, {
          method: 'POST',
          headers: { ...authHeaders(token) },
        })
      } catch (e) {
        if (!actionError) setActionError(e instanceof Error ? e.message : 'Erreur')
      } finally {
        setBulkProgress({ done: i + 1, total: items.length })
      }
    }
    await load()
  } finally {
    setBulkRefreshing(false)
    setBulkProgress(null)
  }
}
```

- [ ] **Step 3: Add button next to “Export CSV”**

```tsx
<button
  type="button"
  onClick={refreshPsiFiltered}
  disabled={bulkRefreshing || loading || !!error || !items.length}
  className="h-10 rounded-lg border border-white/10 bg-white/5 px-3 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-60"
>
  {bulkRefreshing && bulkProgress ? `Refresh PSI (${bulkProgress.done}/${bulkProgress.total})` : 'Refresh PSI (filtrés)'}
</button>
```

- [ ] **Step 4: Run typecheck**

Run:
```bash
cd app
npm run check
```
Expected: exit code 0.

---

### Task 2: UI test for bulk refresh

**Files:**
- Create: [Companies.bulkRefresh.test.tsx](file:///Users/b.delb/Documents/trae_projects/devis-express/app/src/pages/internal/Companies.bulkRefresh.test.tsx)

- [ ] **Step 1: Write failing test**

```tsx
import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Companies from '@/pages/internal/Companies'
import { useInternalAuthStore } from '@/store/internalAuthStore'

describe('Companies bulk refresh', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    useInternalAuthStore.getState().setToken(null)
    cleanup()
  })

  it('refresh PSI for all listed items', async () => {
    useInternalAuthStore.getState().setToken('t')
    const fetchMock = vi.fn(async (input: any, init?: any) => {
      const url = String(input)
      if (url.includes('/api/v1/internal/companies') && (!init || init.method === 'GET')) {
        return new Response(JSON.stringify({ items: [{ company_key: 'business:b1', type: 'business', name: 'ACME', city: null, website_url: null, legal_contact_email: null, headcount_range: null, naf_code: null, sector_label: null, pagespeed: {} }] }), { status: 200 })
      }
      if (url.includes('/api/v1/internal/companies/business%3Ab1/pagespeed/run') && init?.method === 'POST') {
        return new Response(JSON.stringify({ success: true }), { status: 200 })
      }
      return new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter initialEntries={['/internal/companies']}>
        <Companies />
      </MemoryRouter>,
    )

    await screen.findByText('ACME')
    fireEvent.click(screen.getByRole('button', { name: 'Refresh PSI (filtrés)' }))

    await waitFor(() => {
      expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/pagespeed/run'))).toBe(true)
    })
  })
})
```

- [ ] **Step 2: Run test to verify RED**

Run:
```bash
cd app
npx vitest run src/pages/internal/Companies.bulkRefresh.test.tsx --reporter dot
```
Expected: FAIL until the button/handler exists.

- [ ] **Step 3: Implement minimal code to pass**

Apply Task 1 changes.

- [ ] **Step 4: Run test to verify GREEN**

Run:
```bash
cd app
npx vitest run src/pages/internal/Companies.bulkRefresh.test.tsx --reporter dot
```
Expected: PASS.

---

### Task 3: Regression pass

**Files:**
- Test: existing suites

- [ ] **Step 1: Run UI test suite**

Run:
```bash
cd app
npx vitest run src/pages --reporter dot
```

- [ ] **Step 2: Run server test suite**

Run:
```bash
cd app
npx vitest run server --reporter dot
```

- [ ] **Step 3: Run typecheck**

Run:
```bash
cd app
npm run check
```

