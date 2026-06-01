import { useParams } from 'react-router-dom'
import { useBusinessConfig } from '@/hooks/useBusinessConfig'
import BlueprintPage from '@/components/site/BlueprintPage'

export default function SiteTarifs() {
  const { businessId = '' } = useParams()
  const { data, loading, error } = useBusinessConfig(businessId)

  if (loading) return <div className="min-h-dvh bg-white p-6 text-slate-700">Chargement…</div>
  if (error || !data) return <div className="min-h-dvh bg-white p-6 text-slate-700">{error || 'Erreur'}</div>
  return <BlueprintPage businessId={businessId} pageKey="tarifs" config={data.config} content={data.content} />
}
