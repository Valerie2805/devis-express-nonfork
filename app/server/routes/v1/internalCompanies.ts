import type { Request, Response } from 'express'
import { getDb } from '../../db.js'
import { newId, nowIso } from '../../utils.js'
import { createRouter } from '../router.js'
import { requireInternalAuth } from '../../internal/middleware.js'
import { runPageSpeed } from '../../company/pagespeed.js'
import { scrapeLegalEmail } from '../../company/legalEmail.js'
import { upsertCompanyProfile } from '../../company/companyProfile.js'

const router = createRouter()

type CompanyItem = {
  company_key: string
  type: 'business' | 'prospect'
  name: string
  city: string | null
  website_url: string | null
  legal_contact_email: string | null
  headcount_range: string | null
  naf_code: string | null
  sector_label: string | null
  annual_revenue_eur: number | null
  website_created_at: string | null
  website_redesign_at: string | null
  pagespeed: {
    mobile: { performance_score: number | null; accessibility_score: number | null; seo_score: number | null; best_practices_score: number | null } | null
    desktop: { performance_score: number | null; accessibility_score: number | null; seo_score: number | null; best_practices_score: number | null } | null
    worst_accessibility: number | null
  }
}

function parseCompanyKey(rawKey: string) {
  const isBusiness = rawKey.startsWith('business:')
  const isProspect = rawKey.startsWith('prospect:')
  const id = rawKey.slice(rawKey.indexOf(':') + 1)
  if (!id || (!isBusiness && !isProspect)) return null
  return { isBusiness, isProspect, id }
}

export async function listCompaniesHandler(req: Request, res: Response) {
  const q = String((req.query as any).q || '').trim().toLowerCase()
  const accessibilityLt = (req.query as any).accessibility_lt !== undefined ? Number((req.query as any).accessibility_lt) : null
  const typeFilter = String((req.query as any).type || 'all').trim().toLowerCase()

  const db = await getDb()
  const businesses = typeFilter === 'prospect' ? [] : await db.all<any>('SELECT business_id, company_name, city FROM business', [])
  const prospects = typeFilter === 'business' ? [] : await db.all<any>('SELECT prospect_id, name, city, website FROM prospect', [])
  const profiles = await db.all<any>(
    'SELECT business_id, prospect_id, website_url, legal_contact_email, headcount_range, naf_code, sector_label, annual_revenue_eur, website_created_at, website_redesign_at FROM company_profile',
    [],
  )
  const runs = await db.all<any>(
    'SELECT business_id, prospect_id, strategy, performance_score, accessibility_score, seo_score, best_practices_score, fetched_at FROM company_pagespeed_run',
    [],
  )

  const profileByBusiness = new Map<string, any>()
  const profileByProspect = new Map<string, any>()
  for (const p of profiles) {
    if (p.business_id) profileByBusiness.set(String(p.business_id), p)
    if (p.prospect_id) profileByProspect.set(String(p.prospect_id), p)
  }

  type RunKey = string
  const latestByKeyStrategy = new Map<RunKey, any>()
  function mkKey(businessId: string | null, prospectId: string | null, strategy: string) {
    return `${businessId || ''}:${prospectId || ''}:${strategy}`
  }
  for (const r of runs) {
    const key = mkKey(r.business_id ? String(r.business_id) : null, r.prospect_id ? String(r.prospect_id) : null, String(r.strategy || ''))
    const cur = latestByKeyStrategy.get(key)
    if (!cur || String(r.fetched_at || '') > String(cur.fetched_at || '')) latestByKeyStrategy.set(key, r)
  }

  function normalizePagespeed(businessId: string | null, prospectId: string | null) {
    const mobile = latestByKeyStrategy.get(mkKey(businessId, prospectId, 'mobile')) || null
    const desktop = latestByKeyStrategy.get(mkKey(businessId, prospectId, 'desktop')) || null
    const ma = mobile && mobile.accessibility_score !== null && mobile.accessibility_score !== undefined ? Number(mobile.accessibility_score) : null
    const da = desktop && desktop.accessibility_score !== null && desktop.accessibility_score !== undefined ? Number(desktop.accessibility_score) : null
    const worst = ma !== null && da !== null ? Math.min(ma, da) : ma !== null ? ma : da !== null ? da : null
    return {
      mobile: mobile
        ? {
            performance_score: mobile.performance_score !== undefined && mobile.performance_score !== null ? Number(mobile.performance_score) : null,
            accessibility_score: ma,
            seo_score: mobile.seo_score !== undefined && mobile.seo_score !== null ? Number(mobile.seo_score) : null,
            best_practices_score: mobile.best_practices_score !== undefined && mobile.best_practices_score !== null ? Number(mobile.best_practices_score) : null,
          }
        : null,
      desktop: desktop
        ? {
            performance_score: desktop.performance_score !== undefined && desktop.performance_score !== null ? Number(desktop.performance_score) : null,
            accessibility_score: da,
            seo_score: desktop.seo_score !== undefined && desktop.seo_score !== null ? Number(desktop.seo_score) : null,
            best_practices_score: desktop.best_practices_score !== undefined && desktop.best_practices_score !== null ? Number(desktop.best_practices_score) : null,
          }
        : null,
      worst_accessibility: worst,
    }
  }

  const out: CompanyItem[] = []

  for (const b of businesses) {
    const id = String(b.business_id)
    const p = profileByBusiness.get(id) || {}
    const websiteUrl = p.website_url ? String(p.website_url) : null
    const item: CompanyItem = {
      company_key: `business:${id}`,
      type: 'business',
      name: String(b.company_name || ''),
      city: b.city ? String(b.city) : null,
      website_url: websiteUrl,
      legal_contact_email: p.legal_contact_email ? String(p.legal_contact_email) : null,
      headcount_range: p.headcount_range ? String(p.headcount_range) : null,
      naf_code: p.naf_code ? String(p.naf_code) : null,
      sector_label: p.sector_label ? String(p.sector_label) : null,
      annual_revenue_eur: p.annual_revenue_eur !== undefined && p.annual_revenue_eur !== null ? Number(p.annual_revenue_eur) : null,
      website_created_at: p.website_created_at ? String(p.website_created_at) : null,
      website_redesign_at: p.website_redesign_at ? String(p.website_redesign_at) : null,
      pagespeed: normalizePagespeed(id, null),
    }
    out.push(item)
  }

  for (const pr of prospects) {
    const id = String(pr.prospect_id)
    const p = profileByProspect.get(id) || {}
    const websiteUrl = p.website_url ? String(p.website_url) : pr.website ? String(pr.website) : null
    const item: CompanyItem = {
      company_key: `prospect:${id}`,
      type: 'prospect',
      name: String(pr.name || ''),
      city: pr.city ? String(pr.city) : null,
      website_url: websiteUrl,
      legal_contact_email: p.legal_contact_email ? String(p.legal_contact_email) : null,
      headcount_range: p.headcount_range ? String(p.headcount_range) : null,
      naf_code: p.naf_code ? String(p.naf_code) : null,
      sector_label: p.sector_label ? String(p.sector_label) : null,
      annual_revenue_eur: p.annual_revenue_eur !== undefined && p.annual_revenue_eur !== null ? Number(p.annual_revenue_eur) : null,
      website_created_at: p.website_created_at ? String(p.website_created_at) : null,
      website_redesign_at: p.website_redesign_at ? String(p.website_redesign_at) : null,
      pagespeed: normalizePagespeed(null, id),
    }
    out.push(item)
  }

  let filtered = out
  if (q) {
    filtered = filtered.filter((i) => {
      const s = `${i.name} ${i.city || ''} ${i.website_url || ''}`.toLowerCase()
      return s.includes(q)
    })
  }
  if (accessibilityLt !== null && Number.isFinite(accessibilityLt)) {
    filtered = filtered.filter((i) => i.pagespeed.worst_accessibility !== null && (i.pagespeed.worst_accessibility as number) < accessibilityLt)
  }

  res.status(200).json({ items: filtered })
}

export async function runPagespeedHandler(req: Request, res: Response) {
  const rawKey = String(req.params.companyKey || '').trim()
  const db = await getDb()
  const parsed = parseCompanyKey(rawKey)
  if (!parsed) {
    res.status(400).json({ success: false, error: 'Invalid companyKey' })
    return
  }
  const { isBusiness, isProspect, id } = parsed

  let websiteUrl: string | null = null
  if (isBusiness) {
    const p = await db.get<any>('SELECT website_url FROM company_profile WHERE business_id = ?', [id])
    websiteUrl = p?.website_url ? String(p.website_url) : null
  } else {
    const p = await db.get<any>('SELECT website_url FROM company_profile WHERE prospect_id = ?', [id])
    websiteUrl = p?.website_url ? String(p.website_url) : null
    if (!websiteUrl) {
      const pr = await db.get<any>('SELECT website FROM prospect WHERE prospect_id = ?', [id])
      websiteUrl = pr?.website ? String(pr.website) : null
    }
  }

  if (!websiteUrl) {
    res.status(400).json({ success: false, error: 'Missing website_url' })
    return
  }

  const now = nowIso()
  let mobile: any
  let desktop: any
  try {
    mobile = await runPageSpeed(websiteUrl, 'mobile')
    desktop = await runPageSpeed(websiteUrl, 'desktop')
  } catch (e: any) {
    const status = Number(e?.status)
    if (status === 429) {
      res.status(429).json({ success: false, error: 'PageSpeed quota exceeded' })
      return
    }
    res.status(502).json({ success: false, error: 'PageSpeed error' })
    return
  }

  for (const [strategy, s] of [
    ['mobile', mobile],
    ['desktop', desktop],
  ] as const) {
    await db.run(
      `INSERT INTO company_pagespeed_run (
        run_id, business_id, prospect_id, strategy,
        performance_score, accessibility_score, seo_score, best_practices_score,
        raw_json, fetched_at
      ) VALUES (
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?
      )`,
      [
        newId(),
        isBusiness ? id : null,
        isProspect ? id : null,
        strategy,
        s.performance_score,
        s.accessibility_score,
        s.seo_score,
        s.best_practices_score,
        s.raw_json,
        now,
      ],
    )
  }

  res.status(200).json({ success: true })
}

export async function scrapeLegalEmailHandler(req: Request, res: Response) {
  const rawKey = String(req.params.companyKey || '').trim()
  const db = await getDb()
  const parsed = parseCompanyKey(rawKey)
  if (!parsed) {
    res.status(400).json({ success: false, error: 'Invalid companyKey' })
    return
  }
  const { isBusiness, isProspect, id } = parsed

  let websiteUrl: string | null = null
  if (isBusiness) {
    const p = await db.get<any>('SELECT website_url FROM company_profile WHERE business_id = ?', [id])
    websiteUrl = p?.website_url ? String(p.website_url) : null
  } else {
    const p = await db.get<any>('SELECT website_url FROM company_profile WHERE prospect_id = ?', [id])
    websiteUrl = p?.website_url ? String(p.website_url) : null
    if (!websiteUrl) {
      const pr = await db.get<any>('SELECT website FROM prospect WHERE prospect_id = ?', [id])
      websiteUrl = pr?.website ? String(pr.website) : null
    }
  }

  if (!websiteUrl) {
    res.status(400).json({ success: false, error: 'Missing website_url' })
    return
  }

  const out = await scrapeLegalEmail(websiteUrl)
  if (!out.email) {
    res.status(200).json({ found: false, email: null, legal_url: out.legal_url })
    return
  }

  await upsertCompanyProfile(db, isBusiness ? { business_id: id } : { prospect_id: id }, { legal_contact_email: out.email })
  res.status(200).json({ found: true, email: out.email, legal_url: out.legal_url })
}

export async function patchCompanyProfileHandler(req: Request, res: Response) {
  const rawKey = String(req.params.companyKey || '').trim()
  const parsed = parseCompanyKey(rawKey)
  if (!parsed) {
    res.status(400).json({ success: false, error: 'Invalid companyKey' })
    return
  }
  const { isBusiness, id } = parsed
  const body = (req.body || {}) as any
  const patch = {
    website_url: body.website_url !== undefined ? (body.website_url ? String(body.website_url) : null) : undefined,
    legal_contact_email: body.legal_contact_email !== undefined ? (body.legal_contact_email ? String(body.legal_contact_email) : null) : undefined,
    headcount_range: body.headcount_range !== undefined ? (body.headcount_range ? String(body.headcount_range) : null) : undefined,
    naf_code: body.naf_code !== undefined ? (body.naf_code ? String(body.naf_code) : null) : undefined,
    sector_label: body.sector_label !== undefined ? (body.sector_label ? String(body.sector_label) : null) : undefined,
    annual_revenue_eur: body.annual_revenue_eur !== undefined ? (body.annual_revenue_eur === null || body.annual_revenue_eur === '' ? null : Number(body.annual_revenue_eur)) : undefined,
    website_created_at: body.website_created_at !== undefined ? (body.website_created_at ? String(body.website_created_at) : null) : undefined,
    website_redesign_at: body.website_redesign_at !== undefined ? (body.website_redesign_at ? String(body.website_redesign_at) : null) : undefined,
  }
  if (patch.annual_revenue_eur !== undefined && patch.annual_revenue_eur !== null && !Number.isFinite(patch.annual_revenue_eur as any)) {
    res.status(400).json({ success: false, error: 'Invalid payload' })
    return
  }
  const db = await getDb()
  const profile = await upsertCompanyProfile(db, isBusiness ? { business_id: id } : { prospect_id: id }, patch)
  res.status(200).json({ profile })
}

router.get('/internal/companies', requireInternalAuth, listCompaniesHandler)
router.post('/internal/companies/:companyKey/pagespeed/run', requireInternalAuth, runPagespeedHandler)
router.post('/internal/companies/:companyKey/legal_email/scrape', requireInternalAuth, scrapeLegalEmailHandler)
router.patch('/internal/companies/:companyKey/profile', requireInternalAuth, patchCompanyProfileHandler)

export default router
