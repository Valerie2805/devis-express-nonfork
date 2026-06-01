import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useParams, useSearchParams } from 'react-router-dom'
import BackofficeShell from '@/components/backoffice/BackofficeShell'
import BackButton from '@/components/BackButton'
import { apiFetch, authHeaders } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { THEME_IDS, THEMES } from '@/site/themes'
import BlueprintPage from '@/components/site/BlueprintPage'

type Review = { review_id: string; author_name: string; rating: number; text: string; created_at: string }
type Photo = { photo_id: string; url: string; created_at: string }
type Me = { business_id: string; role: 'owner' | 'staff'; user_id: string | null }
type User = {
  user_id: string
  username: string
  email: string | null
  role: 'owner' | 'staff'
  mfa_enabled: boolean
  mfa_phone_e164: string | null
  created_at: string
}
type CompanyProfile = {
  business_id: string
  website_url: string | null
  legal_contact_email: string | null
  headcount_range: string | null
  naf_code: string | null
  sector_label: string | null
  website_created_at: string | null
  website_redesign_at: string | null
}

export default function Settings() {
  const { businessId = '' } = useParams()
  const [sp] = useSearchParams()
  const location = useLocation()
  const { token } = useAuthStore()
  const [config, setConfig] = useState<any>(null)
  const [proof, setProof] = useState<{ reviews: Review[]; photos: Photo[] } | null>(null)
  const [me, setMe] = useState<Me | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [siteAudits, setSiteAudits] = useState<{ items: any[] } | null>(null)
  const [siteAuditLink, setSiteAuditLink] = useState<{ public_url: string; docx_url: string } | null>(null)
  const [siteAuditLoading, setSiteAuditLoading] = useState(false)
  const [siteAuditError, setSiteAuditError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [proofSaving, setProofSaving] = useState(false)
  const [proofError, setProofError] = useState<string | null>(null)
  const [teamSaving, setTeamSaving] = useState(false)
  const [teamError, setTeamError] = useState<string | null>(null)
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null)
  const [companyProfileSaving, setCompanyProfileSaving] = useState(false)
  const [companyProfileError, setCompanyProfileError] = useState<string | null>(null)
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState(false)

  const [authorName, setAuthorName] = useState('')
  const [rating, setRating] = useState(5)
  const [text, setText] = useState('')
  const [photoUrl, setPhotoUrl] = useState('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [heroImageFile, setHeroImageFile] = useState<File | null>(null)
  const [heroImageUploading, setHeroImageUploading] = useState(false)
  const [heroImageError, setHeroImageError] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewNonce, setPreviewNonce] = useState(1)
  const [staffUsername, setStaffUsername] = useState('')
  const [staffEmail, setStaffEmail] = useState('')
  const [staffPassword, setStaffPassword] = useState('')
  const [mfaPhones, setMfaPhones] = useState<Record<string, string>>({})
  const isOwner = me?.role === 'owner'
  const staffPerms = config?.settings?.staff_permissions || {}
  const canWriteSettings = me?.role === 'owner' || Boolean(staffPerms.settings_write)
  const canWriteProof = me?.role === 'owner' || Boolean(staffPerms.proof_write)
  const [pipelineStagesText, setPipelineStagesText] = useState('[]')
  const [automationRulesText, setAutomationRulesText] = useState('[]')
  const [sequencesText, setSequencesText] = useState('[]')
  const [automationError, setAutomationError] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [aiResult, setAiResult] = useState<any>(null)

  const fromAuditId = useMemo(() => String(sp.get('from_audit') || '').trim(), [sp])
  const shouldOpenPreview = useMemo(() => String(sp.get('open_preview') || '').trim() === '1', [sp])
  const [auditPrefill, setAuditPrefill] = useState<any>(null)
  const [auditPrefillError, setAuditPrefillError] = useState<string | null>(null)
  const [auditPrefillApplied, setAuditPrefillApplied] = useState(false)
  const [pendingOpenPreview, setPendingOpenPreview] = useState(false)
  const [createSiteError, setCreateSiteError] = useState<string | null>(null)
  const [createSiteSuccess, setCreateSiteSuccess] = useState(false)

  const isCreateSite = useMemo(() => String(location.pathname || '').endsWith('/create-site'), [location.pathname])
  const [tradeOptions, setTradeOptions] = useState<Array<{ trade_id: string; label: string }>>([])
  const [tradeOptionsError, setTradeOptionsError] = useState<string | null>(null)
  const [livePreviewLoading, setLivePreviewLoading] = useState(false)
  const [livePreviewError, setLivePreviewError] = useState<string | null>(null)
  const [livePreviewData, setLivePreviewData] = useState<any>(null)
  const livePreviewAbort = useRef<AbortController | null>(null)

  const siteBaseUrl = useMemo(() => {
    if (typeof window === 'undefined') return ''
    return `${window.location.origin}/site/${businessId}`
  }, [businessId])

  const trackingLinks = useMemo(() => {
    const base = siteBaseUrl
    if (!base) return null
    return {
      gbp: `${base}?utm_source=google_business&utm_medium=organic&utm_campaign=profile`,
      ads: `${base}?utm_source=google_ads&utm_medium=cpc&utm_campaign=local`,
      flyers: `${base}?utm_source=flyer&utm_medium=offline&utm_campaign=qr`,
    }
  }, [siteBaseUrl])

  const jsonUrlFromDocx = (docxUrl: string) => docxUrl.replace('/docx?', '/json?')

  function normalizeSiteCopyOverride(v: any) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null
    const out: any = { ...v }
    const hero = out.hero && typeof out.hero === 'object' && !Array.isArray(out.hero) ? { ...out.hero } : {}
    const h1 = String(hero.h1 || '').trim()
    const subtitle = String(hero.subtitle || '').trim()
    const ctasRaw = Array.isArray(hero.ctas) ? hero.ctas.map((x: any) => String(x || '').trim()) : []
    const ctas = ctasRaw.filter(Boolean).slice(0, 3)

    if (h1) hero.h1 = h1
    else delete hero.h1
    if (subtitle) hero.subtitle = subtitle
    else delete hero.subtitle
    if (ctas.length) hero.ctas = ctas
    else delete hero.ctas

    if (Object.keys(hero).length) out.hero = hero
    else delete out.hero

    return Object.keys(out).length ? out : null
  }

  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.all([
      apiFetch<{ config: any }>(`/api/v1/backoffice/${businessId}/settings`, { headers: { ...authHeaders(token) } }),
      apiFetch<{ reviews: Review[]; photos: Photo[] }>(`/api/v1/backoffice/${businessId}/proof`, { headers: { ...authHeaders(token) } }),
      apiFetch<Me>(`/api/v1/backoffice/${businessId}/me`, { headers: { ...authHeaders(token) } }),
      apiFetch<{ profile: CompanyProfile }>(`/api/v1/backoffice/${businessId}/company_profile`, { headers: { ...authHeaders(token) } }),
    ])
      .then(async ([settingsRes, proofRes, meRes, companyRes]) => {
        if (!alive) return
        setConfig(settingsRes.config)
        setPipelineStagesText(JSON.stringify(settingsRes.config?.settings?.pipeline_stages || [], null, 2))
        setAutomationRulesText(JSON.stringify(settingsRes.config?.settings?.automation_rules || [], null, 2))
        setSequencesText(JSON.stringify(settingsRes.config?.settings?.sequences || [], null, 2))
        setProof(proofRes)
        setMe(meRes)
        setCompanyProfile(companyRes.profile || null)
        if (meRes.role === 'owner') {
          const usersRes = await apiFetch<{ users: User[] }>(`/api/v1/backoffice/${businessId}/users`, { headers: { ...authHeaders(token) } })
          if (!alive) return
          setUsers(usersRes.users)
          setMfaPhones(Object.fromEntries(usersRes.users.map((u) => [u.user_id, u.mfa_phone_e164 || ''])))

          try {
            const auditsRes = await apiFetch<{ items: any[] }>(`/api/v1/backoffice/${businessId}/site_audits?limit=1`, { headers: { ...authHeaders(token) } })
            if (!alive) return
            setSiteAudits({ items: auditsRes.items || [] })
          } catch {
            if (!alive) return
            setSiteAudits({ items: [] })
          }
        }
        setError(null)
      })
      .catch((e) => {
        if (!alive) return
        setError(e instanceof Error ? e.message : 'Erreur')
      })
      .finally(() => {
        if (!alive) return
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [businessId, token])

  useEffect(() => {
    let alive = true
    setTradeOptionsError(null)
    apiFetch<{ trades: Array<{ trade_id: string; label: string }> }>(`/api/v1/backoffice/${businessId}/specs_trades`, { headers: { ...authHeaders(token) } })
      .then((d) => {
        if (!alive) return
        const items = Array.isArray(d?.trades) ? d.trades : []
        setTradeOptions(items)
      })
      .catch((e) => {
        if (!alive) return
        setTradeOptions([])
        setTradeOptionsError(e instanceof Error ? e.message : 'Erreur')
      })
    return () => {
      alive = false
    }
  }, [businessId, token])

  function inferTradeIdFromAudit(a: any) {
    const parts: string[] = []
    if (a?.source_url) parts.push(String(a.source_url))
    if (a?.audit?.profile?.company_name) parts.push(String(a.audit.profile.company_name))
    const sv = a?.audit?.profile?.services
    if (Array.isArray(sv)) parts.push(sv.map((x: any) => String(x)).join(' '))
    const ex = a?.audit?.executive_summary
    if (Array.isArray(ex)) parts.push(ex.map((x: any) => (x && typeof x === 'object' ? String(x.text || '') : String(x))).join(' '))
    const text = parts.join(' ').toLowerCase()
    if (!text.trim()) return null
    if (/(fleur|fleuriste|bouquet|plante|mariage|deuil|livraison)/i.test(text)) return 'fleuriste'
    if (/(plomb|chauffag|chaudi|fuite|debouch|débouch|wc|canalis)/i.test(text)) return 'plombier_chauffagiste'
    if (/(serrur|serrure|porte|cle\b|clé|cylindre|effraction)/i.test(text)) return 'serrurier'
    if (/(electr|électr|disjonct|tableau|prise|courant)/i.test(text)) return 'electricien'
    if (/(toiture|couvreur|zing|goutti)/i.test(text)) return 'couvreur_zingueur'
    if (/(pac\b|pompe a chaleur|pompe à chaleur|clim|climatisation)/i.test(text)) return 'pac_clim_chauffage'
    if (/(vitre|vitrier|vitrage|fenetre|fenêtre)/i.test(text)) return 'vitrier'
    if (/(assain|fosse|canalis|egout|égout)/i.test(text)) return 'debouchage_assainissement'
    if (/(volet|porte de garage|store)/i.test(text)) return 'volets_portes_garage'
    if (/(nuisible|rat|souris|cafard|punaises|guepe|guêpe|frelon)/i.test(text)) return 'anti_nuisibles'
    if (/(ramonage|cheminee|cheminée|poele|poêle)/i.test(text)) return 'ramonage_poeles_cheminees'
    return null
  }

  useEffect(() => {
    if (!fromAuditId) return
    setAuditPrefillApplied(false)
    setAuditPrefill(null)
    setAuditPrefillError(null)
    setPendingOpenPreview(false)
    setCreateSiteError(null)
  }, [fromAuditId])

  useEffect(() => {
    if (!fromAuditId) return
    let alive = true
    setAuditPrefillError(null)
    apiFetch<any>(`/api/v1/backoffice/${businessId}/site_audits/${encodeURIComponent(fromAuditId)}`, { headers: { ...authHeaders(token) } })
      .then((d) => {
        if (!alive) return
        setAuditPrefill(d)
      })
      .catch((e) => {
        if (!alive) return
        setAuditPrefill(null)
        setAuditPrefillError(e instanceof Error ? e.message : 'Erreur')
      })
    return () => {
      alive = false
    }
  }, [businessId, token, fromAuditId])

  useEffect(() => {
    if (!config) return
    if (!fromAuditId) return
    if (!auditPrefill || auditPrefillApplied) return
    const audit = auditPrefill?.audit
    const currentSiteUrl = String(audit?.meta?.current_site_url || auditPrefill?.source_url || '').trim()
    const companyName = String(audit?.profile?.company_name || '').trim()
    const logoUrl = String(audit?.profile?.logo_url || '').trim()
    let fallbackName = ''
    if (!companyName && currentSiteUrl) {
      try {
        fallbackName = new URL(currentSiteUrl).hostname.replace(/^www\./, '')
      } catch {}
    }
    const resolvedName = companyName || fallbackName
    const next: any = { ...config }
    const inferredTrade = inferTradeIdFromAudit(auditPrefill)
    if (inferredTrade && isCreateSite) next.trade_id = inferredTrade
    if (resolvedName && (isCreateSite || !String(next.company_name || '').trim())) next.company_name = resolvedName
    if (logoUrl && (isCreateSite || !String(next.logo_url || '').trim())) next.logo_url = logoUrl
    if (currentSiteUrl) {
      next.settings = {
        ...(next.settings || {}),
        onboarding: { ...(next.settings?.onboarding || {}), current_site_url: currentSiteUrl },
      }
    }
    setConfig(next)
    if (companyProfile && currentSiteUrl && (isCreateSite || !String(companyProfile.website_url || '').trim())) {
      setCompanyProfile({ ...companyProfile, website_url: currentSiteUrl })
    }
    setAuditPrefillApplied(true)
    if (shouldOpenPreview) setPendingOpenPreview(true)
  }, [config, fromAuditId, auditPrefill, auditPrefillApplied, companyProfile, shouldOpenPreview, isCreateSite])

  useEffect(() => {
    if (!pendingOpenPreview) return
    if (!config) return
    setPendingOpenPreview(false)
    openPreview()
  }, [pendingOpenPreview, config])

  async function refreshLivePreview() {
    if (!isCreateSite) return
    if (!config) return
    if (!token) return
    if (!canWriteSettings) return
    if (livePreviewAbort.current) livePreviewAbort.current.abort()
    const controller = new AbortController()
    livePreviewAbort.current = controller
    setLivePreviewLoading(true)
    setLivePreviewError(null)
    try {
      const res = await apiFetch<any>(`/api/v1/backoffice/${businessId}/site_preview_config`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({
          config: {
            pricing: config.pricing,
            zones: config.zones,
            services: config.services,
            settings: config.settings,
            appearance: config.appearance || null,
            logo_url: config.logo_url || null,
            branding: config.branding || null,
            site_copy_override: normalizeSiteCopyOverride(config.site_copy_override || null),
            tarifs_override: config.tarifs_override || null,
            tarifs_common_override: config.tarifs_common_override || null,
            trade_id: config.trade_id || null,
            company_name: config.company_name || null,
            city: config.city || null,
            zone_label: config.zone_label || null,
            phone_e164: config.phone_e164 || null,
            whatsapp_e164: config.whatsapp_e164 || null,
            availability: config.availability || null,
          },
        }),
      })
      setLivePreviewData(res)
      setLivePreviewError(null)
    } catch (e) {
      const name = e && typeof e === 'object' && 'name' in e ? String((e as any).name) : ''
      if (name === 'AbortError') return
      setLivePreviewData(null)
      setLivePreviewError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setLivePreviewLoading(false)
    }
  }

  useEffect(() => {
    if (!isCreateSite) return
    if (!config) return
    let t: number | null = null
    t = window.setTimeout(() => {
      void refreshLivePreview()
    }, 700)
    return () => {
      if (t) window.clearTimeout(t)
    }
  }, [isCreateSite, businessId, token, canWriteSettings, config])

  function openSite() {
    if (!siteBaseUrl) return
    const w = window.open(siteBaseUrl, '_blank', 'noopener,noreferrer')
    if (!w) window.location.href = siteBaseUrl
  }

  async function validateAndSaveSite() {
    if (!canWriteSettings) return
    setCreateSiteError(null)
    setCreateSiteSuccess(false)
    try {
      await save()
      await saveCompanyProfile()
      setCreateSiteSuccess(true)
      void refreshLivePreview()
    } catch (e) {
      setCreateSiteError(e instanceof Error ? e.message : 'Erreur')
    }
  }

  async function refreshSiteAudits() {
    if (!me || me.role !== 'owner') return
    const auditsRes = await apiFetch<{ items: any[] }>(`/api/v1/backoffice/${businessId}/site_audits?limit=1`, { headers: { ...authHeaders(token) } })
    setSiteAudits({ items: auditsRes.items || [] })
  }

  useEffect(() => {
    if (!isOwner) return
    const it = siteAudits?.items?.[0]
    const status = String(it?.status || '')
    if (status !== 'queued' && status !== 'running') return
    const id = window.setInterval(() => {
      refreshSiteAudits().catch(() => {})
    }, 2500)
    return () => window.clearInterval(id)
  }, [isOwner, siteAudits?.items?.[0]?.status])

  async function createSiteAudit() {
    if (!me || me.role !== 'owner') return
    setSiteAuditLoading(true)
    setSiteAuditError(null)
    setSiteAuditLink(null)
    try {
      const url = String(config?.settings?.onboarding?.current_site_url || '').trim()
      const res = await apiFetch<{ audit_id: string; public_url: string; docx_url: string }>(`/api/v1/backoffice/${businessId}/site_audits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({ source_url: url }),
      })
      setSiteAuditLink({ public_url: res.public_url, docx_url: res.docx_url })
      await refreshSiteAudits()
    } catch (e) {
      setSiteAuditError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSiteAuditLoading(false)
    }
  }

  async function rotateSiteAuditLink(auditId: string, opts?: { open?: boolean }) {
    if (!me || me.role !== 'owner') return
    setSiteAuditLoading(true)
    setSiteAuditError(null)
    try {
      const res = await apiFetch<{ public_url: string; docx_url: string }>(`/api/v1/backoffice/${businessId}/site_audits/${auditId}/public_link`, {
        method: 'POST',
        headers: { ...authHeaders(token) },
      })
      setSiteAuditLink({ public_url: res.public_url, docx_url: res.docx_url })
      if (opts?.open) window.open(res.public_url, '_blank', 'noopener,noreferrer')
    } catch (e) {
      setSiteAuditError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSiteAuditLoading(false)
    }
  }

  async function downloadSiteAuditJson(auditId: string) {
    if (!me || me.role !== 'owner') return
    setSiteAuditLoading(true)
    setSiteAuditError(null)
    try {
      const res = await apiFetch<{ public_url: string; docx_url: string }>(`/api/v1/backoffice/${businessId}/site_audits/${auditId}/public_link`, {
        method: 'POST',
        headers: { ...authHeaders(token) },
      })
      setSiteAuditLink({ public_url: res.public_url, docx_url: res.docx_url })
      window.open(jsonUrlFromDocx(res.docx_url), '_blank', 'noopener,noreferrer')
    } catch (e) {
      setSiteAuditError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSiteAuditLoading(false)
    }
  }

  async function deleteSiteAudit(auditId: string) {
    if (!me || me.role !== 'owner') return
    if (!window.confirm('Supprimer cet audit ?')) return
    setSiteAuditLoading(true)
    setSiteAuditError(null)
    try {
      await apiFetch(`/api/v1/backoffice/${businessId}/site_audits/${auditId}`, { method: 'DELETE', headers: { ...authHeaders(token) } })
      setSiteAuditLink(null)
      await refreshSiteAudits()
    } catch (e) {
      setSiteAuditError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSiteAuditLoading(false)
    }
  }

  async function save() {
    if (!canWriteSettings) return
    setSaving(true)
    try {
      const normalizedSiteCopyOverride = normalizeSiteCopyOverride(config.site_copy_override || null)
      const next = await apiFetch<{ config: any }>(`/api/v1/backoffice/${businessId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({
          trade_id: config.trade_id,
          company_name: config.company_name,
          city: config.city,
          zone_label: config.zone_label,
          phone_e164: config.phone_e164,
          whatsapp_e164: config.whatsapp_e164 || null,
          email_notifications: config.email_notifications || null,
          pricing: config.pricing,
          zones: config.zones,
          services: config.services,
          settings: config.settings,
          appearance: config.appearance || null,
          logo_url: config.logo_url || null,
          branding: config.branding || null,
          site_copy_override: normalizedSiteCopyOverride,
          tarifs_override: config.tarifs_override || null,
          tarifs_common_override: config.tarifs_common_override || null,
        }),
      })
      setConfig(next.config)
      setPipelineStagesText(JSON.stringify(next.config?.settings?.pipeline_stages || [], null, 2))
      setAutomationRulesText(JSON.stringify(next.config?.settings?.automation_rules || [], null, 2))
      setSequencesText(JSON.stringify(next.config?.settings?.sequences || [], null, 2))
    } finally {
      setSaving(false)
    }
  }

  async function refreshProof() {
    const proofRes = await apiFetch<{ reviews: Review[]; photos: Photo[] }>(`/api/v1/backoffice/${businessId}/proof`, {
      headers: { ...authHeaders(token) },
    })
    setProof(proofRes)
  }

  async function refreshUsers() {
    if (!me || me.role !== 'owner') return
    const usersRes = await apiFetch<{ users: User[] }>(`/api/v1/backoffice/${businessId}/users`, { headers: { ...authHeaders(token) } })
    setUsers(usersRes.users)
    setMfaPhones(Object.fromEntries(usersRes.users.map((u) => [u.user_id, u.mfa_phone_e164 || ''])))
  }

  async function addStaff() {
    if (!me || me.role !== 'owner') return
    setTeamSaving(true)
    setTeamError(null)
    try {
      await apiFetch(`/api/v1/backoffice/${businessId}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({ username: staffUsername, email: staffEmail || null, password: staffPassword }),
      })
      setStaffUsername('')
      setStaffEmail('')
      setStaffPassword('')
      await refreshUsers()
    } catch (e) {
      setTeamError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setTeamSaving(false)
    }
  }

  async function deleteUser(userId: string) {
    if (!me || me.role !== 'owner') return
    setTeamSaving(true)
    setTeamError(null)
    try {
      await apiFetch(`/api/v1/backoffice/${businessId}/users/${userId}`, {
        method: 'DELETE',
        headers: { ...authHeaders(token) },
      })
      await refreshUsers()
    } catch (e) {
      setTeamError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setTeamSaving(false)
    }
  }

  async function saveMfa(userId: string, enabled: boolean) {
    if (!me || me.role !== 'owner') return
    setTeamSaving(true)
    setTeamError(null)
    try {
      await apiFetch(`/api/v1/backoffice/${businessId}/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({ mfa_enabled: enabled, mfa_phone_e164: mfaPhones[userId] || null }),
      })
      await refreshUsers()
    } catch (e) {
      setTeamError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setTeamSaving(false)
    }
  }

  async function addReview() {
    if (!canWriteProof) return
    setProofSaving(true)
    setProofError(null)
    try {
      await apiFetch(`/api/v1/backoffice/${businessId}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({ author_name: authorName, rating, text }),
      })
      setAuthorName('')
      setRating(5)
      setText('')
      await refreshProof()
    } catch (e) {
      setProofError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setProofSaving(false)
    }
  }

  async function deleteReview(reviewId: string) {
    if (!canWriteProof) return
    setProofSaving(true)
    setProofError(null)
    try {
      await apiFetch(`/api/v1/backoffice/${businessId}/reviews/${reviewId}`, {
        method: 'DELETE',
        headers: { ...authHeaders(token) },
      })
      await refreshProof()
    } catch (e) {
      setProofError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setProofSaving(false)
    }
  }

  async function addPhoto() {
    if (!canWriteProof) return
    setProofSaving(true)
    setProofError(null)
    try {
      await apiFetch(`/api/v1/backoffice/${businessId}/photos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({ url: photoUrl }),
      })
      setPhotoUrl('')
      await refreshProof()
    } catch (e) {
      setProofError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setProofSaving(false)
    }
  }

  async function uploadPhoto() {
    if (!canWriteProof) return
    if (!photoFile) return
    setProofSaving(true)
    setProofError(null)
    try {
      const fd = new FormData()
      fd.append('file', photoFile)
      await apiFetch(`/api/v1/backoffice/${businessId}/photos/upload`, {
        method: 'POST',
        headers: { ...authHeaders(token) },
        body: fd,
      })
      setPhotoFile(null)
      await refreshProof()
    } catch (e) {
      setProofError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setProofSaving(false)
    }
  }

  async function uploadLogo() {
    if (!canWriteSettings) return
    if (!logoFile) return
    setSaving(true)
    try {
      const fd = new FormData()
      fd.append('file', logoFile)
      const res = await apiFetch<{ url: string }>(`/api/v1/backoffice/${businessId}/logo/upload`, {
        method: 'POST',
        headers: { ...authHeaders(token) },
        body: fd,
      })
      setLogoFile(null)
      setConfig({ ...config, logo_url: res.url })
    } finally {
      setSaving(false)
    }
  }

  async function uploadHeroImage() {
    if (!canWriteSettings) return
    if (!heroImageFile) return
    setHeroImageUploading(true)
    setHeroImageError(null)
    try {
      const fd = new FormData()
      fd.append('file', heroImageFile)
      const res = await apiFetch<{ url: string }>(`/api/v1/site/${businessId}/assets?kind=hero_image`, {
        method: 'POST',
        body: fd,
      })
      setHeroImageFile(null)
      setConfig({ ...config, branding: { ...(config.branding || {}), hero_image_url: res.url } })
    } catch (e) {
      setHeroImageError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setHeroImageUploading(false)
    }
  }

  function makeAiHeroImageUrl() {
    const tradeId = String(config?.trade_id || '').trim()
    const company = String(config?.company_name || '').trim()
    const city = String(config?.city || '').trim()
    const zone = String(config?.zone_label || '').trim()
    const sector = String(companyProfile?.sector_label || '').trim()
    const hint = [tradeId || null, sector || null].filter(Boolean).join(' ')
    const prompt =
      `realistic professional photography, French local service business hero background, ${hint || 'artisan'}, ` +
      `${city || 'France'}, ${zone || ''}, clean modern website background, no text, no logo, no watermark, ` +
      `wide shot, natural light, high quality, shallow depth of field, bokeh, 4k`
    return `https://coreva-normal.trae.ai/api/ide/v1/text_to_image?prompt=${encodeURIComponent(prompt)}&image_size=landscape_16_9`
  }

  function syncPreview(opts?: { open?: boolean }) {
    try {
      const patch = {
        company_name: config?.company_name || null,
        trade_id: config?.trade_id || null,
        phone: config?.phone || null,
        whatsapp_phone: config?.whatsapp_phone || null,
        city: config?.city || null,
        zone_label: config?.zone_label || null,
        zones: config?.zones || null,
        services: config?.services || null,
        pricing: config?.pricing || null,
        tarifs_override: config?.tarifs_override || null,
        tarifs_common_override: config?.tarifs_common_override || null,
        logo_url: config?.logo_url || null,
        branding: config?.branding || null,
        appearance: config?.appearance || null,
        site_copy_override: normalizeSiteCopyOverride(config?.site_copy_override || null),
      }
      window.localStorage.setItem(`site_preview:${businessId}`, JSON.stringify({ updated_at: new Date().toISOString(), patch }))
    } catch {}
    setPreviewNonce((n) => n + 1)
    if (opts?.open) setPreviewOpen(true)
  }

  function openPreview() {
    syncPreview({ open: true })
  }

  function deepMerge(base: any, override: any): any {
    if (override === null || override === undefined) return base
    if (Array.isArray(override)) return override
    if (typeof override !== 'object' || typeof base !== 'object' || base === null || Array.isArray(base)) return override
    const out: any = { ...base }
    for (const [k, v] of Object.entries(override)) out[k] = deepMerge(base?.[k], v)
    return out
  }

  async function generateAi() {
    if (!canWriteSettings) return
    setAiLoading(true)
    setAiError(null)
    try {
      const out = await apiFetch<any>(`/api/v1/backoffice/${businessId}/ai/recommendations`, {
        method: 'POST',
        headers: { ...authHeaders(token) },
      })
      setAiResult(out)
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setAiLoading(false)
    }
  }

  function applyAiToDraft() {
    if (!aiResult?.recommendations) return
    const rec = aiResult.recommendations
    const next = { ...config }
    if (rec.site_copy_override) next.site_copy_override = deepMerge(next.site_copy_override || {}, rec.site_copy_override)
    if (rec.message_templates_override) {
      next.settings = {
        ...(next.settings || {}),
        message_templates_override: deepMerge(next.settings?.message_templates_override || {}, rec.message_templates_override),
      }
    }
    setConfig(next)
  }

  async function deletePhoto(photoId: string) {
    if (!canWriteProof) return
    setProofSaving(true)
    setProofError(null)
    try {
      await apiFetch(`/api/v1/backoffice/${businessId}/photos/${photoId}`, {
        method: 'DELETE',
        headers: { ...authHeaders(token) },
      })
      await refreshProof()
    } catch (e) {
      setProofError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setProofSaving(false)
    }
  }

  async function saveCompanyProfile() {
    if (!canWriteSettings || !companyProfile) return
    setCompanyProfileSaving(true)
    setCompanyProfileError(null)
    try {
      const res = await apiFetch<{ profile: CompanyProfile }>(`/api/v1/backoffice/${businessId}/company_profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify(companyProfile),
      })
      setCompanyProfile(res.profile || null)
    } catch (e) {
      setCompanyProfileError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setCompanyProfileSaving(false)
    }
  }

  async function changePassword() {
    const oldp = oldPassword
    const next = newPassword
    const conf = confirmPassword
    setPasswordSuccess(false)
    if (next.length < 8) {
      setPasswordError('Mot de passe trop court (8 caractères minimum).')
      return
    }
    if (next !== conf) {
      setPasswordError('Les mots de passe ne correspondent pas.')
      return
    }

    setPasswordSaving(true)
    setPasswordError(null)
    try {
      await apiFetch(`/api/v1/backoffice/${businessId}/me/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({ old_password: oldp, new_password: next }),
      })
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setPasswordSuccess(true)
    } catch (e) {
      setPasswordError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setPasswordSaving(false)
    }
  }

  return (
    <BackofficeShell businessId={businessId}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <BackButton fallbackTo={`/backoffice/${businessId}`} />
          <div>
            <h1 className="text-lg font-semibold text-white">{isCreateSite ? 'Création de site' : 'Réglages'}</h1>
            <div className="mt-1 text-xs text-zinc-300">Zone, services, tarifs transparents, avis et photos.</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openPreview}
            disabled={!siteBaseUrl}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-60"
          >
            Preview
          </button>
          {canWriteSettings ? (
            <button
              onClick={save}
              disabled={saving}
              className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-zinc-950 hover:bg-zinc-100 disabled:opacity-60"
            >
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          ) : null}
        </div>
      </div>

      {isCreateSite && !loading && config ? (
        <div className="mt-4 rounded-2xl border border-white/10 bg-zinc-950/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-white">Paramètres essentiels</div>
              <div className="mt-1 text-xs text-zinc-300">Commence par choisir le métier, puis ajuste le nom, la ville et la zone.</div>
              {!canWriteSettings ? <div className="mt-2 text-xs text-rose-200">Mode lecture seule : droits “Modifier réglages” requis.</div> : null}
              {tradeOptionsError ? <div className="mt-2 text-xs text-rose-200">{tradeOptionsError}</div> : null}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => void refreshLivePreview()}
                disabled={!canWriteSettings}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-60"
              >
                Rafraîchir preview
              </button>
              <button
                onClick={() => void validateAndSaveSite()}
                disabled={!canWriteSettings || saving}
                className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-zinc-950 hover:bg-zinc-100 disabled:opacity-60"
              >
                Enregistrer
              </button>
              <button
                onClick={openSite}
                disabled={!siteBaseUrl}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-60"
              >
                Voir le site
              </button>
            </div>
          </div>
          {createSiteSuccess ? <div className="mt-2 text-xs text-emerald-200">Enregistré.</div> : null}
          {createSiteError ? <div className="mt-2 text-xs text-rose-200">{createSiteError}</div> : null}
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <label className="grid gap-1 text-xs text-zinc-300">
              Métier
              {tradeOptions.length ? (
                <select
                  value={String(config.trade_id || '')}
                  onChange={(e) => setConfig({ ...config, trade_id: e.target.value })}
                  disabled={!canWriteSettings}
                  style={{ colorScheme: 'dark' }}
                  className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
                >
                  {tradeOptions.map((t) => (
                    <option key={t.trade_id} value={t.trade_id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={String(config.trade_id || '')}
                  onChange={(e) => setConfig({ ...config, trade_id: e.target.value })}
                  disabled={!canWriteSettings}
                  className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
                />
              )}
            </label>
            <label className="grid gap-1 text-xs text-zinc-300 md:col-span-2">
              Nom
              <input
                value={String(config.company_name || '')}
                onChange={(e) => setConfig({ ...config, company_name: e.target.value })}
                disabled={!canWriteSettings}
                className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
              />
            </label>
            <label className="grid gap-1 text-xs text-zinc-300">
              Ville
              <input
                value={String(config.city || '')}
                onChange={(e) => setConfig({ ...config, city: e.target.value })}
                disabled={!canWriteSettings}
                className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
              />
            </label>
            <label className="grid gap-1 text-xs text-zinc-300 md:col-span-2">
              Zone
              <input
                value={String(config.zone_label || '')}
                onChange={(e) => setConfig({ ...config, zone_label: e.target.value })}
                disabled={!canWriteSettings}
                className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
              />
            </label>
            <label className="grid gap-1 text-xs text-zinc-300 md:col-span-2">
              Téléphone (E.164)
              <input
                value={String(config.phone_e164 || '')}
                onChange={(e) => setConfig({ ...config, phone_e164: e.target.value })}
                disabled={!canWriteSettings}
                className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
              />
            </label>
          </div>
        </div>
      ) : null}

      {fromAuditId ? (
        <div className="mt-4 rounded-2xl border border-white/10 bg-zinc-950/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-white">Création de site à partir de l’audit</div>
              <div className="mt-1 text-xs text-zinc-300">
                Pré-remplissage : nom + URL du site actuel. Tu peux ensuite ajuster le design, les sections, les textes, les zones et les tarifs.
              </div>
              {auditPrefill?.source_url ? (
                <div className="mt-2 text-xs text-zinc-400">
                  Audit sélectionné : {String(auditPrefill.source_url)} {auditPrefill.audit ? '' : '(en cours de génération)'}
                </div>
              ) : null}
              {auditPrefillError ? <div className="mt-2 text-xs text-rose-200">{auditPrefillError}</div> : null}
              {createSiteSuccess ? <div className="mt-2 text-xs text-emerald-200">Enregistré.</div> : null}
              {createSiteError ? <div className="mt-2 text-xs text-rose-200">{createSiteError}</div> : null}
            </div>
            <div className="flex items-center gap-2">
              {isCreateSite ? (
                <>
                  <button
                    onClick={() => void validateAndSaveSite()}
                    disabled={!canWriteSettings || saving}
                    className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-zinc-950 hover:bg-zinc-100 disabled:opacity-60"
                  >
                    Enregistrer
                  </button>
                  <button
                    onClick={openSite}
                    disabled={!siteBaseUrl}
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-60"
                  >
                    Voir le site
                  </button>
                </>
              ) : null}
              <button
                onClick={openPreview}
                disabled={!siteBaseUrl}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-60"
              >
                Ouvrir preview
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isCreateSite && siteBaseUrl ? (
        <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/40">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
            <div className="text-sm font-semibold text-white">Prévisualisation (live)</div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => void refreshLivePreview()}
                disabled={!canWriteSettings}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-60"
              >
                Mettre à jour
              </button>
              <button
                onClick={() => window.open(siteBaseUrl, 'create-site-site', 'noopener,noreferrer')}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10"
              >
                Nouvel onglet
              </button>
            </div>
          </div>
          <div className="bg-white">
            {livePreviewLoading ? <div className="p-6 text-sm text-slate-700">Chargement…</div> : null}
            {!livePreviewLoading && livePreviewError ? <div className="p-6 text-sm text-rose-700">{livePreviewError}</div> : null}
            {!livePreviewLoading && !livePreviewError && livePreviewData ? (
              <BlueprintPage businessId={businessId} pageKey="home" config={livePreviewData.config} content={livePreviewData.content} />
            ) : null}
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="mt-8 text-sm text-zinc-300">Chargement…</div>
      ) : error ? (
        <div className="mt-8 text-sm text-rose-200">{error}</div>
      ) : !config ? null : (
        <div className="mt-6 grid gap-4">
          <div className="rounded-2xl border border-white/10 bg-zinc-950/40 p-5">
            <div className="text-sm font-semibold text-white">Branding</div>
            <div className="mt-1 text-xs text-zinc-300">Logo (upload ou URL). Affiché sur le site.</div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <label className="grid gap-1 text-xs text-zinc-300 md:col-span-2">
                URL logo (https)
                <input
                  value={config.logo_url || ''}
                  onChange={(e) => setConfig({ ...config, logo_url: e.target.value })}
                  disabled={!canWriteSettings}
                  className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
                />
              </label>
              <div className="grid gap-2">
                <label className="grid gap-1 text-xs text-zinc-300">
                  Upload
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
                    disabled={!canWriteSettings}
                    className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200"
                  />
                </label>
                {canWriteSettings ? (
                  <button
                    onClick={uploadLogo}
                    disabled={saving || !logoFile}
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white hover:bg-white/10 disabled:opacity-60"
                  >
                    Uploader le logo
                  </button>
                ) : null}
              </div>
            </div>
            {config.logo_url ? (
              <div className="mt-4 flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
                <img src={String(config.logo_url)} alt="Logo" className="h-10 w-10 rounded-lg bg-white object-contain" />
                <div className="min-w-0 text-xs text-zinc-300 truncate">{String(config.logo_url)}</div>
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-white/10 bg-zinc-950/40 p-5">
            <div className="text-sm font-semibold text-white">Apparence</div>
            <div className="mt-1 text-xs text-zinc-300">Thème et variantes du site public.</div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <label className="grid gap-1 text-xs text-zinc-300">
                Thème
                <select
                  value={String(config?.appearance?.theme_id || 'ivory')}
                  onChange={(e) => setConfig({ ...config, appearance: { ...(config.appearance || {}), theme_id: e.target.value } })}
                  disabled={!canWriteSettings}
                  style={{ colorScheme: 'dark' }}
                  className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
                >
                  {THEME_IDS.map((id) => (
                    <option key={id} value={id}>
                      {THEMES[id].label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid gap-2 md:col-span-2">
                <div className="text-xs text-zinc-300">Couleurs (personnalisées)</div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="grid gap-1 text-xs text-zinc-300">
                    Accent
                    <input
                      type="color"
                      value={String(config?.appearance?.theme_vars_override?.accent || '#2563eb')}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          appearance: {
                            ...(config.appearance || {}),
                            theme_vars_override: { ...(config.appearance?.theme_vars_override || {}), accent: e.target.value, link: e.target.value },
                          },
                        })
                      }
                      disabled={!canWriteSettings}
                      className="h-10 w-full rounded-xl border border-white/10 bg-white/5 px-2"
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-zinc-300">
                    Texte
                    <input
                      type="color"
                      value={String(config?.appearance?.theme_vars_override?.text || '#0f172a')}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          appearance: { ...(config.appearance || {}), theme_vars_override: { ...(config.appearance?.theme_vars_override || {}), text: e.target.value } },
                        })
                      }
                      disabled={!canWriteSettings}
                      className="h-10 w-full rounded-xl border border-white/10 bg-white/5 px-2"
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-zinc-300">
                    Bordure
                    <input
                      type="color"
                      value={String(config?.appearance?.theme_vars_override?.border || '#e5e7eb')}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          appearance: {
                            ...(config.appearance || {}),
                            theme_vars_override: { ...(config.appearance?.theme_vars_override || {}), border: e.target.value },
                          },
                        })
                      }
                      disabled={!canWriteSettings}
                      className="h-10 w-full rounded-xl border border-white/10 bg-white/5 px-2"
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-zinc-300">
                    Surface
                    <input
                      type="color"
                      value={String(config?.appearance?.theme_vars_override?.surface || '#ffffff')}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          appearance: {
                            ...(config.appearance || {}),
                            theme_vars_override: { ...(config.appearance?.theme_vars_override || {}), surface: e.target.value },
                          },
                        })
                      }
                      disabled={!canWriteSettings}
                      className="h-10 w-full rounded-xl border border-white/10 bg-white/5 px-2"
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-zinc-300">
                    Surface 2
                    <input
                      type="color"
                      value={String(config?.appearance?.theme_vars_override?.surface2 || '#f3f4f6')}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          appearance: {
                            ...(config.appearance || {}),
                            theme_vars_override: { ...(config.appearance?.theme_vars_override || {}), surface2: e.target.value },
                          },
                        })
                      }
                      disabled={!canWriteSettings}
                      className="h-10 w-full rounded-xl border border-white/10 bg-white/5 px-2"
                    />
                  </label>
                  <div className="flex items-end">
                    <button
                      onClick={() =>
                        setConfig({
                          ...config,
                          appearance: (() => {
                            const next = { ...(config.appearance || {}) } as any
                            delete next.theme_vars_override
                            return next
                          })(),
                        })
                      }
                      disabled={!canWriteSettings}
                      className="h-10 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-60"
                    >
                      Réinitialiser
                    </button>
                  </div>
                </div>
              </div>
              <label className="grid gap-1 text-xs text-zinc-300">
                Hero
                <select
                  value={String(config?.appearance?.sections?.hero?.variant || 'classic')}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      appearance: {
                        ...(config.appearance || {}),
                        sections: { ...(config.appearance?.sections || {}), hero: { ...(config.appearance?.sections?.hero || {}), variant: e.target.value } },
                      },
                    })
                  }
                  disabled={!canWriteSettings}
                  style={{ colorScheme: 'dark' }}
                  className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
                >
                  {[
                    ['classic', 'Classic'],
                    ['split', 'Split'],
                    ['centered', 'Centered'],
                  ].map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs text-zinc-300">
                Tarifs
                <select
                  value={String(config?.appearance?.sections?.pricing?.variant || 'cards')}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      appearance: {
                        ...(config.appearance || {}),
                        sections: {
                          ...(config.appearance?.sections || {}),
                          pricing: { ...(config.appearance?.sections?.pricing || {}), variant: e.target.value },
                        },
                      },
                    })
                  }
                  disabled={!canWriteSettings}
                  style={{ colorScheme: 'dark' }}
                  className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
                >
                  {[
                    ['cards', 'Cards'],
                    ['table', 'Table'],
                    ['minimal', 'Minimal'],
                  ].map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <label className="grid gap-1 text-xs text-zinc-300">
                Services
                <select
                  value={String(config?.appearance?.sections?.services?.variant || 'grid')}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      appearance: {
                        ...(config.appearance || {}),
                        sections: {
                          ...(config.appearance?.sections || {}),
                          services: { ...(config.appearance?.sections?.services || {}), variant: e.target.value },
                        },
                      },
                    })
                  }
                  disabled={!canWriteSettings}
                  style={{ colorScheme: 'dark' }}
                  className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
                >
                  {[
                    ['grid', 'Grid'],
                    ['split', 'Split'],
                    ['list', 'List'],
                  ].map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs text-zinc-300">
                Zones
                <select
                  value={String(config?.appearance?.sections?.zones?.variant || 'chips')}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      appearance: {
                        ...(config.appearance || {}),
                        sections: {
                          ...(config.appearance?.sections || {}),
                          zones: { ...(config.appearance?.sections?.zones || {}), variant: e.target.value },
                        },
                      },
                    })
                  }
                  disabled={!canWriteSettings}
                  style={{ colorScheme: 'dark' }}
                  className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
                >
                  {[
                    ['chips', 'Chips'],
                    ['columns', 'Columns'],
                    ['mapless', 'Mapless'],
                  ].map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs text-zinc-300">
                Avis
                <select
                  value={String(config?.appearance?.sections?.reviews?.variant || 'cards')}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      appearance: {
                        ...(config.appearance || {}),
                        sections: {
                          ...(config.appearance?.sections || {}),
                          reviews: { ...(config.appearance?.sections?.reviews || {}), variant: e.target.value },
                        },
                      },
                    })
                  }
                  disabled={!canWriteSettings}
                  style={{ colorScheme: 'dark' }}
                  className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
                >
                  {[
                    ['cards', 'Cards'],
                    ['compact', 'Compact'],
                    ['carousel_like', 'Carousel-like'],
                  ].map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs text-zinc-300">
                FAQ
                <select
                  value={String(config?.appearance?.sections?.faq?.variant || 'cards')}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      appearance: {
                        ...(config.appearance || {}),
                        sections: {
                          ...(config.appearance?.sections || {}),
                          faq: { ...(config.appearance?.sections?.faq || {}), variant: e.target.value },
                        },
                      },
                    })
                  }
                  disabled={!canWriteSettings}
                  style={{ colorScheme: 'dark' }}
                  className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
                >
                  {[
                    ['cards', 'Cards'],
                    ['accordion', 'Accordion'],
                    ['two_columns', 'Two columns'],
                  ].map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs text-zinc-300">
                Footer
                <select
                  value={String(config?.appearance?.sections?.footer?.variant || 'rich')}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      appearance: {
                        ...(config.appearance || {}),
                        sections: {
                          ...(config.appearance?.sections || {}),
                          footer: { ...(config.appearance?.sections?.footer || {}), variant: e.target.value },
                        },
                      },
                    })
                  }
                  disabled={!canWriteSettings}
                  style={{ colorScheme: 'dark' }}
                  className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
                >
                  {[
                    ['rich', 'Rich'],
                    ['minimal', 'Minimal'],
                    ['contact_focus', 'Contact focus'],
                  ].map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-3 text-xs text-zinc-400">
              Astuce : ajoute <span className="text-zinc-200">?theme=ivory</span> (ou autre) à l’URL du site public pour prévisualiser sans enregistrer.
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-zinc-950/40 p-5">
            <div className="text-sm font-semibold text-white">Contenu du site</div>
            <div className="mt-1 text-xs text-zinc-300">Textes (overrides) + image hero.</div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-xs text-zinc-300 md:col-span-2">
                Hero — H1
                <input
                  value={String(config?.site_copy_override?.hero?.h1 || '')}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      site_copy_override: {
                        ...(config.site_copy_override || {}),
                        hero: { ...((config.site_copy_override || {})?.hero || {}), h1: e.target.value },
                      },
                    })
                  }
                  disabled={!canWriteSettings}
                  className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
                  placeholder="Laisse vide pour ne pas override"
                />
              </label>
              <label className="grid gap-1 text-xs text-zinc-300 md:col-span-2">
                Hero — Subtitle
                <input
                  value={String(config?.site_copy_override?.hero?.subtitle || '')}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      site_copy_override: {
                        ...(config.site_copy_override || {}),
                        hero: { ...((config.site_copy_override || {})?.hero || {}), subtitle: e.target.value },
                      },
                    })
                  }
                  disabled={!canWriteSettings}
                  className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
                  placeholder="Laisse vide pour ne pas override"
                />
              </label>
              {[0, 1, 2].map((i) => (
                <label key={i} className="grid gap-1 text-xs text-zinc-300">
                  Hero — CTA {i + 1}
                  <input
                    value={String(config?.site_copy_override?.hero?.ctas?.[i] || '')}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        site_copy_override: {
                          ...(config.site_copy_override || {}),
                          hero: {
                            ...((config.site_copy_override || {})?.hero || {}),
                            ctas: (() => {
                              const prev = Array.isArray(config?.site_copy_override?.hero?.ctas) ? [...config.site_copy_override.hero.ctas] : []
                              prev[i] = e.target.value
                              return prev
                            })(),
                          },
                        },
                      })
                    }
                    disabled={!canWriteSettings}
                    className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
                  />
                </label>
              ))}
            </div>

            <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs uppercase tracking-wider text-zinc-400">Image hero</div>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <label className="grid gap-1 text-xs text-zinc-300 md:col-span-2">
                  URL (https)
                  <input
                    value={String(config?.branding?.hero_image_url || '')}
                    onChange={(e) =>
                      setConfig({ ...config, branding: { ...(config.branding || {}), hero_image_url: e.target.value || null } })
                    }
                    disabled={!canWriteSettings}
                    className="h-10 rounded-xl border border-white/10 bg-zinc-950/40 px-3 text-sm text-white outline-none focus:border-white/25"
                    placeholder="https://..."
                  />
                </label>
                <label className="grid gap-1 text-xs text-zinc-300">
                  Upload
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setHeroImageFile(e.target.files?.[0] || null)}
                    disabled={!canWriteSettings}
                    className="h-10 rounded-xl border border-white/10 bg-zinc-950/40 px-3 py-2 text-sm text-zinc-200"
                  />
                </label>
                <div className="flex flex-wrap items-center gap-2 md:col-span-3">
                  <button
                    onClick={uploadHeroImage}
                    disabled={!canWriteSettings || heroImageUploading || !heroImageFile}
                    className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-zinc-100 disabled:opacity-60"
                  >
                    {heroImageUploading ? 'Upload…' : 'Uploader'}
                  </button>
                  <button
                    onClick={() => setConfig({ ...config, branding: { ...(config.branding || {}), hero_image_url: makeAiHeroImageUrl() } })}
                    disabled={!canWriteSettings}
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-60"
                  >
                    Générer fond IA
                  </button>
                  <button
                    onClick={() => setConfig({ ...config, branding: { ...(config.branding || {}), hero_image_url: null } })}
                    disabled={!canWriteSettings || !config?.branding?.hero_image_url}
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-60"
                  >
                    Supprimer
                  </button>
                  <button
                    onClick={openPreview}
                    disabled={!siteBaseUrl}
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-60"
                  >
                    Preview
                  </button>
                  <button
                    onClick={save}
                    disabled={!canWriteSettings || saving}
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-60"
                  >
                    {saving ? 'Sauvegarde…' : 'Sauvegarder'}
                  </button>
                </div>
                {heroImageError ? <div className="md:col-span-3 text-xs text-rose-200">{heroImageError}</div> : null}
                {config?.branding?.hero_image_url ? (
                  <div className="md:col-span-3 overflow-hidden rounded-xl border border-white/10 bg-zinc-950/40">
                    <img src={String(config.branding.hero_image_url)} alt="" className="aspect-[16/9] w-full object-cover" />
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-zinc-950/40 p-5">
            <div className="text-sm font-semibold text-white">Onboarding</div>
            <div className="mt-1 text-xs text-zinc-300">Infos utiles pour l’audit IA (optionnel).</div>
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              <label className="grid gap-1 text-xs text-zinc-300 md:col-span-2">
                Site actuel (URL)
                <input
                  value={String(config.settings?.onboarding?.current_site_url || '')}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      settings: { ...(config.settings || {}), onboarding: { ...(config.settings?.onboarding || {}), current_site_url: e.target.value } },
                    })
                  }
                  disabled={!canWriteSettings}
                  className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
                  placeholder="https://exemple.fr"
                />
              </label>
              <label className="grid gap-1 text-xs text-zinc-300">
                Objectif
                <select
                  value={String(config.settings?.onboarding?.goal || 'leads')}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      settings: { ...(config.settings || {}), onboarding: { ...(config.settings?.onboarding || {}), goal: e.target.value } },
                    })
                  }
                  disabled={!canWriteSettings}
                  className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
                >
                  <option value="leads" className="bg-zinc-950">
                    Générer des demandes
                  </option>
                  <option value="calls" className="bg-zinc-950">
                    Plus d’appels
                  </option>
                  <option value="appointments" className="bg-zinc-950">
                    Plus de RDV
                  </option>
                </select>
              </label>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-zinc-950/40 p-5">
            <div className="text-sm font-semibold text-white">Entreprise</div>
            <div className="mt-1 text-xs text-zinc-300">Effectifs, secteur, dates site, email mentions légales.</div>
            {companyProfileError ? <div className="mt-3 text-xs text-rose-200">{companyProfileError}</div> : null}
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-xs text-zinc-300">
                Effectifs
                <select
                  value={String(companyProfile?.headcount_range || '')}
                  onChange={(e) => setCompanyProfile(companyProfile ? { ...companyProfile, headcount_range: e.target.value || null } : null)}
                  disabled={!canWriteSettings || !companyProfile}
                  className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
                >
                  <option value="" className="bg-zinc-950">
                    —
                  </option>
                  <option value="0_1" className="bg-zinc-950">
                    0 à 1 salarié
                  </option>
                  <option value="2_10" className="bg-zinc-950">
                    2 à 10 salariés
                  </option>
                  <option value="11_20" className="bg-zinc-950">
                    11 à 20 salariés
                  </option>
                  <option value="21_49" className="bg-zinc-950">
                    21 à 49 salariés
                  </option>
                  <option value="50_plus" className="bg-zinc-950">
                    50 et plus
                  </option>
                </select>
              </label>
              <label className="grid gap-1 text-xs text-zinc-300">
                Code NAF (optionnel)
                <input
                  value={String(companyProfile?.naf_code || '')}
                  onChange={(e) => setCompanyProfile(companyProfile ? { ...companyProfile, naf_code: e.target.value || null } : null)}
                  disabled={!canWriteSettings || !companyProfile}
                  className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
                />
              </label>
              <label className="grid gap-1 text-xs text-zinc-300 md:col-span-2">
                Secteur (libellé)
                <input
                  value={String(companyProfile?.sector_label || '')}
                  onChange={(e) => setCompanyProfile(companyProfile ? { ...companyProfile, sector_label: e.target.value || null } : null)}
                  disabled={!canWriteSettings || !companyProfile}
                  className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
                />
              </label>
              <label className="grid gap-1 text-xs text-zinc-300 md:col-span-2">
                Site web (URL)
                <input
                  value={String(companyProfile?.website_url || '')}
                  onChange={(e) => setCompanyProfile(companyProfile ? { ...companyProfile, website_url: e.target.value || null } : null)}
                  disabled={!canWriteSettings || !companyProfile}
                  className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
                  placeholder="https://exemple.fr"
                />
              </label>
              <label className="grid gap-1 text-xs text-zinc-300 md:col-span-2">
                Email (mentions légales)
                <input
                  value={String(companyProfile?.legal_contact_email || '')}
                  onChange={(e) => setCompanyProfile(companyProfile ? { ...companyProfile, legal_contact_email: e.target.value || null } : null)}
                  disabled={!canWriteSettings || !companyProfile}
                  className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
                  placeholder="contact@exemple.fr"
                />
              </label>
              <label className="grid gap-1 text-xs text-zinc-300">
                Date création site
                <input
                  value={String(companyProfile?.website_created_at || '')}
                  onChange={(e) => setCompanyProfile(companyProfile ? { ...companyProfile, website_created_at: e.target.value || null } : null)}
                  disabled={!canWriteSettings || !companyProfile}
                  className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
                  placeholder="YYYY-MM-DD"
                />
              </label>
              <label className="grid gap-1 text-xs text-zinc-300">
                Date refonte (optionnel)
                <input
                  value={String(companyProfile?.website_redesign_at || '')}
                  onChange={(e) => setCompanyProfile(companyProfile ? { ...companyProfile, website_redesign_at: e.target.value || null } : null)}
                  disabled={!canWriteSettings || !companyProfile}
                  className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
                  placeholder="YYYY-MM-DD"
                />
              </label>
            </div>
            {canWriteSettings ? (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={saveCompanyProfile}
                  disabled={companyProfileSaving || !companyProfile}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-60"
                >
                  {companyProfileSaving ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            ) : null}
          </div>

          {isOwner ? (
            <div className="rounded-2xl border border-white/10 bg-zinc-950/40 p-5">
              <div className="text-sm font-semibold text-white">Audit IA</div>
              <div className="mt-1 text-xs text-zinc-300">Génère un audit public (lien partageable) + un Word téléchargeable.</div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  onClick={createSiteAudit}
                  disabled={siteAuditLoading || !String(config.settings?.onboarding?.current_site_url || '').trim()}
                  className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-zinc-100 disabled:opacity-60"
                >
                  {siteAuditLoading ? 'Génération…' : 'Lancer un audit'}
                </button>
                <a
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-60"
                  href={`/backoffice/${businessId}/site-audits`}
                >
                  Voir tous les audits
                </a>
              </div>
              {siteAuditError ? <div className="mt-3 text-xs text-rose-200">{siteAuditError}</div> : null}

              {siteAuditLink ? (
                <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-zinc-200">
                  <div className="text-xs uppercase tracking-wider text-zinc-400">Lien public</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <a className="underline" href={siteAuditLink.public_url} target="_blank" rel="noreferrer">
                      {siteAuditLink.public_url}
                    </a>
                    <a
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-200 hover:bg-white/10"
                      href={siteAuditLink.docx_url}
                    >
                      Word
                    </a>
                    <a
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-200 hover:bg-white/10"
                      href={jsonUrlFromDocx(siteAuditLink.docx_url)}
                    >
                      JSON
                    </a>
                  </div>
                </div>
              ) : null}

              {siteAudits?.items?.[0] ? (
                <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-zinc-200">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-xs text-zinc-400">Dernier audit</div>
                      <div className="mt-1 truncate text-sm text-white">{String(siteAudits.items[0].source_url || '')}</div>
                      <div className="mt-1 text-xs text-zinc-400">
                        {String(siteAudits.items[0].status || '')} • {new Date(String(siteAudits.items[0].created_at || '')).toLocaleString()}
                        {siteAudits.items[0].error ? ` • ${String(siteAudits.items[0].error)}` : ''}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => rotateSiteAuditLink(String(siteAudits.items[0].audit_id), { open: true })}
                        disabled={siteAuditLoading}
                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-200 hover:bg-white/10 disabled:opacity-60"
                      >
                        Ouvrir
                      </button>
                      <button
                        onClick={() => rotateSiteAuditLink(String(siteAudits.items[0].audit_id))}
                        disabled={siteAuditLoading}
                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-200 hover:bg-white/10 disabled:opacity-60"
                      >
                        Lien
                      </button>
                      <button
                        onClick={() => deleteSiteAudit(String(siteAudits.items[0].audit_id))}
                        disabled={siteAuditLoading}
                        className="rounded-xl border border-white/10 bg-rose-500/10 px-3 py-2 text-xs text-rose-200 hover:bg-rose-500/15 disabled:opacity-60"
                      >
                        Supprimer
                      </button>
                      <button
                        onClick={() => downloadSiteAuditJson(String(siteAudits.items[0].audit_id))}
                        disabled={siteAuditLoading}
                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-200 hover:bg-white/10 disabled:opacity-60"
                      >
                        JSON
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="rounded-2xl border border-white/10 bg-zinc-950/40 p-5">
            <div className="text-sm font-semibold text-white">Recommandations (IA optionnelle)</div>
            <div className="mt-1 text-xs text-zinc-300">
              Génère une proposition de hero + templates messages à partir des infos business. Tu choisis si tu appliques ou non.
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                onClick={generateAi}
                disabled={!canWriteSettings || aiLoading}
                className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-zinc-100 disabled:opacity-60"
              >
                {aiLoading ? 'Génération…' : 'Générer'}
              </button>
              {aiResult?.recommendations ? (
                <button
                  onClick={applyAiToDraft}
                  disabled={!canWriteSettings}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-60"
                >
                  Appliquer au brouillon
                </button>
              ) : null}
              <button
                onClick={save}
                disabled={!canWriteSettings || saving}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-60"
              >
                {saving ? 'Sauvegarde…' : 'Sauvegarder'}
              </button>
            </div>
            {aiError ? <div className="mt-3 text-xs text-rose-200">{aiError}</div> : null}
            {aiResult?.recommendations ? (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs uppercase tracking-wider text-zinc-400">Hero</div>
                  <div className="mt-3 grid gap-2 text-xs text-zinc-200">
                    <div>
                      <div className="text-zinc-400">h1</div>
                      <div className="mt-1 text-sm text-white">{aiResult.recommendations?.site_copy_override?.hero?.h1 || '—'}</div>
                    </div>
                    <div>
                      <div className="text-zinc-400">subtitle</div>
                      <div className="mt-1 text-sm text-white">{aiResult.recommendations?.site_copy_override?.hero?.subtitle || '—'}</div>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs uppercase tracking-wider text-zinc-400">Messages</div>
                  <div className="mt-3 grid gap-3 text-xs text-zinc-200">
                    <div>
                      <div className="text-zinc-400">ack (SMS)</div>
                      <div className="mt-1 text-sm text-white">
                        {aiResult.recommendations?.message_templates_override?.common?.ack?.sms || '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-zinc-400">missed_call_followup (SMS)</div>
                      <div className="mt-1 text-sm text-white">
                        {aiResult.recommendations?.message_templates_override?.common?.missed_call_followup?.sms || '—'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
            <div className="mt-3 text-[11px] text-zinc-400">
              Sans configuration IA (AI_PROVIDER), l’app génère des suggestions “règles” basées sur le métier, la ville et la zone.
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-zinc-950/40 p-5">
            <div className="text-sm font-semibold text-white">Tarifs</div>
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              <label className="grid gap-1 text-xs text-zinc-300">
                Frais de déplacement
                <input
                  value={config.pricing?.travel_fee || ''}
                  onChange={(e) => setConfig({ ...config, pricing: { ...(config.pricing || {}), travel_fee: e.target.value } })}
                  disabled={!canWriteSettings}
                  className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
                />
              </label>
              <label className="grid gap-1 text-xs text-zinc-300">
                Frais de diagnostic
                <input
                  value={config.pricing?.diagnostic_fee || ''}
                  onChange={(e) =>
                    setConfig({ ...config, pricing: { ...(config.pricing || {}), diagnostic_fee: e.target.value } })
                  }
                  disabled={!canWriteSettings}
                  className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
                />
              </label>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-zinc-950/40 p-5">
            <div className="text-sm font-semibold text-white">Zone (liste de codes postaux)</div>
            <textarea
              value={(config.zones?.zone_list || []).join('\n')}
              onChange={(e) => setConfig({ ...config, zones: { ...(config.zones || {}), zone_list: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) } })}
              disabled={!canWriteSettings}
              className="mt-3 min-h-28 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/25"
            />
          </div>

          <div className="rounded-2xl border border-white/10 bg-zinc-950/40 p-5">
            <div className="text-sm font-semibold text-white">RGPD</div>
            <div className="mt-1 text-xs text-zinc-300">Rétention des demandes (utilisée par le cron /admin/cron/retention).</div>
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              <label className="grid gap-1 text-xs text-zinc-300">
                Rétention (jours)
                <input
                  inputMode="numeric"
                  value={String(config.settings?.retention_days ?? '')}
                  onChange={(e) => {
                    const v = e.target.value.trim()
                    const n = v === '' ? null : Number(v)
                    setConfig({ ...config, settings: { ...(config.settings || {}), retention_days: v === '' ? null : n } })
                  }}
                  disabled={!canWriteSettings}
                  className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
                />
              </label>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-zinc-950/40 p-5">
            <div className="text-sm font-semibold text-white">Pipeline</div>
            <div className="mt-1 text-xs text-zinc-300">Étapes personnalisables (utilisées pour organiser l’inbox et déclencher des automations).</div>
            <textarea
              value={pipelineStagesText}
              onChange={(e) => setPipelineStagesText(e.target.value)}
              onBlur={() => {
                setAutomationError(null)
                try {
                  const parsed = JSON.parse(pipelineStagesText)
                  if (!Array.isArray(parsed)) throw new Error('pipeline_stages doit être un tableau JSON')
                  setConfig({ ...config, settings: { ...(config.settings || {}), pipeline_stages: parsed } })
                } catch (e: any) {
                  setAutomationError(e?.message || 'JSON invalide')
                }
              }}
              disabled={!canWriteSettings}
              className="mt-4 min-h-32 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 font-mono text-xs text-white outline-none focus:border-white/25"
            />
          </div>

          <div className="rounded-2xl border border-white/10 bg-zinc-950/40 p-5">
            <div className="text-sm font-semibold text-white">Automations</div>
            <div className="mt-1 text-xs text-zinc-300">Règles (assignation/tags/stage) et séquences (messages différés).</div>
            <div className="mt-4 grid gap-2 rounded-xl border border-white/10 bg-white/5 p-4 text-xs text-zinc-200">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={config.settings?.automations_enabled !== false}
                  onChange={(e) => setConfig({ ...config, settings: { ...(config.settings || {}), automations_enabled: e.target.checked } })}
                  disabled={!canWriteSettings}
                />
                Automations activées
              </label>
              <div className="grid gap-2 md:grid-cols-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={config.settings?.automations_urgent_enabled !== false}
                    onChange={(e) => setConfig({ ...config, settings: { ...(config.settings || {}), automations_urgent_enabled: e.target.checked } })}
                    disabled={!canWriteSettings}
                  />
                  Activer pour “Urgent”
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={config.settings?.automations_nonurgent_enabled !== false}
                    onChange={(e) => setConfig({ ...config, settings: { ...(config.settings || {}), automations_nonurgent_enabled: e.target.checked } })}
                    disabled={!canWriteSettings}
                  />
                  Activer pour non urgent
                </label>
              </div>
              <div className="text-xs text-zinc-400">
                Astuce : tu peux aussi désactiver une séquence individuellement en mettant <span className="text-zinc-200">enabled:false</span> dans le JSON.
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="grid gap-1">
                <div className="text-xs text-zinc-300">automation_rules (JSON)</div>
                <textarea
                  value={automationRulesText}
                  onChange={(e) => setAutomationRulesText(e.target.value)}
                  onBlur={() => {
                    setAutomationError(null)
                    try {
                      const parsed = JSON.parse(automationRulesText)
                      if (!Array.isArray(parsed)) throw new Error('automation_rules doit être un tableau JSON')
                      setConfig({ ...config, settings: { ...(config.settings || {}), automation_rules: parsed } })
                    } catch (e: any) {
                      setAutomationError(e?.message || 'JSON invalide')
                    }
                  }}
                  disabled={!canWriteSettings}
                  className="min-h-44 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 font-mono text-xs text-white outline-none focus:border-white/25"
                />
              </div>
              <div className="grid gap-1">
                <div className="text-xs text-zinc-300">sequences (JSON)</div>
                <textarea
                  value={sequencesText}
                  onChange={(e) => setSequencesText(e.target.value)}
                  onBlur={() => {
                    setAutomationError(null)
                    try {
                      const parsed = JSON.parse(sequencesText)
                      if (!Array.isArray(parsed)) throw new Error('sequences doit être un tableau JSON')
                      setConfig({ ...config, settings: { ...(config.settings || {}), sequences: parsed } })
                    } catch (e: any) {
                      setAutomationError(e?.message || 'JSON invalide')
                    }
                  }}
                  disabled={!canWriteSettings}
                  className="min-h-44 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 font-mono text-xs text-white outline-none focus:border-white/25"
                />
              </div>
            </div>
            {automationError ? <div className="mt-3 text-xs text-rose-200">{automationError}</div> : null}
          </div>

          <div className="rounded-2xl border border-white/10 bg-zinc-950/40 p-5">
            <div className="text-sm font-semibold text-white">Acquisition locale</div>
            <div className="mt-1 text-xs text-zinc-300">
              Ajoute des liens trackés dans ta fiche Google Business, Google Ads, flyers (QR) pour mesurer d’où viennent les demandes.
            </div>
            {!trackingLinks ? null : (
              <div className="mt-4 grid gap-3 text-xs text-zinc-200">
                <label className="grid gap-1">
                  Google Business Profile
                  <input
                    value={trackingLinks.gbp}
                    readOnly
                    className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none"
                  />
                </label>
                <label className="grid gap-1">
                  Google Ads
                  <input
                    value={trackingLinks.ads}
                    readOnly
                    className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none"
                  />
                </label>
                <label className="grid gap-1">
                  Flyers / QR code
                  <input
                    value={trackingLinks.flyers}
                    readOnly
                    className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none"
                  />
                </label>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-zinc-950/40 p-5">
            <div className="text-sm font-semibold text-white">Avis</div>
            <div className="mt-4 grid gap-2 md:grid-cols-3">
              <label className="grid gap-1 text-xs text-zinc-300 md:col-span-1">
                Auteur
                <input
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  disabled={!canWriteProof}
                  className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
                />
              </label>
              <label className="grid gap-1 text-xs text-zinc-300 md:col-span-1">
                Note
                <select
                  value={rating}
                  onChange={(e) => setRating(Number(e.target.value))}
                  disabled={!canWriteProof}
                  className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
                >
                  {[5, 4, 3, 2, 1].map((r) => (
                    <option key={r} value={r} className="bg-zinc-950">
                      {r}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-end justify-end md:col-span-1">
                {canWriteProof ? (
                  <button
                    onClick={addReview}
                    disabled={proofSaving || !authorName.trim() || !text.trim()}
                    className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-zinc-100 disabled:opacity-60"
                  >
                    Ajouter
                  </button>
                ) : null}
              </div>
              <label className="grid gap-1 text-xs text-zinc-300 md:col-span-3">
                Texte
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  disabled={!canWriteProof}
                  className="min-h-24 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/25"
                />
              </label>
            </div>
            {proofError ? <div className="mt-3 text-xs text-rose-200">{proofError}</div> : null}
            <div className="mt-4 grid gap-2">
              {(proof?.reviews || []).length === 0 ? (
                <div className="text-xs text-zinc-400">Aucun avis.</div>
              ) : (
                (proof?.reviews || []).map((r) => (
                  <div key={r.review_id} className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-4 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-300">
                        <span className="font-semibold text-white">{r.author_name}</span>
                        <span>{'★'.repeat(Math.max(0, Math.min(5, Number(r.rating || 0))))}</span>
                        <span className="text-zinc-500">{new Date(r.created_at).toLocaleString()}</span>
                      </div>
                      <div className="mt-2 text-sm text-zinc-200">{r.text}</div>
                    </div>
                    <div className="flex shrink-0 justify-end">
                      {canWriteProof ? (
                        <button
                          onClick={() => deleteReview(r.review_id)}
                          disabled={proofSaving}
                          className="rounded-xl border border-white/10 bg-zinc-950/40 px-3 py-2 text-xs text-zinc-200 hover:bg-white/5 disabled:opacity-60"
                        >
                          Supprimer
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-zinc-950/40 p-5">
            <div className="text-sm font-semibold text-white">Photos (galerie)</div>
            <div className="mt-4 flex flex-col gap-2 md:flex-row md:items-end">
              <label className="grid flex-1 gap-1 text-xs text-zinc-300">
                URL image (https)
                <input
                  value={photoUrl}
                  onChange={(e) => setPhotoUrl(e.target.value)}
                  disabled={!canWriteProof}
                  className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
                />
              </label>
              {canWriteProof ? (
                <button
                  onClick={addPhoto}
                  disabled={proofSaving || !photoUrl.trim()}
                  className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-zinc-100 disabled:opacity-60"
                >
                  Ajouter
                </button>
              ) : null}
            </div>
            <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-end">
              <label className="grid flex-1 gap-1 text-xs text-zinc-300">
                Upload fichier
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
                  disabled={!canWriteProof}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200 file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-xs file:text-white hover:file:bg-white/15"
                />
              </label>
              {canWriteProof ? (
                <button
                  onClick={uploadPhoto}
                  disabled={proofSaving || !photoFile}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-60"
                >
                  Uploader
                </button>
              ) : null}
            </div>
            {proofError ? <div className="mt-3 text-xs text-rose-200">{proofError}</div> : null}
            <div className="mt-4 grid gap-2 md:grid-cols-6">
              {(proof?.photos || []).map((p) => (
                <div key={p.photo_id} className="group relative overflow-hidden rounded-xl border border-white/10 bg-white/5">
                  <img src={p.url} alt="" className="aspect-[4/3] w-full object-cover opacity-90" />
                  {canWriteProof ? (
                    <button
                      onClick={() => deletePhoto(p.photo_id)}
                      disabled={proofSaving}
                      className="absolute right-2 top-2 rounded-lg border border-white/10 bg-zinc-950/70 px-2 py-1 text-[11px] text-white opacity-0 transition group-hover:opacity-100 disabled:opacity-40"
                    >
                      Suppr.
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-zinc-950/40 p-5">
            <div className="text-sm font-semibold text-white">Changer mon mot de passe</div>
            <div className="mt-1 text-xs text-zinc-300">Disponible pour owner et staff.</div>
            <div className="mt-4 grid gap-2 md:grid-cols-3">
              <label className="grid gap-1 text-xs text-zinc-300">
                Mot de passe actuel
                <input
                  type="password"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
                />
              </label>
              <label className="grid gap-1 text-xs text-zinc-300">
                Nouveau mot de passe
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
                />
              </label>
              <label className="grid gap-1 text-xs text-zinc-300">
                Confirmer le nouveau mot de passe
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
                />
              </label>
              <div className="md:col-span-3 flex items-center justify-between gap-3">
                <div className="text-xs">
                  {passwordError ? <div className="text-rose-200">{passwordError}</div> : null}
                  {passwordSuccess ? <div className="text-emerald-200">Mot de passe mis à jour.</div> : null}
                </div>
                <button
                  onClick={changePassword}
                  disabled={passwordSaving || !oldPassword || newPassword.length < 8 || newPassword !== confirmPassword}
                  className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-zinc-100 disabled:opacity-60"
                >
                  {passwordSaving ? 'Enregistrement…' : 'Changer le mot de passe'}
                </button>
              </div>
            </div>
          </div>

          {me?.role === 'owner' ? (
            <div className="rounded-2xl border border-white/10 bg-zinc-950/40 p-5">
              <div className="text-sm font-semibold text-white">Permissions staff</div>
              <div className="mt-1 text-xs text-zinc-300">Autoriser certaines actions aux comptes staff.</div>
              <div className="mt-4 grid gap-2 md:grid-cols-2">
                {[
                  { key: 'export_leads', label: 'Exporter CSV' },
                  { key: 'settings_write', label: 'Modifier réglages' },
                  { key: 'proof_write', label: 'Modifier avis/photos' },
                  { key: 'commissions_read', label: '% commissions (lecture)' },
                  { key: 'commissions_write', label: '% commissions (édition)' },
                  { key: 'prospection_read', label: 'Prospection (lecture)' },
                  { key: 'prospection_write', label: 'Prospection (édition)' },
                  { key: 'prospection_validate', label: 'Prospection (validation/envoi)' },
                  { key: 'audits_read', label: 'Audit IA (lecture)' },
                  { key: 'audits_write', label: 'Audit IA (édition)' },
                  { key: 'lead_anonymize', label: 'Anonymiser leads' },
                ].map((p) => (
                  <label key={p.key} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-200">
                    <input
                      type="checkbox"
                      checked={Boolean(config.settings?.staff_permissions?.[p.key])}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          settings: {
                            ...(config.settings || {}),
                            staff_permissions: { ...(config.settings?.staff_permissions || {}), [p.key]: e.target.checked },
                          },
                        })
                      }
                    />
                    {p.label}
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          {me?.role === 'owner' ? (
            <div className="rounded-2xl border border-white/10 bg-zinc-950/40 p-5">
              <div className="text-sm font-semibold text-white">Équipe</div>
              <div className="mt-1 text-xs text-zinc-300">Ajouter des comptes staff (accès backoffice).</div>

              <div className="mt-4 grid gap-2 md:grid-cols-3">
                <label className="grid gap-1 text-xs text-zinc-300">
                  Username
                  <input
                    value={staffUsername}
                    onChange={(e) => setStaffUsername(e.target.value)}
                    className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
                  />
                </label>
                <label className="grid gap-1 text-xs text-zinc-300">
                  Email (optionnel)
                  <input
                    value={staffEmail}
                    onChange={(e) => setStaffEmail(e.target.value)}
                    className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
                  />
                </label>
                <label className="grid gap-1 text-xs text-zinc-300">
                  Mot de passe
                  <input
                    type="password"
                    value={staffPassword}
                    onChange={(e) => setStaffPassword(e.target.value)}
                    className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
                  />
                </label>
                <div className="md:col-span-3 flex justify-end">
                  <button
                    onClick={addStaff}
                    disabled={teamSaving || !staffUsername.trim() || staffPassword.length < 8}
                    className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-zinc-100 disabled:opacity-60"
                  >
                    Ajouter staff
                  </button>
                </div>
              </div>
              {teamError ? <div className="mt-3 text-xs text-rose-200">{teamError}</div> : null}
              <div className="mt-4 grid gap-2">
                {users.map((u) => (
                  <div key={u.user_id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white">{u.username}</div>
                      <div className="mt-1 text-xs text-zinc-300">
                        {u.role}
                        {u.email ? ` • ${u.email}` : ''}
                      </div>
                      <div className="mt-3 grid gap-2">
                        <label className="grid gap-1 text-xs text-zinc-300">
                          Téléphone 2FA (E.164)
                          <input
                            value={mfaPhones[u.user_id] ?? ''}
                            onChange={(e) => setMfaPhones((s) => ({ ...s, [u.user_id]: e.target.value }))}
                            className="h-9 rounded-xl border border-white/10 bg-white/5 px-3 text-xs text-white outline-none focus:border-white/25"
                          />
                        </label>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => saveMfa(u.user_id, true)}
                            disabled={teamSaving}
                            className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-zinc-950 hover:bg-zinc-100 disabled:opacity-60"
                          >
                            Activer 2FA
                          </button>
                          <button
                            onClick={() => saveMfa(u.user_id, false)}
                            disabled={teamSaving}
                            className="rounded-xl border border-white/10 bg-zinc-950/40 px-3 py-2 text-xs text-zinc-200 hover:bg-white/5 disabled:opacity-60"
                          >
                            Désactiver
                          </button>
                          <div className="text-xs text-zinc-400">{u.mfa_enabled ? '2FA activé' : '2FA désactivé'}</div>
                        </div>
                      </div>
                    </div>
                    {u.role === 'staff' ? (
                      <button
                        onClick={() => deleteUser(u.user_id)}
                        disabled={teamSaving}
                        className="rounded-xl border border-white/10 bg-zinc-950/40 px-3 py-2 text-xs text-zinc-200 hover:bg-white/5 disabled:opacity-60"
                      >
                        Supprimer
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex justify-end" />
        </div>
      )}
      {previewOpen && siteBaseUrl ? (
        <div className="fixed inset-0 z-[100] flex flex-col bg-black/70">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-zinc-950/80 px-4 py-3 backdrop-blur">
            <div className="text-sm font-semibold text-white">Preview</div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPreviewNonce((n) => n + 1)}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10"
              >
                Rafraîchir
              </button>
              <button
                onClick={() => window.open(`${siteBaseUrl}?preview=1`, '_blank', 'noopener,noreferrer')}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10"
              >
                Nouvel onglet
              </button>
              <button
                onClick={() => {
                  try {
                    window.localStorage.removeItem(`site_preview:${businessId}`)
                  } catch {}
                  setPreviewOpen(false)
                }}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10"
              >
                Fermer
              </button>
            </div>
          </div>
          <iframe
            key={previewNonce}
            title="Preview"
            src={`${siteBaseUrl}?preview=1&t=${previewNonce}`}
            className="h-full w-full bg-white"
          />
        </div>
      ) : null}
    </BackofficeShell>
  )
}
