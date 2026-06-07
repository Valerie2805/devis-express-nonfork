import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import BackofficeShell from '@/components/backoffice/BackofficeShell'
import BackButton from '@/components/BackButton'
import { apiFetch, authHeaders } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

type ProspectRow = {
  prospect_id: string
  name: string
  trade_id: string | null
  phone: string | null
  website: string | null
  city: string | null
  rating: number | null
  reviews_count: number | null
  status: string
  imported_at: string
  emails: string[]
  notes: string | null
  address: string | null
  headcount_range?: string | null
  score: number
}

type PlaceRow = {
  place_id: string
  name: string
  address: string
  lat: number | null
  lng: number | null
  rating: number | null
  reviews_count: number | null
}

type SearchDiagnostic = {
  title: string
  cause: string
  actions: string[]
}

type SequenceStep = {
  id: string
  delay_minutes: number
  templates: { sms?: { text?: string }; email?: { subject?: string; text?: string } }
}

type SequenceRow = {
  sequence_id: string
  name: string
  enabled: boolean
  steps: SequenceStep[]
  created_at?: string
  updated_at?: string
}

type TaskRow = {
  task_id: string
  prospect_id: string
  kind: string
  run_at: string
  status: string
  last_error: string | null
  attempts: number
  sequence_id: string | null
  step_id: string | null
  approved_channel: 'sms' | 'email' | null
  approved_at: string | null
  payload: any
  prospect: { name: string; phone: string | null; emails: string[]; website: string | null; city: string | null }
}

function diagnosticFromSearchError(msg: string | null): SearchDiagnostic | null {
  const m = String(msg || '')
  if (!m) return null
  const lower = m.toLowerCase()
  if (lower.includes('missing google_places_api_key') || lower.includes('google places non configuré') || lower.includes('google places non configure')) {
    return {
      title: 'Diagnostic',
      cause: 'La clé Google Places n’est pas configurée côté serveur.',
      actions: [
        'Vercel → Project Settings → Environment Variables → ajouter GOOGLE_PLACES_API_KEY.',
        'Redeploy du projet Vercel après ajout/modification.',
      ],
    }
  }
  if (lower.includes('not authorized to use this api key') || lower.includes('empty referer')) {
    return {
      title: 'Diagnostic',
      cause: 'La clé Google est refusée car elle est restreinte (referrer/IP), incompatible avec un appel server-side (Vercel).',
      actions: [
        'Google Cloud Console → APIs & Services → Credentials → API key → Application restrictions = None.',
        'Vérifier que Places API est activée + billing actif.',
        'Vercel → vérifier GOOGLE_PLACES_API_KEY en Production + redeploy.',
      ],
    }
  }
  if (lower.includes('over_query_limit')) {
    return {
      title: 'Diagnostic',
      cause: 'Quota Google Places atteint.',
      actions: ['Google Cloud Console → Quotas → augmenter le quota ou attendre le reset.', 'Réduire le volume de requêtes (batch plus petit).'],
    }
  }
  return null
}

export default function Prospection() {
  const { businessId = '' } = useParams()
  const { token } = useAuthStore()
  const [me, setMe] = useState<{ role: 'owner' | 'staff' } | null>(null)
  const [staffPerms, setStaffPerms] = useState<Record<string, any>>({})
  const [items, setItems] = useState<ProspectRow[]>([])
  const [total, setTotal] = useState(0)
  const [statsTotal, setStatsTotal] = useState(0)
  const [series, setSeries] = useState<{ d: string; c: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [tradeQuery, setTradeQuery] = useState('')
  const [cityQuery, setCityQuery] = useState('')
  const [deptQuery, setDeptQuery] = useState('')
  const [placesHeadcountRange, setPlacesHeadcountRange] = useState('')
  const [placesRevenueLevel, setPlacesRevenueLevel] = useState('')
  const [searching, setSearching] = useState(false)
  const [places, setPlaces] = useState<PlaceRow[]>([])
  const [searchError, setSearchError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [importing, setImporting] = useState(false)
  const [tradeId, setTradeId] = useState('')
  const [actionInfo, setActionInfo] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [prospectQuery, setProspectQuery] = useState('')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [prospectStatus, setProspectStatus] = useState('')
  const [headcountRange, setHeadcountRange] = useState('')
  const [hasPhone, setHasPhone] = useState(false)
  const [hasEmail, setHasEmail] = useState(false)
  const [hasWebsite, setHasWebsite] = useState(false)
  const [sortProspects, setSortProspects] = useState<'imported_at' | 'score'>('imported_at')
  const [scoreMin, setScoreMin] = useState('')
  const [scoreMax, setScoreMax] = useState('')
  const [expandedReviewsId, setExpandedReviewsId] = useState<string | null>(null)
  const [reviewsByProspectId, setReviewsByProspectId] = useState<Record<string, { loading: boolean; error: string | null; items: any[] }>>({})
  const [expandedProspectId, setExpandedProspectId] = useState<string | null>(null)
  const [messagesByProspectId, setMessagesByProspectId] = useState<Record<string, { loading: boolean; error: string | null; items: any[] }>>({})
  const [tasksByProspectId, setTasksByProspectId] = useState<Record<string, { loading: boolean; error: string | null; items: TaskRow[] }>>({})
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({})
  const [statusDraft, setStatusDraft] = useState<Record<string, string>>({})
  const [selectedProspects, setSelectedProspects] = useState<Record<string, boolean>>({})
  const [sequenceChoice, setSequenceChoice] = useState<Record<string, string>>({})
  const [sequences, setSequences] = useState<SequenceRow[]>([])
  const [sequencesLoading, setSequencesLoading] = useState(false)
  const [sequencesError, setSequencesError] = useState<string | null>(null)
  const [sequenceEditingId, setSequenceEditingId] = useState<string | null>(null)
  const [sequenceName, setSequenceName] = useState('')
  const [sequenceEnabled, setSequenceEnabled] = useState(true)
  const [sequenceSteps, setSequenceSteps] = useState<SequenceStep[]>([
    { id: 'step_1', delay_minutes: 0, templates: { sms: { text: 'Bonjour' }, email: { subject: 'Bonjour', text: 'Bonjour' } } },
  ])
  const [sequenceSaving, setSequenceSaving] = useState(false)
  const [bulkSequenceId, setBulkSequenceId] = useState('')
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [tasksLoading, setTasksLoading] = useState(false)
  const [tasksError, setTasksError] = useState<string | null>(null)
  const [tasksDueOnly, setTasksDueOnly] = useState(true)
  const [tasksChannel, setTasksChannel] = useState<'sms' | 'email'>('sms')
  const [taskActionLoading, setTaskActionLoading] = useState<Record<string, boolean>>({})
  const [selectedTasks, setSelectedTasks] = useState<Record<string, boolean>>({})

  const title = useMemo(() => 'Prospection', [])
  const canSearch = Boolean(tradeQuery.trim() || cityQuery.trim() || deptQuery.trim())
  const diag = useMemo(() => diagnosticFromSearchError(searchError), [searchError])
  const canWrite = me?.role === 'owner' || Boolean(staffPerms.prospection_write)
  const canValidate = me?.role === 'owner' || Boolean(staffPerms.prospection_validate)

  useEffect(() => {
    let alive = true
    if (!token) return
    Promise.all([
      apiFetch<{ role: 'owner' | 'staff' }>(`/api/v1/backoffice/${businessId}/me`, { headers: { ...authHeaders(token) } }),
      apiFetch<{ config: any }>(`/api/v1/backoffice/${businessId}/settings`, { headers: { ...authHeaders(token) } }),
    ])
      .then(([meRes, settingsRes]) => {
        if (!alive) return
        setMe(meRes)
        const sp = settingsRes?.config?.settings?.staff_permissions
        setStaffPerms(sp && typeof sp === 'object' ? sp : {})
      })
      .catch(() => {
        if (!alive) return
        setMe(null)
        setStaffPerms({})
      })
    return () => {
      alive = false
    }
  }, [businessId, token])

  async function loadProspects(signal?: AbortSignal) {
    const qs = new URLSearchParams()
    qs.set('limit', '50')
    qs.set('offset', '0')
    if (prospectQuery.trim()) qs.set('q', prospectQuery.trim())
    if (includeArchived) qs.set('include_archived', '1')
    if (prospectStatus) qs.set('status', prospectStatus)
    if (headcountRange) qs.set('headcount_range', headcountRange)
    if (hasPhone) qs.set('has_phone', '1')
    if (hasEmail) qs.set('has_email', '1')
    if (hasWebsite) qs.set('has_website', '1')
    if (sortProspects) qs.set('sort', sortProspects)
    if (scoreMin.trim()) qs.set('score_min', scoreMin.trim())
    if (scoreMax.trim()) qs.set('score_max', scoreMax.trim())
    const d = await apiFetch<{ items: ProspectRow[]; total: number }>(`/api/v1/backoffice/${businessId}/prospection/prospects?${qs.toString()}`, {
      headers: { ...authHeaders(token) },
      signal,
    })
    setItems(Array.isArray(d.items) ? d.items : [])
    setTotal(Number(d.total || 0))
  }

  async function loadStats(signal?: AbortSignal) {
    const d = await apiFetch<{ total: number; series: { d: string; c: number }[] }>(`/api/v1/backoffice/${businessId}/prospection/stats`, {
      headers: { ...authHeaders(token) },
      signal,
    })
    setStatsTotal(Number(d.total || 0))
    setSeries(Array.isArray(d.series) ? d.series : [])
  }

  async function loadSequences() {
    setSequencesLoading(true)
    setSequencesError(null)
    try {
      const d = await apiFetch<{ items: SequenceRow[] }>(`/api/v1/backoffice/${businessId}/prospection/sequences`, { headers: { ...authHeaders(token) } })
      setSequences(Array.isArray(d.items) ? d.items : [])
    } catch (e) {
      setSequencesError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSequencesLoading(false)
    }
  }

  function resetSequenceForm() {
    setSequenceEditingId(null)
    setSequenceName('')
    setSequenceEnabled(true)
    setSequenceSteps([{ id: 'step_1', delay_minutes: 0, templates: { sms: { text: 'Bonjour' }, email: { subject: 'Bonjour', text: 'Bonjour' } } }])
  }

  function addSequenceStep() {
    const nextId = `step_${sequenceSteps.length + 1}`
    setSequenceSteps((prev) => [...prev, { id: nextId, delay_minutes: 0, templates: { sms: { text: '' }, email: { subject: '', text: '' } } }])
  }

  function updateSequenceStep(idx: number, patch: Partial<SequenceStep>) {
    setSequenceSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)))
  }

  function removeSequenceStep(idx: number) {
    setSequenceSteps((prev) => prev.filter((_, i) => i !== idx))
  }

  function startEditSequence(seq: SequenceRow) {
    setSequenceEditingId(seq.sequence_id)
    setSequenceName(String(seq.name || ''))
    setSequenceEnabled(Boolean(seq.enabled))
    setSequenceSteps(Array.isArray(seq.steps) && seq.steps.length ? seq.steps : [{ id: 'step_1', delay_minutes: 0, templates: { sms: { text: '' }, email: { subject: '', text: '' } } }])
  }

  async function createSequence() {
    if (!canWrite) {
      setSequencesError('Permission requise (Prospection édition).')
      return
    }
    setSequencesError(null)
    const name = sequenceName.trim()
    if (!name) {
      setSequencesError('Nom requis.')
      return
    }
    const steps = sequenceSteps
      .map((s) => ({
        id: String(s.id || '').trim(),
        delay_minutes: Number(s.delay_minutes || 0) || 0,
        templates: s.templates || {},
      }))
      .filter((s) => s.id)
    if (!steps || steps.length === 0) {
      setSequencesError('Au moins une étape est requise.')
      return
    }
    setSequenceSaving(true)
    try {
      if (sequenceEditingId) {
        await apiFetch(`/api/v1/backoffice/${businessId}/prospection/sequences/${sequenceEditingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
          body: JSON.stringify({ name, enabled: sequenceEnabled, steps }),
        })
      } else {
        await apiFetch(`/api/v1/backoffice/${businessId}/prospection/sequences`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
          body: JSON.stringify({ name, enabled: sequenceEnabled, steps }),
        })
      }
      resetSequenceForm()
      await loadSequences()
    } catch (e) {
      setSequencesError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSequenceSaving(false)
    }
  }

  async function toggleSequenceEnabled(sequenceId: string, enabled: boolean) {
    if (!canWrite) return
    try {
      await apiFetch(`/api/v1/backoffice/${businessId}/prospection/sequences/${sequenceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({ enabled }),
      })
      await loadSequences()
    } catch (e) {
      setSequencesError(e instanceof Error ? e.message : 'Erreur')
    }
  }

  async function deleteSequence(sequenceId: string) {
    if (!canWrite) return
    if (!window.confirm('Supprimer cette séquence ?')) return
    try {
      await apiFetch(`/api/v1/backoffice/${businessId}/prospection/sequences/${sequenceId}`, {
        method: 'DELETE',
        headers: { ...authHeaders(token) },
      })
      await loadSequences()
      if (sequenceEditingId === sequenceId) resetSequenceForm()
    } catch (e) {
      setSequencesError(e instanceof Error ? e.message : 'Erreur')
    }
  }

  async function activateSequence(sequenceId: string, prospectIds: string[]) {
    if (!canWrite) {
      setActionError('Permission requise (Prospection édition).')
      return
    }
    const ids = prospectIds.map((s) => String(s || '').trim()).filter(Boolean)
    if (!sequenceId || ids.length === 0) return
    setActionInfo(null)
    setActionError(null)
    try {
      const r = await apiFetch<{ created: number }>(`/api/v1/backoffice/${businessId}/prospection/sequences/${sequenceId}/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({ prospect_ids: ids }),
      })
      setActionInfo(`Tasks créées : ${Number((r as any)?.created || 0)}`)
      await loadTasks()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Erreur')
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    if (!token) return () => controller.abort()
    setLoading(true)
    Promise.all([loadProspects(controller.signal), loadStats(controller.signal), loadSequences()])
      .then(() => setError(null))
      .catch((e) => setError(e instanceof Error ? e.message : 'Erreur'))
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [businessId, token, includeArchived])

  async function loadTasks() {
    setTasksLoading(true)
    setTasksError(null)
    try {
      const qs = new URLSearchParams()
      qs.set('status', 'pending_review')
      qs.set('limit', '100')
      if (tasksDueOnly) qs.set('due', '1')
      const d = await apiFetch<{ items: TaskRow[] }>(`/api/v1/backoffice/${businessId}/prospection/tasks?${qs.toString()}`, {
        headers: { ...authHeaders(token) },
      })
      const next = Array.isArray(d.items) ? d.items : []
      setTasks(next)
      setSelectedTasks((prev) => {
        const keep: Record<string, boolean> = {}
        for (const t of next) {
          if (prev[t.task_id]) keep[t.task_id] = true
        }
        return keep
      })
    } catch (e) {
      setTasksError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setTasksLoading(false)
    }
  }

  async function onSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!canWrite) {
      setSearchError('Permission requise (Prospection édition).')
      return
    }
    const q = [tradeQuery, cityQuery, deptQuery].map((s) => String(s || '').trim()).filter(Boolean).join(' ')
    if (!q) return
    setSearching(true)
    setSearchError(null)
    try {
      const data = await apiFetch<{ results: PlaceRow[] }>(`/api/v1/backoffice/${businessId}/prospection/search_places`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({ query: q }),
      })
      setPlaces(Array.isArray(data.results) ? data.results : [])
      setSelected({})
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSearching(false)
    }
  }

  async function onImport() {
    if (!canWrite) {
      setSearchError('Permission requise (Prospection édition).')
      return
    }
    const ids = Object.entries(selected)
      .filter(([, v]) => v)
      .map(([k]) => k)
    if (!ids.length) return
    setImporting(true)
    setSearchError(null)
    try {
      await apiFetch(`/api/v1/backoffice/${businessId}/prospection/import_places`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({
          place_ids: ids,
          trade_id: tradeId.trim() || undefined,
          headcount_range: placesHeadcountRange || undefined,
          revenue_level: placesRevenueLevel || undefined,
        }),
      })
      await Promise.all([loadProspects(), loadStats()])
      setSelected({})
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setImporting(false)
    }
  }

  async function archiveProspect(prospectId: string) {
    if (!canWrite) {
      setActionError('Permission requise (Prospection édition).')
      return
    }
    setActionInfo(null)
    setActionError(null)
    try {
      await apiFetch(`/api/v1/backoffice/${businessId}/prospection/prospects/${prospectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({ status: 'archived' }),
      })
      await loadProspects()
      setActionInfo('Prospect archivé.')
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Erreur')
    }
  }

  async function restoreProspect(prospectId: string) {
    if (!canWrite) {
      setActionError('Permission requise (Prospection édition).')
      return
    }
    setActionInfo(null)
    setActionError(null)
    try {
      await apiFetch(`/api/v1/backoffice/${businessId}/prospection/prospects/${prospectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({ status: 'new' }),
      })
      await loadProspects()
      setActionInfo('Prospect restauré.')
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Erreur')
    }
  }

  async function archiveBulk() {
    if (!canWrite) {
      setActionError('Permission requise (Prospection édition).')
      return
    }
    if (!window.confirm('Archiver tous les prospects filtrés ?')) return
    setActionInfo(null)
    setActionError(null)
    try {
      const r = await apiFetch<{ archived: number }>(`/api/v1/backoffice/${businessId}/prospection/prospects/archive_bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({ q: prospectQuery.trim() || undefined, limit: 200 }),
      })
      await loadProspects()
      setActionInfo(`Prospects archivés : ${Number((r as any)?.archived || 0)}`)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Erreur')
    }
  }

  async function toggleReviews(prospectId: string) {
    if (expandedReviewsId === prospectId) {
      setExpandedReviewsId(null)
      return
    }
    setExpandedReviewsId(prospectId)
    if (reviewsByProspectId[prospectId]?.items?.length) return
    setReviewsByProspectId((p) => ({ ...p, [prospectId]: { loading: true, error: null, items: [] } }))
    try {
      const r = await apiFetch<{ items: any[] }>(`/api/v1/backoffice/${businessId}/prospection/prospects/${prospectId}/reviews?limit=10&offset=0`, {
        headers: { ...authHeaders(token) },
      })
      setReviewsByProspectId((p) => ({ ...p, [prospectId]: { loading: false, error: null, items: Array.isArray(r.items) ? r.items : [] } }))
    } catch (e) {
      setReviewsByProspectId((p) => ({ ...p, [prospectId]: { loading: false, error: e instanceof Error ? e.message : 'Erreur', items: [] } }))
    }
  }

  async function loadMessages(prospectId: string) {
    setMessagesByProspectId((p) => ({ ...p, [prospectId]: { loading: true, error: null, items: [] } }))
    try {
      const r = await apiFetch<{ items: any[] }>(`/api/v1/backoffice/${businessId}/prospection/prospects/${prospectId}/messages?limit=50&offset=0`, {
        headers: { ...authHeaders(token) },
      })
      setMessagesByProspectId((p) => ({ ...p, [prospectId]: { loading: false, error: null, items: Array.isArray(r.items) ? r.items : [] } }))
    } catch (e) {
      setMessagesByProspectId((p) => ({ ...p, [prospectId]: { loading: false, error: e instanceof Error ? e.message : 'Erreur', items: [] } }))
    }
  }

  async function loadProspectTasks(prospectId: string) {
    setTasksByProspectId((p) => ({ ...p, [prospectId]: { loading: true, error: null, items: [] } }))
    try {
      const qs = new URLSearchParams()
      qs.set('prospect_id', prospectId)
      qs.set('limit', '50')
      const r = await apiFetch<{ items: TaskRow[] }>(`/api/v1/backoffice/${businessId}/prospection/tasks?${qs.toString()}`, {
        headers: { ...authHeaders(token) },
      })
      setTasksByProspectId((p) => ({ ...p, [prospectId]: { loading: false, error: null, items: Array.isArray(r.items) ? r.items : [] } }))
    } catch (e) {
      setTasksByProspectId((p) => ({ ...p, [prospectId]: { loading: false, error: e instanceof Error ? e.message : 'Erreur', items: [] } }))
    }
  }

  function toggleProspectDetail(p: ProspectRow) {
    const pid = p.prospect_id
    if (expandedProspectId === pid) {
      setExpandedProspectId(null)
      return
    }
    setExpandedProspectId(pid)
    setNotesDraft((prev) => ({ ...prev, [pid]: prev[pid] !== undefined ? prev[pid] : String(p.notes || '') }))
    setStatusDraft((prev) => ({ ...prev, [pid]: prev[pid] !== undefined ? prev[pid] : String(p.status || 'new') }))
    if (!messagesByProspectId[pid]?.items?.length) void loadMessages(pid)
    if (!tasksByProspectId[pid]?.items?.length) void loadProspectTasks(pid)
  }

  async function saveProspect(prospectId: string) {
    if (!canWrite) {
      setActionError('Permission requise (Prospection édition).')
      return
    }
    setActionInfo(null)
    setActionError(null)
    try {
      await apiFetch(`/api/v1/backoffice/${businessId}/prospection/prospects/${prospectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({ status: statusDraft[prospectId], notes: notesDraft[prospectId] }),
      })
      await loadProspects()
      setActionInfo('Prospect mis à jour.')
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Erreur')
    }
  }

  async function importReviews(prospectId: string) {
    if (!canWrite) {
      setActionError('Permission requise (Prospection édition).')
      return
    }
    setActionInfo(null)
    setActionError(null)
    try {
      const r = await apiFetch<{ inserted: number; processed: number }>(`/api/v1/backoffice/${businessId}/prospection/import_reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({ prospect_ids: [prospectId], limit: 1 }),
      })
      setActionInfo(`Avis importés : ${Number((r as any)?.inserted || 0)}`)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Erreur')
    }
  }

  async function importReviewsBulk() {
    if (!canWrite) {
      setActionError('Permission requise (Prospection édition).')
      return
    }
    setActionInfo(null)
    setActionError(null)
    try {
      const r = await apiFetch<{ inserted: number; processed: number }>(`/api/v1/backoffice/${businessId}/prospection/import_reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({ limit: 20 }),
      })
      setActionInfo(`Avis importés : ${Number((r as any)?.inserted || 0)}`)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Erreur')
    }
  }

  async function approveTask(taskId: string, opts: { send: boolean; runAt?: string | null }) {
    if (!canValidate) {
      setActionError('Permission requise (Prospection validation/envoi).')
      return
    }
    setActionInfo(null)
    setActionError(null)
    setTaskActionLoading((p) => ({ ...p, [taskId]: true }))
    try {
      await apiFetch(`/api/v1/backoffice/${businessId}/prospection/tasks/${taskId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({ channel: tasksChannel, send: opts.send, run_at: opts.runAt || undefined }),
      })
      await loadTasks()
      setActionInfo(opts.send ? 'Task approuvée et envoyée.' : 'Task approuvée.')
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setTaskActionLoading((p) => ({ ...p, [taskId]: false }))
    }
  }

  function planTask(t: TaskRow) {
    if (!canValidate) {
      setActionError('Permission requise (Prospection validation/envoi).')
      return
    }
    const def = t.run_at ? String(t.run_at).slice(0, 16) : ''
    const next = window.prompt('Planifier (YYYY-MM-DDTHH:MM)', def)
    if (!next) return
    const iso = new Date(next).toISOString()
    void approveTask(t.task_id, { send: false, runAt: iso })
  }

  async function cancelTask(taskId: string) {
    if (!canValidate) {
      setActionError('Permission requise (Prospection validation/envoi).')
      return
    }
    if (!window.confirm('Annuler cette task ?')) return
    setActionInfo(null)
    setActionError(null)
    setTaskActionLoading((p) => ({ ...p, [taskId]: true }))
    try {
      await apiFetch(`/api/v1/backoffice/${businessId}/prospection/tasks/${taskId}/cancel`, {
        method: 'POST',
        headers: { ...authHeaders(token) },
      })
      await loadTasks()
      setActionInfo('Task annulée.')
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setTaskActionLoading((p) => ({ ...p, [taskId]: false }))
    }
  }

  async function approveSequence(sequenceId: string, opts: { send: boolean }) {
    if (!canValidate) {
      setActionError('Permission requise (Prospection validation/envoi).')
      return
    }
    const key = `seq:${sequenceId}`
    if (opts.send && !window.confirm('Approuver et envoyer toute la séquence ?')) return
    setActionInfo(null)
    setActionError(null)
    setTaskActionLoading((p) => ({ ...p, [key]: true }))
    try {
      await apiFetch(`/api/v1/backoffice/${businessId}/prospection/sequences/${sequenceId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({ channel: tasksChannel, send: opts.send, due_only: tasksDueOnly }),
      })
      await loadTasks()
      setActionInfo(opts.send ? 'Séquence approuvée et envoyée.' : 'Séquence approuvée.')
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setTaskActionLoading((p) => ({ ...p, [key]: false }))
    }
  }

  async function bulkApproveSelectedTasks(opts: { send: boolean }) {
    if (!canValidate) {
      setActionError('Permission requise (Prospection validation/envoi).')
      return
    }
    const ids = Object.entries(selectedTasks)
      .filter(([, v]) => v)
      .map(([k]) => k)
    if (!ids.length) return
    if (opts.send && !window.confirm('Envoyer toutes les tâches sélectionnées ?')) return
    setActionInfo(null)
    setActionError(null)
    setTaskActionLoading((p) => ({ ...p, bulk: true }))
    try {
      await apiFetch(`/api/v1/backoffice/${businessId}/prospection/tasks/bulk_approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({ task_ids: ids, channel: tasksChannel, send: opts.send }),
      })
      setSelectedTasks({})
      await loadTasks()
      setActionInfo(opts.send ? 'Tâches envoyées.' : 'Tâches approuvées.')
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setTaskActionLoading((p) => ({ ...p, bulk: false }))
    }
  }

  const selectedTasksCount = Object.values(selectedTasks).filter(Boolean).length
  const maxSeries = Math.max(1, ...series.map((s) => Number(s.c || 0)))

  return (
    <BackofficeShell businessId={businessId}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <BackButton fallbackTo={`/backoffice/${businessId}`} />
          <div>
            <div className="text-xs uppercase tracking-wider text-zinc-400">{title}</div>
            <div className="mt-1 text-sm text-zinc-200">Recherche Google Places et import de prospects</div>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-zinc-950/40 p-4 md:col-span-2">
          <div className="text-sm font-semibold text-white">Recherche Google Places</div>
          {!canWrite && me?.role === 'staff' ? <div className="mt-1 text-xs text-zinc-400">Lecture seule (activer “Prospection (édition)” dans Réglages).</div> : null}
          <form onSubmit={onSearch} className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="grid flex-1 gap-2 sm:grid-cols-3">
              <label className="grid gap-1 text-xs text-zinc-300">
                Métier
                <input
                  value={tradeQuery}
                  onChange={(e) => setTradeQuery(e.target.value)}
                  disabled={!canWrite}
                  className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25 disabled:opacity-60"
                />
              </label>
              <label className="grid gap-1 text-xs text-zinc-300">
                Ville
                <input
                  value={cityQuery}
                  onChange={(e) => setCityQuery(e.target.value)}
                  disabled={!canWrite}
                  className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25 disabled:opacity-60"
                />
              </label>
              <label className="grid gap-1 text-xs text-zinc-300">
                Département
                <input
                  value={deptQuery}
                  onChange={(e) => setDeptQuery(e.target.value)}
                  disabled={!canWrite}
                  className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25 disabled:opacity-60"
                />
              </label>
            </div>
            <button
              type="submit"
              disabled={searching || !canSearch || !canWrite}
              className="h-10 rounded-xl bg-white px-4 text-sm font-semibold text-zinc-950 disabled:opacity-60"
            >
              {searching ? 'Recherche…' : 'Rechercher'}
            </button>
          </form>

          <div className="mt-3 grid gap-3 md:grid-cols-6">
            <label className="grid gap-1 text-xs text-zinc-300 md:col-span-2">
              Trade ID (optionnel)
              <input
                value={tradeId}
                onChange={(e) => setTradeId(e.target.value)}
                disabled={!canWrite}
                className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25 disabled:opacity-60"
              />
            </label>
            <label className="grid gap-1 text-xs text-zinc-300 md:col-span-2">
              Effectifs (optionnel)
              <select
                value={placesHeadcountRange}
                onChange={(e) => setPlacesHeadcountRange(e.target.value)}
                disabled={!canWrite}
                className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25 disabled:opacity-60"
              >
                <option value="" className="bg-zinc-950">
                  —
                </option>
                <option value="1_9" className="bg-zinc-950">
                  1 à 9 salariés
                </option>
                <option value="10_19" className="bg-zinc-950">
                  10 à 19 salariés
                </option>
                <option value="20_49" className="bg-zinc-950">
                  20 à 49 salariés
                </option>
                <option value="50_99" className="bg-zinc-950">
                  50 à 99 salariés
                </option>
                <option value="100_plus" className="bg-zinc-950">
                  100+ salariés
                </option>
              </select>
            </label>
            <label className="grid gap-1 text-xs text-zinc-300 md:col-span-2">
              Chiffre d’affaires (optionnel)
              <select
                value={placesRevenueLevel}
                onChange={(e) => setPlacesRevenueLevel(e.target.value)}
                disabled={!canWrite}
                className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25 disabled:opacity-60"
              >
                <option value="" className="bg-zinc-950">
                  —
                </option>
                <option value="up_to_100k" className="bg-zinc-950">
                  Jusqu’à 100 000 €
                </option>
                <option value="up_to_1m" className="bg-zinc-950">
                  Jusqu’à 1 M€
                </option>
                <option value="up_to_20m" className="bg-zinc-950">
                  Jusqu’à 20 M€
                </option>
                <option value="from_50m" className="bg-zinc-950">
                  À partir de 50 M€
                </option>
              </select>
            </label>
          </div>

          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={onImport}
              disabled={importing || Object.values(selected).every((v) => !v) || !canWrite}
              className="h-10 rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-zinc-200 hover:bg-white/10 disabled:opacity-60"
            >
              {importing ? 'Import…' : 'Importer'}
            </button>
          </div>

          {searchError ? <div className="mt-3 text-xs text-rose-200">{searchError}</div> : null}
          {diag ? (
            <div className="mt-3 rounded-xl border border-white/10 bg-black/30 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-white">{diag.title}</div>
                  <div className="mt-1 text-xs text-zinc-300">{diag.cause}</div>
                </div>
                <button
                  type="button"
                  onClick={() => (navigator as any)?.clipboard?.writeText?.(String(searchError || ''))}
                  className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-100 hover:bg-white/10"
                >
                  Copier l’erreur technique
                </button>
              </div>
              <div className="mt-2 grid gap-1 text-xs text-zinc-300">
                {diag.actions.map((a) => (
                  <div key={a}>- {a}</div>
                ))}
              </div>
            </div>
          ) : null}
          {places.length ? (
            <div className="mt-3 grid gap-2">
              {places.map((p) => (
                <div key={p.place_id} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      aria-label={`Sélectionner ${p.place_id}`}
                      checked={Boolean(selected[p.place_id])}
                      onChange={(e) => setSelected((prev) => ({ ...prev, [p.place_id]: e.target.checked }))}
                      disabled={!canWrite}
                      className="mt-1 h-4 w-4"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-white">{p.name}</div>
                      <div className="mt-1 text-xs text-zinc-300">{p.address}</div>
                    </div>
                  </label>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-white/10 bg-zinc-950/40 p-4">
          <div className="text-sm font-semibold text-white">Stats</div>
          <div className="mt-2 text-xs text-zinc-300">Prospects importés : {statsTotal}</div>
          <div className="mt-3 grid grid-cols-30 items-end gap-1">
            {series.slice(-30).map((s) => (
              <div
                key={s.d}
                title={`${s.d} · ${s.c}`}
                className="h-16 rounded bg-white/10"
                style={{ height: `${Math.max(6, Math.round((Number(s.c || 0) / maxSeries) * 64))}px` }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-8 rounded-2xl border border-white/10 bg-zinc-950/40 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-white">Séquences</div>
            <div className="mt-1 text-xs text-zinc-300">Créer/éditer une séquence, puis l’activer sur un prospect ou une sélection.</div>
          </div>
          <button
            type="button"
            onClick={() => void loadSequences()}
            disabled={sequencesLoading}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white hover:bg-white/10 disabled:opacity-60"
          >
            {sequencesLoading ? 'Chargement…' : 'Rafraîchir'}
          </button>
        </div>
        {sequencesError ? <div className="mt-3 text-xs text-rose-200">{sequencesError}</div> : null}
        <div className="mt-3 grid gap-3">
          <div className="grid gap-2 md:grid-cols-3">
            <label className="grid gap-1 text-xs text-zinc-300">
              Nom
              <input
                value={sequenceName}
                onChange={(e) => setSequenceName(e.target.value)}
                disabled={!canWrite}
                className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25 disabled:opacity-60"
              />
            </label>
            <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-200 md:col-span-2">
              <input type="checkbox" checked={sequenceEnabled} onChange={(e) => setSequenceEnabled(e.target.checked)} disabled={!canWrite} />
              Activée
              {sequenceEditingId ? <span className="text-zinc-400">({sequenceEditingId})</span> : null}
            </label>
          </div>

          <div className="grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold text-white">Étapes</div>
              <button
                type="button"
                onClick={addSequenceStep}
                disabled={!canWrite}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white hover:bg-white/10 disabled:opacity-60"
              >
                Ajouter une étape
              </button>
            </div>
            <div className="grid gap-2">
              {sequenceSteps.map((st, idx) => (
                <div key={`${st.id}-${idx}`} className="rounded-xl border border-white/10 bg-black/30 p-3">
                  <div className="grid gap-2 md:grid-cols-3">
                    <label className="grid gap-1 text-xs text-zinc-300">
                      ID
                      <input
                        value={st.id}
                        onChange={(e) => updateSequenceStep(idx, { id: e.target.value })}
                        disabled={!canWrite}
                        className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25 disabled:opacity-60"
                      />
                    </label>
                    <label className="grid gap-1 text-xs text-zinc-300">
                      Délai (minutes)
                      <input
                        value={String(st.delay_minutes ?? 0)}
                        onChange={(e) => updateSequenceStep(idx, { delay_minutes: Number(e.target.value || 0) })}
                        disabled={!canWrite}
                        className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25 disabled:opacity-60"
                      />
                    </label>
                    <div className="flex items-end justify-end">
                      <button
                        type="button"
                        onClick={() => removeSequenceStep(idx)}
                        disabled={!canWrite || sequenceSteps.length <= 1}
                        className="h-10 rounded-xl border border-white/10 bg-rose-500/10 px-3 text-xs text-rose-200 hover:bg-rose-500/15 disabled:opacity-60"
                      >
                        Supprimer
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    <label className="grid gap-1 text-xs text-zinc-300">
                      SMS (texte)
                      <textarea
                        value={String(st.templates?.sms?.text || '')}
                        onChange={(e) =>
                          updateSequenceStep(idx, { templates: { ...(st.templates || {}), sms: { ...(st.templates?.sms || {}), text: e.target.value } } })
                        }
                        disabled={!canWrite}
                        className="min-h-[72px] rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/25 disabled:opacity-60"
                      />
                    </label>
                    <label className="grid gap-1 text-xs text-zinc-300">
                      Email (sujet + texte)
                      <textarea
                        value={[String(st.templates?.email?.subject || ''), String(st.templates?.email?.text || '')].filter(Boolean).join('\n\n')}
                        onChange={(e) => {
                          const raw = e.target.value || ''
                          const parts = raw.split('\n')
                          const subject = parts[0] || ''
                          const text = parts.slice(1).join('\n').trim()
                          updateSequenceStep(idx, { templates: { ...(st.templates || {}), email: { subject, text } } })
                        }}
                        disabled={!canWrite}
                        className="min-h-[72px] rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/25 disabled:opacity-60"
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={bulkSequenceId}
                onChange={(e) => setBulkSequenceId(e.target.value)}
                className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
              >
                <option value="" className="bg-zinc-950">
                  Activer sur sélection…
                </option>
                {sequences.map((s) => (
                  <option key={String(s.sequence_id)} value={String(s.sequence_id)} className="bg-zinc-950">
                    {String(s.name || s.sequence_id)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void activateSequence(bulkSequenceId, Object.entries(selectedProspects).filter(([, v]) => v).map(([k]) => k))}
                disabled={!canWrite || !bulkSequenceId || Object.values(selectedProspects).every((v) => !v)}
                className="h-10 rounded-xl bg-white px-4 text-sm font-semibold text-zinc-950 hover:bg-zinc-100 disabled:opacity-60"
              >
                Activer
              </button>
            </div>
            <div className="flex items-center gap-2">
              {sequenceEditingId ? (
                <button
                  type="button"
                  onClick={resetSequenceForm}
                  className="h-10 rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white hover:bg-white/10"
                >
                  Annuler
                </button>
              ) : null}
              <button
                type="button"
                onClick={createSequence}
                disabled={!canWrite || sequenceSaving}
                className="h-10 rounded-xl bg-white px-4 text-sm font-semibold text-zinc-950 hover:bg-zinc-100 disabled:opacity-60"
              >
                {sequenceSaving ? 'Enregistrement…' : sequenceEditingId ? 'Enregistrer' : 'Créer'}
              </button>
            </div>
          </div>
        </div>
        {sequences.length ? (
          <div className="mt-3 grid gap-2">
            {sequences.slice(0, 20).map((s) => (
              <div key={String(s.sequence_id)} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-zinc-200">
                <div className="min-w-0">
                  <div className="font-semibold text-white">{String(s.name || s.sequence_id)}</div>
                  <div className="mt-1 text-zinc-400">
                    {String(s.sequence_id)} · {Array.isArray(s.steps) ? `${s.steps.length} étapes` : '0 étape'}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-100">
                    <input
                      type="checkbox"
                      checked={Boolean(s.enabled)}
                      onChange={(e) => void toggleSequenceEnabled(s.sequence_id, e.target.checked)}
                      disabled={!canWrite}
                    />
                    Enabled
                  </label>
                  <button
                    type="button"
                    onClick={() => startEditSequence(s)}
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white hover:bg-white/10"
                  >
                    Éditer
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteSequence(s.sequence_id)}
                    disabled={!canWrite}
                    className="rounded-xl border border-white/10 bg-rose-500/10 px-3 py-2 text-xs text-rose-200 hover:bg-rose-500/15 disabled:opacity-60"
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-semibold text-white">Prospects</div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIncludeArchived((p) => !p)}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white hover:bg-white/10"
          >
            {includeArchived ? 'Masquer archivés' : 'Afficher archivés'}
          </button>
          <button
            type="button"
            onClick={archiveBulk}
            disabled={!canWrite}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white hover:bg-white/10 disabled:opacity-60"
          >
            Archiver tous les prospects filtrés
          </button>
          <button
            type="button"
            onClick={importReviewsBulk}
            disabled={!canWrite}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white hover:bg-white/10 disabled:opacity-60"
          >
            Importer les avis existants
          </button>
        </div>
      </div>
      <div className="mt-3">
        <label className="text-xs font-semibold text-white">Rechercher un prospect</label>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            value={prospectQuery}
            onChange={(e) => setProspectQuery(e.target.value)}
            placeholder="Nom, ville, site, téléphone…"
            className="h-10 min-w-[260px] flex-1 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-zinc-500"
          />
          <select
            value={prospectStatus}
            onChange={(e) => setProspectStatus(e.target.value)}
            className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
          >
            <option value="" className="bg-zinc-950">
              Tous statuts
            </option>
            {['new', 'contacted', 'follow_up', 'converted', 'lost', 'archived'].map((s) => (
              <option key={s} value={s} className="bg-zinc-950">
                {s}
              </option>
            ))}
          </select>
          <select
            value={headcountRange}
            onChange={(e) => setHeadcountRange(e.target.value)}
            className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
          >
            <option value="" className="bg-zinc-950">
              Effectifs
            </option>
            <option value="1_9" className="bg-zinc-950">
              1 à 9 salariés
            </option>
            <option value="10_19" className="bg-zinc-950">
              10 à 19 salariés
            </option>
            <option value="20_49" className="bg-zinc-950">
              20 à 49 salariés
            </option>
            <option value="50_99" className="bg-zinc-950">
              50 à 99 salariés
            </option>
            <option value="100_plus" className="bg-zinc-950">
              100+ salariés
            </option>
          </select>
          <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-200">
            <input type="checkbox" checked={hasPhone} onChange={(e) => setHasPhone(e.target.checked)} />
            Tel
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-200">
            <input type="checkbox" checked={hasEmail} onChange={(e) => setHasEmail(e.target.checked)} />
            Email
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-200">
            <input type="checkbox" checked={hasWebsite} onChange={(e) => setHasWebsite(e.target.checked)} />
            Site
          </label>
          <select
            value={sortProspects}
            onChange={(e) => setSortProspects(e.target.value === 'score' ? 'score' : 'imported_at')}
            className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
          >
            <option value="imported_at" className="bg-zinc-950">
              Tri: import
            </option>
            <option value="score" className="bg-zinc-950">
              Tri: score
            </option>
          </select>
          <input
            value={scoreMin}
            onChange={(e) => setScoreMin(e.target.value)}
            placeholder="Score min"
            className="h-10 w-24 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-zinc-500"
          />
          <input
            value={scoreMax}
            onChange={(e) => setScoreMax(e.target.value)}
            placeholder="Score max"
            className="h-10 w-24 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-zinc-500"
          />
          <button
            type="button"
            onClick={() => void loadProspects()}
            className="h-10 rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-zinc-200 hover:bg-white/10"
          >
            Filtrer
          </button>
        </div>
      </div>
      {loading ? <div className="mt-4 text-sm text-zinc-300">Chargement…</div> : null}
      {error ? <div className="mt-4 text-sm text-rose-200">{error}</div> : null}
      {actionError ? <div className="mt-3 text-xs text-rose-200">{actionError}</div> : null}
      {actionInfo ? <div className="mt-3 text-xs text-emerald-200">{actionInfo}</div> : null}
      {!loading && !error ? (
        <div className="mt-4 grid gap-2">
          {items.map((p) => (
            <div key={p.prospect_id} className="rounded-xl border border-white/10 bg-zinc-950/40 px-4 py-3">
              <div className="flex items-center justify-between gap-4">
                <label className="flex min-w-0 items-start gap-3">
                  <input
                    type="checkbox"
                    aria-label={`Sélectionner prospect ${p.prospect_id}`}
                    checked={Boolean(selectedProspects[p.prospect_id])}
                    onChange={(e) => setSelectedProspects((prev) => ({ ...prev, [p.prospect_id]: e.target.checked }))}
                    disabled={!canWrite}
                    className="mt-1 h-4 w-4"
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white">{p.name}</div>
                    <div className="mt-1 text-xs text-zinc-300">
                      <span className="text-zinc-400">Score</span> {Number(p.score || 0)} · {p.city || '—'} ·{' '}
                      {p.website ? (
                      <a
  href={p.website.startsWith('http') ? p.website : `https://${p.website}`}
  target="_blank"
  rel="noreferrer noopener"
  className="underline decoration-white/30 underline-offset-2 hover:text-zinc-200"
>
  {p.website}
</a> 
                      ) : (
                        '—'
                      )}
                    </div>
                  </div>
                </label>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <div className="text-xs text-zinc-300">{p.status}</div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleProspectDetail(p)}
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-100 hover:bg-white/10"
                    >
                      {expandedProspectId === p.prospect_id ? 'Masquer détails' : 'Détails'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void toggleReviews(p.prospect_id)}
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-100 hover:bg-white/10"
                    >
                      {expandedReviewsId === p.prospect_id ? 'Masquer avis' : 'Voir avis'}
                    </button>
                    <button
                      type="button"
                      onClick={() => importReviews(p.prospect_id)}
                      disabled={!canWrite}
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-100 hover:bg-white/10 disabled:opacity-60"
                    >
                      Importer avis
                    </button>
                    {p.status === 'archived' ? (
                      <button
                        type="button"
                        onClick={() => restoreProspect(p.prospect_id)}
                        disabled={!canWrite}
                        className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-100 hover:bg-white/10 disabled:opacity-60"
                      >
                        Restaurer
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => archiveProspect(p.prospect_id)}
                        disabled={!canWrite}
                        className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-100 hover:bg-white/10 disabled:opacity-60"
                      >
                        Archiver
                      </button>
                    )}
                  </div>
                </div>
              </div>
              {expandedReviewsId === p.prospect_id ? (
                <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
                  {reviewsByProspectId[p.prospect_id]?.loading ? <div className="text-xs text-zinc-300">Chargement…</div> : null}
                  {reviewsByProspectId[p.prospect_id]?.error ? (
                    <div className="text-xs text-rose-200">{reviewsByProspectId[p.prospect_id]?.error}</div>
                  ) : null}
                  {!reviewsByProspectId[p.prospect_id]?.loading && !reviewsByProspectId[p.prospect_id]?.error ? (
                    <div className="grid gap-2">
                      {(reviewsByProspectId[p.prospect_id]?.items || []).length === 0 ? (
                        <div className="text-xs text-zinc-300">Aucun avis.</div>
                      ) : (
                        (reviewsByProspectId[p.prospect_id]?.items || []).map((rv: any, idx: number) => (
                          <div key={idx} className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-zinc-200">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="font-semibold text-white">{String(rv?.author_name || '—')}</div>
                              <div className="text-zinc-400">
                                {rv?.rating !== null && rv?.rating !== undefined ? `${Number(rv.rating)}/5` : '—'} ·{' '}
                                {rv?.created_at ? new Date(String(rv.created_at)).toLocaleDateString('fr-FR') : '—'}
                              </div>
                            </div>
                            {rv?.text ? <div className="mt-2 text-zinc-200">{String(rv.text)}</div> : null}
                          </div>
                        ))
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {expandedProspectId === p.prospect_id ? (
                <div className="mt-3 rounded-xl border border-white/10 bg-black/30 p-3">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="grid gap-1 text-xs text-zinc-200">
                      <div>
                        <span className="text-zinc-400">Téléphone</span> {p.phone || '—'}
                      </div>
                      <div>
                        <span className="text-zinc-400">Emails</span> {(p.emails || []).length ? (p.emails || []).join(', ') : '—'}
                      </div>
                      <div>
                        <span className="text-zinc-400">Adresse</span> {p.address || '—'}
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <div className="flex flex-wrap items-end gap-2">
                        <label className="grid flex-1 gap-1 text-xs text-zinc-300">
                          Activer séquence
                          <select
                            value={sequenceChoice[p.prospect_id] ?? ''}
                            onChange={(e) => setSequenceChoice((prev) => ({ ...prev, [p.prospect_id]: e.target.value }))}
                            disabled={!canWrite}
                            className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25 disabled:opacity-60"
                          >
                            <option value="" className="bg-zinc-950">
                              Choisir…
                            </option>
                            {sequences.map((s: any) => (
                              <option key={String(s.sequence_id)} value={String(s.sequence_id)} className="bg-zinc-950">
                                {String(s.name || s.sequence_id)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          type="button"
                          onClick={() => void activateSequence(sequenceChoice[p.prospect_id] ?? '', [p.prospect_id])}
                          disabled={!canWrite || !(sequenceChoice[p.prospect_id] ?? '')}
                          className="h-10 rounded-xl bg-white px-3 text-xs font-semibold text-zinc-950 hover:bg-zinc-100 disabled:opacity-60"
                        >
                          Activer
                        </button>
                      </div>
                      <label className="grid gap-1 text-xs text-zinc-300">
                        Statut
                        <select
                          value={statusDraft[p.prospect_id] ?? p.status}
                          onChange={(e) => setStatusDraft((prev) => ({ ...prev, [p.prospect_id]: e.target.value }))}
                          disabled={!canWrite}
                          className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25 disabled:opacity-60"
                        >
                          {['new', 'contacted', 'follow_up', 'converted', 'lost', 'archived'].map((s) => (
                            <option key={s} value={s} className="bg-zinc-950">
                              {s}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="grid gap-1 text-xs text-zinc-300">
                        Notes
                        <textarea
                          value={notesDraft[p.prospect_id] ?? String(p.notes || '')}
                          onChange={(e) => setNotesDraft((prev) => ({ ...prev, [p.prospect_id]: e.target.value }))}
                          disabled={!canWrite}
                          className="min-h-[90px] rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/25 disabled:opacity-60"
                        />
                      </label>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => void loadMessages(p.prospect_id)}
                          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white hover:bg-white/10"
                        >
                          Rafraîchir messages
                        </button>
                        <button
                          type="button"
                          onClick={() => void saveProspect(p.prospect_id)}
                          disabled={!canWrite}
                          className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-zinc-950 hover:bg-zinc-100 disabled:opacity-60"
                        >
                          Enregistrer
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs font-semibold text-white">Tâches</div>
                      <button
                        type="button"
                        onClick={() => void loadProspectTasks(p.prospect_id)}
                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white hover:bg-white/10"
                      >
                        Rafraîchir tâches
                      </button>
                    </div>
                    {tasksByProspectId[p.prospect_id]?.loading ? <div className="mt-2 text-xs text-zinc-300">Chargement…</div> : null}
                    {tasksByProspectId[p.prospect_id]?.error ? (
                      <div className="mt-2 text-xs text-rose-200">{tasksByProspectId[p.prospect_id]?.error}</div>
                    ) : null}
                    {!tasksByProspectId[p.prospect_id]?.loading && !tasksByProspectId[p.prospect_id]?.error ? (
                      <div className="mt-2 grid gap-2">
                        {(tasksByProspectId[p.prospect_id]?.items || []).length === 0 ? (
                          <div className="text-xs text-zinc-300">Aucune task.</div>
                        ) : (
                          (tasksByProspectId[p.prospect_id]?.items || []).slice(0, 10).map((t: any) => (
                            <div key={String(t.task_id)} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-200">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="font-semibold text-white">
                                  {String(t.status || '—')} · {t.run_at ? new Date(String(t.run_at)).toLocaleString('fr-FR') : '—'}
                                </div>
                                {String(t.status || '') === 'pending_review' ? (
                                  <div className="flex flex-wrap items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => void approveTask(String(t.task_id), { send: false })}
                                      disabled={!canValidate}
                                      className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white hover:bg-white/10 disabled:opacity-60"
                                    >
                                      Approuver
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => planTask(t as any)}
                                      disabled={!canValidate}
                                      className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white hover:bg-white/10 disabled:opacity-60"
                                    >
                                      Planifier
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void approveTask(String(t.task_id), { send: true })}
                                      disabled={!canValidate}
                                      className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-zinc-950 hover:bg-zinc-100 disabled:opacity-60"
                                    >
                                      Envoyer
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void cancelTask(String(t.task_id))}
                                      disabled={!canValidate}
                                      className="rounded-xl border border-white/10 bg-rose-500/10 px-3 py-2 text-xs text-rose-200 hover:bg-rose-500/15 disabled:opacity-60"
                                    >
                                      Annuler
                                    </button>
                                  </div>
                                ) : (
                                  <div className="text-zinc-400">{String(t.kind || '')}</div>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    ) : null}

                    <div className="text-xs font-semibold text-white">Historique messages</div>
                    {messagesByProspectId[p.prospect_id]?.loading ? <div className="mt-2 text-xs text-zinc-300">Chargement…</div> : null}
                    {messagesByProspectId[p.prospect_id]?.error ? (
                      <div className="mt-2 text-xs text-rose-200">{messagesByProspectId[p.prospect_id]?.error}</div>
                    ) : null}
                    {!messagesByProspectId[p.prospect_id]?.loading && !messagesByProspectId[p.prospect_id]?.error ? (
                      <div className="mt-2 grid gap-2">
                        {(messagesByProspectId[p.prospect_id]?.items || []).length === 0 ? (
                          <div className="text-xs text-zinc-300">Aucun message.</div>
                        ) : (
                          (messagesByProspectId[p.prospect_id]?.items || []).slice(0, 20).map((m: any) => (
                            <div key={String(m.message_id || Math.random())} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-200">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="font-semibold text-white">
                                  {String(m.direction || '—')} · {String(m.channel || '—')}
                                </div>
                                <div className="text-zinc-400">{m.created_at ? new Date(String(m.created_at)).toLocaleString('fr-FR') : '—'}</div>
                              </div>
                              {m.subject ? <div className="mt-1 text-zinc-200">{String(m.subject)}</div> : null}
                              {m.text ? <div className="mt-1 text-zinc-200">{String(m.text).slice(0, 240)}</div> : null}
                            </div>
                          ))
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          ))}
          {items.length === 0 ? <div className="text-sm text-zinc-300">Aucun prospect</div> : null}
          {items.length ? <div className="text-xs text-zinc-400">Total: {total}</div> : null}
        </div>
      ) : null}

      <div className="mt-10 rounded-2xl border border-white/10 bg-zinc-950/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold text-white">À valider</div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setTasksChannel('sms')}
              className={`rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold ${tasksChannel === 'sms' ? 'bg-white text-zinc-950' : 'bg-white/5 text-white hover:bg-white/10'}`}
            >
              SMS
            </button>
            <button
              type="button"
              onClick={() => setTasksChannel('email')}
              className={`rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold ${tasksChannel === 'email' ? 'bg-white text-zinc-950' : 'bg-white/5 text-white hover:bg-white/10'}`}
            >
              Email
            </button>
            <button
              type="button"
              onClick={() => setTasksDueOnly((p) => !p)}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white hover:bg-white/10"
            >
              {tasksDueOnly ? 'Inclure futures' : 'Seulement dues'}
            </button>
            <button
              type="button"
              onClick={() => void loadTasks()}
              disabled={tasksLoading}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white hover:bg-white/10 disabled:opacity-60"
            >
              {tasksLoading ? 'Chargement…' : 'Rafraîchir'}
            </button>
            <button
              type="button"
              onClick={() => void bulkApproveSelectedTasks({ send: false })}
              disabled={!canValidate || selectedTasksCount === 0 || Boolean(taskActionLoading.bulk)}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white hover:bg-white/10 disabled:opacity-60"
            >
              Approuver sélection ({selectedTasksCount})
            </button>
            <button
              type="button"
              onClick={() => void bulkApproveSelectedTasks({ send: true })}
              disabled={!canValidate || selectedTasksCount === 0 || Boolean(taskActionLoading.bulk)}
              className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-zinc-950 hover:bg-zinc-100 disabled:opacity-60"
            >
              Envoyer sélection ({selectedTasksCount})
            </button>
          </div>
        </div>
        {!canValidate && me?.role === 'staff' ? (
          <div className="mt-3 text-xs text-zinc-400">Lecture seule (activer “Prospection (validation/envoi)” dans Réglages).</div>
        ) : null}
        {tasksError ? <div className="mt-3 text-xs text-rose-200">{tasksError}</div> : null}
        {tasks.length === 0 && !tasksLoading && !tasksError ? <div className="mt-3 text-sm text-zinc-300">Aucune task.</div> : null}
        {tasks.length ? (
          <div className="mt-3 grid gap-2">
            {tasks.map((t) => {
              const tpl = t?.payload?.templates && typeof t.payload.templates === 'object' ? t.payload.templates : {}
              const smsText = tpl?.sms?.text ? String(tpl.sms.text) : ''
              const emailSubject = tpl?.email?.subject ? String(tpl.email.subject) : ''
              const emailText = tpl?.email?.text ? String(tpl.email.text) : ''
              const preview = tasksChannel === 'sms' ? smsText : [emailSubject, emailText].filter(Boolean).join(' — ')
              const seqKey = t.sequence_id ? `seq:${t.sequence_id}` : null
              const busy =
                Boolean(taskActionLoading.bulk) || Boolean(taskActionLoading[t.task_id]) || (seqKey ? Boolean(taskActionLoading[seqKey]) : false)
              return (
                <div key={t.task_id} className="rounded-xl border border-white/10 bg-black/30 px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <label className="flex min-w-0 items-start gap-3">
                      <input
                        type="checkbox"
                        aria-label={`Sélectionner task ${t.task_id}`}
                        checked={Boolean(selectedTasks[t.task_id])}
                        onChange={(e) => setSelectedTasks((prev) => ({ ...prev, [t.task_id]: e.target.checked }))}
                        disabled={!canValidate || busy}
                        className="mt-1 h-4 w-4"
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white">
                          {t.prospect?.name || '—'}{' '}
                          <span className="text-xs font-normal text-zinc-400">({new Date(t.run_at).toLocaleString('fr-FR')})</span>
                        </div>
                        {t.sequence_id ? <div className="mt-1 text-xs text-zinc-400">Séquence : {t.sequence_id}</div> : null}
                        <div className="mt-1 text-xs text-zinc-300">
                          {preview ? preview.slice(0, 220) : '—'} {preview && preview.length > 220 ? '…' : ''}
                        </div>
                        {t.last_error ? <div className="mt-1 text-xs text-rose-200">{t.last_error}</div> : null}
                      </div>
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      {t.sequence_id ? (
                        <>
                          <button
                            type="button"
                            onClick={() => void approveSequence(t.sequence_id as string, { send: false })}
                            disabled={busy || !canValidate}
                            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white hover:bg-white/10 disabled:opacity-60"
                          >
                            Approuver séq.
                          </button>
                          <button
                            type="button"
                            onClick={() => void approveSequence(t.sequence_id as string, { send: true })}
                            disabled={busy || !canValidate}
                            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white hover:bg-white/10 disabled:opacity-60"
                          >
                            Envoyer séq.
                          </button>
                        </>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void approveTask(t.task_id, { send: false })}
                        disabled={busy || !canValidate}
                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white hover:bg-white/10 disabled:opacity-60"
                      >
                        Approuver
                      </button>
                      <button
                        type="button"
                        onClick={() => planTask(t)}
                        disabled={busy || !canValidate}
                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white hover:bg-white/10 disabled:opacity-60"
                      >
                        Planifier
                      </button>
                      <button
                        type="button"
                        onClick={() => void approveTask(t.task_id, { send: true })}
                        disabled={busy || !canValidate}
                        className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-zinc-950 hover:bg-zinc-100 disabled:opacity-60"
                      >
                        Envoyer
                      </button>
                      <button
                        type="button"
                        onClick={() => void cancelTask(t.task_id)}
                        disabled={busy || !canValidate}
                        className="rounded-xl border border-white/10 bg-rose-500/10 px-3 py-2 text-xs text-rose-200 hover:bg-rose-500/15 disabled:opacity-60"
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : null}
      </div>
    </BackofficeShell>
  )
}
