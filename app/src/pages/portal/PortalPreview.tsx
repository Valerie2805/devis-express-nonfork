import { useEffect, useMemo, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { apiFetch } from '@/lib/api'
import BlueprintPage from '@/components/site/BlueprintPage'

type SiteConfig = {
  business_id: string
  config: any
  content: any
}

function useQuery() {
  const location = useLocation()
  return useMemo(() => new URLSearchParams(location.search || ''), [location.search])
}

function sessionKey(portalId: string) {
  return `portal_session:${portalId}`
}

export default function PortalPreview() {
  const { portalId = '' } = useParams()
  const query = useQuery()
  const previewToken = String(query.get('t') || '').trim()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<SiteConfig | null>(null)

  useEffect(() => {
    let alive = true
    if (!portalId || !previewToken) {
      setError('Lien invalide')
      setLoading(false)
      return
    }
    const sess = window.localStorage.getItem(sessionKey(portalId))
    if (!sess) {
      setError('Accès requis')
      setLoading(false)
      return
    }

    setLoading(true)
    apiFetch(`/api/v1/public/portal/${encodeURIComponent(portalId)}/preview?t=${encodeURIComponent(previewToken)}&s=${encodeURIComponent(sess)}`)
      .then(async () => {
        const cfg = await apiFetch<SiteConfig>(
          `/api/v1/public/portal/${encodeURIComponent(portalId)}/site_config?t=${encodeURIComponent(previewToken)}&s=${encodeURIComponent(sess)}`,
        )
        if (!alive) return
        setData(cfg)
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
  }, [portalId, previewToken])

  if (loading) return <div className="min-h-dvh bg-white p-6 text-slate-700">Chargement…</div>
  if (error || !data) return <div className="min-h-dvh bg-white p-6 text-slate-700">{error || 'Erreur'}</div>

  return <BlueprintPage businessId={String(data.business_id)} pageKey="home" config={data.config} content={data.content} />
}

