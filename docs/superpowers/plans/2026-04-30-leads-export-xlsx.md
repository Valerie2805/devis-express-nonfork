# Leads Export (CSV Excel-friendly + XLSX) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un export natif `.xlsx` des leads + rendre le CSV lisible dans Excel (FR) et inclure `company_profile.website_url` + `company_profile.created_at` (format FR) dans les exports.

**Architecture:** On conserve l’endpoint CSV existant en l’améliorant (séparateur `;`, BOM UTF‑8, CRLF, dates FR). On ajoute un nouvel endpoint `.xlsx` généré côté serveur via une librairie XLSX (ExcelJS), et on expose deux boutons “CSV” / “Excel” dans le backoffice Demandes.

**Tech Stack:** Express (server), React (backoffice), SQLite, Vitest, ajout dépendance `exceljs`.

---

## Fichiers impactés

**Backend**
- Modify: [backoffice.ts](file:///Users/b.delb/Documents/trae_projects/devis-express/app/server/routes/v1/backoffice.ts)
- Modify: [package.json](file:///Users/b.delb/Documents/trae_projects/devis-express/app/package.json)
- Create: `app/server/routes/v1/backoffice.leadsExportCsv.test.ts`
- Create: `app/server/routes/v1/backoffice.leadsExportXlsx.test.ts`

**Frontend**
- Modify: [Inbox.tsx](file:///Users/b.delb/Documents/trae_projects/devis-express/app/src/pages/backoffice/Inbox.tsx)
- Create: `app/src/pages/backoffice/Inbox.exportXlsx.test.tsx`

---

### Task 1: Ajouter la dépendance XLSX (ExcelJS)

**Files:**
- Modify: [package.json](file:///Users/b.delb/Documents/trae_projects/devis-express/app/package.json)

- [ ] **Step 1: Ajouter un test “smoke” serveur XLSX (RED)**

Créer `app/server/routes/v1/backoffice.leadsExportXlsx.test.ts` avec un test qui appelle la route `.xlsx` et échoue car l’endpoint n’existe pas encore:

```ts
import { describe, expect, it } from 'vitest'

function createRes() {
  let resolveDone: (() => void) | null = null
  const done = new Promise<void>((r) => (resolveDone = r))
  const out: any = { statusCode: 200, body: null, done, headers: {} }
  out.status = (code: number) => ((out.statusCode = code), out)
  out.setHeader = (k: string, v: any) => ((out.headers[k] = v), out)
  out.send = (b: any) => ((out.body = b), resolveDone?.(), out)
  out.end = () => (resolveDone?.(), out)
  return out
}

function getRouteHandler(router: any, path: string, method: string) {
  const layer = router.stack.find((l: any) => l.route && l.route.path === path && l.route.methods?.[method])
  if (!layer) throw new Error('route not found')
  const stack = layer.route.stack
  return stack[stack.length - 1].handle
}

describe('leads export xlsx', () => {
  it('expose un endpoint xlsx', async () => {
    const router = (await import('./backoffice')).default as any
    const handler = getRouteHandler(router, '/backoffice/:businessId/leads/export.xlsx', 'get')
    const req: any = { params: { businessId: 'b1' }, query: {}, auth: { business_id: 'b1', role: 'owner', user_id: 'u1' } }
    const res = createRes()
    await handler(req, res as any, () => {})
    await res.done
    expect(res.statusCode).toBe(200)
  })
})
```

- [ ] **Step 2: Lancer le test (Verify RED)**

Run:
```bash
cd app
npx vitest run server/routes/v1/backoffice.leadsExportXlsx.test.ts --reporter dot
```
Expected: FAIL (route not found).

- [ ] **Step 3: Ajouter `exceljs`**

Dans `app/package.json` (dependencies):
```json
{
  "dependencies": {
    "exceljs": "^4.4.0"
  }
}
```

- [ ] **Step 4: Installer**

Run:
```bash
cd app
npm install
```

- [ ] **Step 5: Commit**

```bash
git add app/package.json app/package-lock.json
git commit -m "chore: add exceljs for xlsx exports"
```

---

### Task 2: Améliorer l’export CSV (Excel FR) + ajouter site business + date (FR)

**Files:**
- Modify: [backoffice.ts](file:///Users/b.delb/Documents/trae_projects/devis-express/app/server/routes/v1/backoffice.ts)
- Create: `app/server/routes/v1/backoffice.leadsExportCsv.test.ts`

- [ ] **Step 1: Écrire le test CSV (RED)**

Créer `app/server/routes/v1/backoffice.leadsExportCsv.test.ts`:

```ts
import { describe, expect, it, vi, afterEach } from 'vitest'

function createRes() {
  let resolveDone: (() => void) | null = null
  const done = new Promise<void>((r) => (resolveDone = r))
  const out: any = { statusCode: 200, body: '', done, headers: {} }
  out.status = (code: number) => ((out.statusCode = code), out)
  out.setHeader = (k: string, v: any) => ((out.headers[k] = v), out)
  out.send = (b: any) => ((out.body = b), resolveDone?.(), out)
  return out
}

function getRouteHandler(router: any, path: string, method: string) {
  const layer = router.stack.find((l: any) => l.route && l.route.path === path && l.route.methods?.[method])
  if (!layer) throw new Error('route not found')
  const stack = layer.route.stack
  return stack[stack.length - 1].handle
}

describe('leads export csv', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('exporte un CSV excel-friendly avec website + dates FR', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-30T12:00:00.000Z'))

    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        all: async (sql: string) => {
          if (sql.includes('FROM lead'))
            return [
              {
                lead_id: 'l1',
                created_at: '2026-04-01T09:10:00.000Z',
                status: 'new',
                trade_id: 't1',
                request_type: 'depannage',
                urgency: 'now',
                channel_preference: 'call',
                first_name: 'Alice',
                phone_e164: '+331',
                email: 'a@b.c',
                city: 'Paris',
                postal_code: '75000',
                address: '1 rue x',
                description: 'test',
                photos_count: 0,
                tags_json: JSON.stringify(['x', 'y']),
                score: 1,
                decision: 'qualified',
              },
            ]
          return []
        },
        get: async (sql: string) => {
          if (sql.includes('FROM company_profile'))
            return { website_url: 'https://example.com', created_at: '2026-01-02T03:04:00.000Z' }
          return null
        },
        run: async () => {},
      }),
    }))

    const router = (await import('./backoffice')).default as any
    const handler = getRouteHandler(router, '/backoffice/:businessId/leads/export', 'get')
    const req: any = {
      params: { businessId: 'b1' },
      query: {},
      auth: { business_id: 'b1', role: 'owner', user_id: 'u1' },
      header: () => '',
      ip: '127.0.0.1',
    }
    const res = createRes()
    await handler(req, res as any, () => {})
    await res.done

    expect(res.statusCode).toBe(200)
    expect(String(res.headers['Content-Type'])).toContain('text/csv')
    const text = String(res.body)
    expect(text.startsWith('\ufeff')).toBe(true)
    expect(text).toContain('business_website_url')
    expect(text).toContain('business_profile_created_at_fr')
    expect(text).toContain('created_at_fr')
    expect(text).toContain('https://example.com')
    expect(text).toContain('x|y')
    expect(text).toContain(';')
  })
})
```

- [ ] **Step 2: Run test (Verify RED)**

Run:
```bash
cd app
npx vitest run server/routes/v1/backoffice.leadsExportCsv.test.ts --reporter dot --maxWorkers=1
```
Expected: FAIL (champs manquants / séparateur / BOM / etc).

- [ ] **Step 3: Implémenter CSV Excel-friendly (GREEN)**

Dans [backoffice.ts](file:///Users/b.delb/Documents/trae_projects/devis-express/app/server/routes/v1/backoffice.ts), dans la zone de l’export CSV:

1) Ajouter un formateur FR (sans seconds):
```ts
function formatDateFr(iso: any) {
  if (!iso) return ''
  try {
    return new Date(String(iso)).toLocaleString('fr-FR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch {
    return String(iso)
  }
}
```

2) Adapter l’échappement CSV pour `;`:
```ts
function csvCell(value: any) {
  if (value === null || value === undefined) return ''
  const s = String(value)
  if (/[";\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}
```

3) Récupérer le site et created_at du business:
```ts
const profileRow = await db.get<any>('SELECT website_url, created_at FROM company_profile WHERE business_id = ?', [businessId])
const businessWebsiteUrl = profileRow?.website_url ? String(profileRow.website_url) : ''
const businessProfileCreatedAtFr = profileRow?.created_at ? formatDateFr(profileRow.created_at) : ''
```

4) Ajouter colonnes + changer séparateur + BOM + CRLF:
```ts
const header = [
  'lead_id',
  'created_at',
  'created_at_fr',
  'status',
  'trade_id',
  'request_type',
  'urgency',
  'channel_preference',
  'first_name',
  'phone_e164',
  'email',
  'city',
  'postal_code',
  'address',
  'description',
  'photos_count',
  'score',
  'decision',
  'tags',
  'business_website_url',
  'business_profile_created_at_fr',
]

const lines = [header.join(';')]
for (const r of items) {
  const line = [
    r.lead_id,
    r.created_at,
    formatDateFr(r.created_at),
    r.status,
    r.trade_id,
    r.request_type,
    r.urgency,
    r.channel_preference,
    r.first_name,
    r.phone_e164,
    r.email,
    r.city,
    r.postal_code,
    r.address,
    r.description,
    r.photos_count,
    r.score,
    r.decision,
    (r.tags || []).join('|'),
    businessWebsiteUrl,
    businessProfileCreatedAtFr,
  ].map(csvCell).join(';')
  lines.push(line)
}

res.setHeader('Content-Type', 'text/csv; charset=utf-8')
res.setHeader('Content-Disposition', `attachment; filename="leads-${businessId}.csv"`)
res.status(200).send(`\ufeff${lines.join('\r\n')}`)
```

- [ ] **Step 4: Run test (Verify GREEN)**

Run:
```bash
cd app
npx vitest run server/routes/v1/backoffice.leadsExportCsv.test.ts --reporter dot --maxWorkers=1
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/server/routes/v1/backoffice.ts app/server/routes/v1/backoffice.leadsExportCsv.test.ts
git commit -m "feat: improve leads CSV export for Excel and add business website fields"
```

---

### Task 3: Ajouter l’endpoint XLSX

**Files:**
- Modify: [backoffice.ts](file:///Users/b.delb/Documents/trae_projects/devis-express/app/server/routes/v1/backoffice.ts)
- Update: `app/server/routes/v1/backoffice.leadsExportXlsx.test.ts`

- [ ] **Step 1: Rendre le test XLSX “réel” (RED)**

Mettre à jour `backoffice.leadsExportXlsx.test.ts` pour mocker la DB et vérifier le contenu du XLSX via ExcelJS:

```ts
import { describe, expect, it, vi, afterEach } from 'vitest'
import ExcelJS from 'exceljs'

function createRes() {
  let resolveDone: (() => void) | null = null
  const done = new Promise<void>((r) => (resolveDone = r))
  const out: any = { statusCode: 200, body: null, done, headers: {} }
  out.status = (code: number) => ((out.statusCode = code), out)
  out.setHeader = (k: string, v: any) => ((out.headers[k] = v), out)
  out.send = (b: any) => ((out.body = b), resolveDone?.(), out)
  out.end = () => (resolveDone?.(), out)
  return out
}

function getRouteHandler(router: any, path: string, method: string) {
  const layer = router.stack.find((l: any) => l.route && l.route.path === path && l.route.methods?.[method])
  if (!layer) throw new Error('route not found')
  const stack = layer.route.stack
  return stack[stack.length - 1].handle
}

describe('leads export xlsx', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('exporte un XLSX avec website + dates', async () => {
    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        all: async (sql: string) => {
          if (sql.includes('FROM lead'))
            return [
              {
                lead_id: 'l1',
                created_at: '2026-04-01T09:10:00.000Z',
                status: 'new',
                trade_id: 't1',
                request_type: 'depannage',
                urgency: 'now',
                channel_preference: 'call',
                first_name: 'Alice',
                phone_e164: '+331',
                email: 'a@b.c',
                city: 'Paris',
                postal_code: '75000',
                address: '1 rue x',
                description: 'test',
                photos_count: 0,
                tags_json: JSON.stringify(['x', 'y']),
                score: 1,
                decision: 'qualified',
              },
            ]
          return []
        },
        get: async (sql: string) => {
          if (sql.includes('FROM company_profile'))
            return { website_url: 'https://example.com', created_at: '2026-01-02T03:04:00.000Z' }
          return { config_json: '{}' }
        },
        run: async () => {},
      }),
    }))

    const router = (await import('./backoffice')).default as any
    const handler = getRouteHandler(router, '/backoffice/:businessId/leads/export.xlsx', 'get')
    const req: any = {
      params: { businessId: 'b1' },
      query: {},
      auth: { business_id: 'b1', role: 'owner', user_id: 'u1' },
      header: () => '',
      ip: '127.0.0.1',
    }
    const res = createRes()
    await handler(req, res as any, () => {})
    await res.done

    expect(res.statusCode).toBe(200)
    expect(String(res.headers['Content-Type'])).toContain('spreadsheetml')
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(Buffer.isBuffer(res.body) ? res.body : Buffer.from(res.body))
    const ws = wb.worksheets[0]
    expect(ws.getRow(1).values).toContain('business_website_url')
    expect(ws.getRow(2).values).toContain('https://example.com')
  })
})
```

- [ ] **Step 2: Run test (Verify RED)**

Run:
```bash
cd app
npx vitest run server/routes/v1/backoffice.leadsExportXlsx.test.ts --reporter dot --maxWorkers=1
```
Expected: FAIL (route manquante / exceljs import / etc).

- [ ] **Step 3: Implémenter la route `.xlsx` (GREEN)**

Dans [backoffice.ts](file:///Users/b.delb/Documents/trae_projects/devis-express/app/server/routes/v1/backoffice.ts), ajouter:

1) Import ExcelJS (ESM):
```ts
import ExcelJS from 'exceljs'
```

2) Nouvelle route:
```ts
router.get('/backoffice/:businessId/leads/export.xlsx', requireAuth, async (req: Request, res: Response) => {
  const businessId = mustAccessBusiness(req, res)
  if (!businessId) return
  if (!(await mustHavePermission(req, res, businessId, 'export_leads'))) return

  const db = await getDb()
  const { status, tag, urgency, from, to, q } = req.query as Record<string, string>

  const params: any[] = [businessId]
  let where = 'business_id = ?'
  if (status) { where += ' AND status = ?'; params.push(status) }
  if (from) { where += ' AND created_at >= ?'; params.push(from) }
  if (to) { where += ' AND created_at <= ?'; params.push(to) }
  if (urgency) { where += ' AND urgency = ?'; params.push(urgency) }
  if (q) {
    const qq = `%${String(q).trim()}%`
    where += ' AND (lead_id LIKE ? OR first_name LIKE ? OR phone_e164 LIKE ? OR city LIKE ? OR request_type LIKE ?)'
    params.push(qq, qq, qq, qq, qq)
  }

  const rows = await db.all<any>(
    `SELECT lead_id, created_at, status, trade_id, request_type, urgency, channel_preference,
            first_name, phone_e164, email, city, postal_code, address, description,
            photos_count, tags_json, score, decision
     FROM lead
     WHERE ${where}
     ORDER BY created_at DESC
     LIMIT 10000`,
    params,
  )

  const items = rows.map((r) => ({ ...r, tags: safeJsonParse<string[]>(r.tags_json, []) })).filter((r) => (!tag ? true : r.tags.includes(tag)))

  const profileRow = await db.get<any>('SELECT website_url, created_at FROM company_profile WHERE business_id = ?', [businessId])
  const businessWebsiteUrl = profileRow?.website_url ? String(profileRow.website_url) : ''
  const businessProfileCreatedAt = profileRow?.created_at ? new Date(String(profileRow.created_at)) : null

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Leads')
  ws.columns = [
    { header: 'lead_id', key: 'lead_id', width: 20 },
    { header: 'created_at', key: 'created_at', width: 20 },
    { header: 'status', key: 'status', width: 12 },
    { header: 'trade_id', key: 'trade_id', width: 12 },
    { header: 'request_type', key: 'request_type', width: 18 },
    { header: 'urgency', key: 'urgency', width: 10 },
    { header: 'channel_preference', key: 'channel_preference', width: 18 },
    { header: 'first_name', key: 'first_name', width: 16 },
    { header: 'phone_e164', key: 'phone_e164', width: 16 },
    { header: 'email', key: 'email', width: 24 },
    { header: 'city', key: 'city', width: 14 },
    { header: 'postal_code', key: 'postal_code', width: 10 },
    { header: 'address', key: 'address', width: 24 },
    { header: 'description', key: 'description', width: 40 },
    { header: 'photos_count', key: 'photos_count', width: 12 },
    { header: 'score', key: 'score', width: 8 },
    { header: 'decision', key: 'decision', width: 14 },
    { header: 'tags', key: 'tags', width: 18 },
    { header: 'business_website_url', key: 'business_website_url', width: 28 },
    { header: 'business_profile_created_at', key: 'business_profile_created_at', width: 20 },
  ]

  for (const r of items) {
    ws.addRow({
      lead_id: r.lead_id,
      created_at: r.created_at ? new Date(String(r.created_at)) : null,
      status: r.status,
      trade_id: r.trade_id,
      request_type: r.request_type,
      urgency: r.urgency,
      channel_preference: r.channel_preference,
      first_name: r.first_name,
      phone_e164: r.phone_e164,
      email: r.email,
      city: r.city,
      postal_code: r.postal_code,
      address: r.address,
      description: r.description,
      photos_count: r.photos_count,
      score: r.score,
      decision: r.decision,
      tags: (r.tags || []).join('|'),
      business_website_url: businessWebsiteUrl,
      business_profile_created_at: businessProfileCreatedAt,
    })
  }

  const dateFmt = 'dd/mm/yyyy hh:mm'
  ws.getColumn('created_at').numFmt = dateFmt
  ws.getColumn('business_profile_created_at').numFmt = dateFmt

  await addAudit(db, req, businessId, { action: 'leads.export.xlsx', target_type: 'lead', data: { status: status || null, tag: tag || null } })

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename="leads-${businessId}.xlsx"`)
  const buf = await wb.xlsx.writeBuffer()
  res.status(200).send(Buffer.from(buf))
})
```

- [ ] **Step 4: Run test (Verify GREEN)**

Run:
```bash
cd app
npx vitest run server/routes/v1/backoffice.leadsExportXlsx.test.ts --reporter dot --maxWorkers=1
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/server/routes/v1/backoffice.ts app/server/routes/v1/backoffice.leadsExportXlsx.test.ts
git commit -m "feat: add leads xlsx export"
```

---

### Task 4: Front — ajouter “Exporter Excel” dans Demandes

**Files:**
- Modify: [Inbox.tsx](file:///Users/b.delb/Documents/trae_projects/devis-express/app/src/pages/backoffice/Inbox.tsx)
- Create: `app/src/pages/backoffice/Inbox.exportXlsx.test.tsx`

- [ ] **Step 1: Test UI (RED)**

Créer `app/src/pages/backoffice/Inbox.exportXlsx.test.tsx`:

```tsx
import { describe, expect, it, vi, afterEach } from 'vitest'
import { fireEvent, render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Inbox from '@/pages/backoffice/Inbox'
import { useAuthStore } from '@/store/authStore'

describe('Backoffice Inbox export xlsx', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    useAuthStore.getState().setToken(null)
    cleanup()
  })

  it('propose un export Excel et appelle l’endpoint .xlsx', async () => {
    useAuthStore.getState().setToken('t')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: any) => {
        const url = String(input)
        if (url.includes('/api/v1/backoffice/b1/leads?')) return new Response(JSON.stringify({ items: [], total: 0 }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/me')) return new Response(JSON.stringify({ role: 'owner' }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/settings')) return new Response(JSON.stringify({ config: { settings: {} } }), { status: 200 })
        if (url.includes('/api/v1/backoffice/b1/leads/export.xlsx')) return new Response(new Uint8Array([1, 2, 3]), { status: 200 })
        return new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
      }),
    )

    render(
      <MemoryRouter initialEntries={['/backoffice/b1']}>
        <Routes>
          <Route path="/backoffice/:businessId" element={<Inbox />} />
        </Routes>
      </MemoryRouter>,
    )

    const btn = await screen.findByRole('button', { name: 'Exporter Excel' })
    fireEvent.click(btn)
    expect((fetch as any).mock.calls.some((c: any[]) => String(c[0]).includes('/leads/export.xlsx'))).toBe(true)
  })
})
```

- [ ] **Step 2: Run test (Verify RED)**

Run:
```bash
cd app
npx vitest run src/pages/backoffice/Inbox.exportXlsx.test.tsx --reporter dot
```
Expected: FAIL (bouton absent / endpoint non appelé).

- [ ] **Step 3: Implémenter le bouton (GREEN)**

Dans [Inbox.tsx](file:///Users/b.delb/Documents/trae_projects/devis-express/app/src/pages/backoffice/Inbox.tsx):

1) Ajouter une fonction `exportXlsx()` (sur le même modèle que `exportCsv()`), mais cible:
`/api/v1/backoffice/${businessId}/leads/export.xlsx?${query}` et `a.download = leads-${businessId}.xlsx`.

2) Ajouter un bouton visible quand `canExport`:
- label: `Exporter CSV`
- label: `Exporter Excel`

- [ ] **Step 4: Run test (Verify GREEN)**

Run:
```bash
cd app
npx vitest run src/pages/backoffice/Inbox.exportXlsx.test.tsx --reporter dot
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/src/pages/backoffice/Inbox.tsx app/src/pages/backoffice/Inbox.exportXlsx.test.tsx
git commit -m "feat: add Excel export button in backoffice inbox"
```

---

### Task 5: Validation globale

**Files:**
- (tests + code ci-dessus)

- [ ] **Step 1: Typecheck**

Run:
```bash
cd app
./node_modules/.bin/tsc --noEmit
```
Expected: exit 0

- [ ] **Step 2: Front tests**

Run:
```bash
cd app
npx vitest run src --reporter dot
```
Expected: PASS

- [ ] **Step 3: Server tests**

Run:
```bash
cd app
npx vitest run server --reporter dot --maxWorkers=1
```
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git status
```
Expected: clean

