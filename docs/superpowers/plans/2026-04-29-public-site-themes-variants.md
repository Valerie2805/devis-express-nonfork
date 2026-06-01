# Public Site Themes + Variants (V1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 12 predefined themes (palette + typography) and section variants (hero + pricing) for the public site, configurable in Backoffice Settings and previewable via `?theme=`.

**Architecture:** Frontend-driven theming for the public site using CSS variables + a theme catalog; config stored in `business.config_json.appearance`. Backoffice exposes an “Apparence” editor that patches settings.

**Tech Stack:** React, react-router, Tailwind CSS, Vitest + React Testing Library

---

### Task 1: Theme catalog + CSS tokens

**Files:**
- Create: [themes.ts](file:///Users/b.delb/Documents/trae_projects/devis-express/app/src/site/themes.ts)
- Modify: [index.css](file:///Users/b.delb/Documents/trae_projects/devis-express/app/src/index.css)

- [ ] **Step 1: Create the catalog (`theme_id` → vars + fonts)**

Create `app/src/site/themes.ts` exporting:
- `THEME_IDS` (`as const`)
- `ThemeId` union
- `THEMES` mapping `ThemeId` → `{ label, vars, fonts }`
- `getTheme(themeId: string | null | undefined)` fallback `ivory`

- [ ] **Step 2: Add CSS helper classes scoped to the public site**

In `index.css` add:
- `@import` for a limited set of Google Fonts (reused across themes)
- `.site-theme` class applying `background`, `color`, `font-family`, and CSS variables

- [ ] **Step 3: Typecheck**

Run:
```bash
cd app
npm run check
```

---

### Task 2: Apply theme on public site + `?theme=` override

**Files:**
- Modify: [SiteShell.tsx](file:///Users/b.delb/Documents/trae_projects/devis-express/app/src/components/site/SiteShell.tsx)
- Modify: [BlueprintPage.tsx](file:///Users/b.delb/Documents/trae_projects/devis-express/app/src/components/site/BlueprintPage.tsx)
- Modify: [QuoteForm.tsx](file:///Users/b.delb/Documents/trae_projects/devis-express/app/src/components/site/QuoteForm.tsx)

- [ ] **Step 1: Read `appearance` from config and pass it to `SiteShell`**

- [ ] **Step 2: In `SiteShell`, compute `themeId`**

Priority order:
1. `?theme=<id>` if matches catalog
2. `config.appearance.theme_id`
3. default `ivory`

Apply CSS variables via `style` on the root `.site-theme` wrapper.

- [ ] **Step 3: Replace hardcoded dark colors in public site components**

Update site public components to use CSS token classes (surface, border, muted, primary) instead of `bg-zinc-950` / `text-white` / etc.

---

### Task 3: Section variants (hero + pricing)

**Files:**
- Modify: [BlueprintPage.tsx](file:///Users/b.delb/Documents/trae_projects/devis-express/app/src/components/site/BlueprintPage.tsx)

- [ ] **Step 1: Implement hero variants**

Add support for `appearance.sections.hero.variant` with at least:
- `classic` (current)
- `split` (headline left, CTAs right, stronger surface)
- `centered` (center alignment, CTAs centered)

- [ ] **Step 2: Implement pricing variants**

Interpret “pricing” V1 as styling for tarif/service cards on the tarifs page:
- `cards` (current)
- `table` (more compact rows)
- `minimal` (lighter borders, no heavy panels)

---

### Task 4: Backoffice “Apparence” editor

**Files:**
- Modify: [Settings.tsx](file:///Users/b.delb/Documents/trae_projects/devis-express/app/src/pages/backoffice/Settings.tsx)

- [ ] **Step 1: Add UI block “Apparence”**

Dropdowns:
- Thème (12 options)
- Hero variant (3)
- Tarifs variant (3)

- [ ] **Step 2: Persist to config**

Ensure `save()` includes `appearance: config.appearance` in the PATCH body.

---

### Task 5: Tests

**Files:**
- Create: `app/src/components/site/SiteShell.theme.test.tsx`
- Modify/Create: backoffice settings test if needed

- [ ] **Step 1: Test `?theme=` override**
- [ ] **Step 2: Test persistence (backoffice saves appearance)**

---

### Task 6: Regression pass

- [ ] Run:
```bash
cd app
npm run check
npx vitest run server --reporter dot
npx vitest run src/pages --reporter dot
```

