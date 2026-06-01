import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { apiFetch } from '@/lib/api'

export type BusinessConfigResponse = {
  business_id: string
  config: any
  content: {
    site_copy: any
    tarifs: any
    tarifs_common: any
    form: any
    blueprints: any
    trade_label: string
    ab?: {
      hero_variant?: 'A' | 'B'
      experiments?: Record<string, { id: string; variant: 'A' | 'B'; version: number }>
    }
    google_reviews: any
    photos_real: any
  }
}

function deepMerge(base: any, override: any): any {
  if (override === null || override === undefined) return base
  if (Array.isArray(override)) return override
  if (typeof override !== 'object' || typeof base !== 'object' || base === null || Array.isArray(base)) return override
  const out: any = { ...base }
  for (const [k, v] of Object.entries(override)) out[k] = deepMerge(base?.[k], v)
  return out
}

export function useBusinessConfig(businessId: string) {
  const [data, setData] = useState<BusinessConfigResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const location = useLocation()

  useEffect(() => {
    let alive = true
    setLoading(true)
    apiFetch<BusinessConfigResponse>(`/api/v1/site/${businessId}/config${location.search || ''}`)
      .then((d) => {
        if (!alive) return
        const params = new URLSearchParams(location.search || '')
        const isPreview = params.get('preview') === '1'
        if (isPreview && typeof window !== 'undefined') {
          const raw = window.localStorage.getItem(`site_preview:${businessId}`)
          if (raw) {
            try {
              const parsed = JSON.parse(raw) as any
              const patch = parsed?.patch && typeof parsed.patch === 'object' ? parsed.patch : null
              if (patch) {
                const nextConfig = deepMerge(d.config, patch)
                const nextSiteCopy = d.content?.site_copy ? deepMerge(d.content.site_copy, nextConfig?.site_copy_override || null) : d.content?.site_copy
                setData({ ...d, config: nextConfig, content: { ...d.content, site_copy: nextSiteCopy } })
                setError(null)
                return
              }
            } catch {}
          }
        }
        setData(d)
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
  }, [businessId, location.search])

  return { data, error, loading }
}
