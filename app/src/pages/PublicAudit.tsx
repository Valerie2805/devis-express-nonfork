import { useMemo } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import BackButton from '@/components/BackButton'

export default function PublicAudit() {
  const { auditId = '' } = useParams()
  const [sp] = useSearchParams()
  const token = useMemo(() => String(sp.get('t') || '').trim(), [sp])

  if (!auditId || !token) {
    return (
      <div className="min-h-screen bg-zinc-950 p-8 text-sm text-zinc-200">
        Lien invalide.
      </div>
    )
  }

  const htmlUrl = `/api/v1/public/site_audits/${auditId}/html?t=${encodeURIComponent(token)}`
  const docxUrl = `/api/v1/public/site_audits/${auditId}/docx?t=${encodeURIComponent(token)}`
  const pdfUrl = `/api/v1/public/site_audits/${auditId}/pdf?t=${encodeURIComponent(token)}`
  const jsonUrl = `/api/v1/public/site_audits/${auditId}/json?t=${encodeURIComponent(token)}`

  return (
    <div className="min-h-screen bg-zinc-950">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4">
        <div className="flex items-center gap-3">
          <BackButton fallbackTo="/" />
          <div className="text-sm font-semibold text-white">Audit</div>
        </div>
        <div className="flex items-center gap-2">
          <a className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-zinc-100" href={docxUrl}>
            Télécharger Word
          </a>
          <a className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-zinc-100" href={pdfUrl}>
            Télécharger PDF
          </a>
          <a className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10" href={jsonUrl}>
            Télécharger JSON
          </a>
        </div>
      </div>
      <div className="mx-auto max-w-5xl px-4 pb-6">
        <div className="h-[calc(100vh-92px)] overflow-hidden rounded-2xl border border-white/10 bg-white">
          <iframe title="Audit" src={htmlUrl} className="h-full w-full" />
        </div>
      </div>
    </div>
  )
}
