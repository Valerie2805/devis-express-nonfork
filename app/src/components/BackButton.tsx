import { ArrowLeft } from 'lucide-react'
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'

type Props = {
  fallbackTo: string
  label?: string
}

export default function BackButton({ fallbackTo, label }: Props) {
  const navigate = useNavigate()
  const canGoBack = useMemo(() => (typeof window === 'undefined' ? false : window.history.length > 1), [])

  return (
    <button
      type="button"
      onClick={() => (canGoBack ? navigate(-1) : navigate(fallbackTo))}
      className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-zinc-950/40 px-3 py-2 text-xs text-zinc-200 hover:bg-white/5"
    >
      <ArrowLeft className="h-4 w-4" />
      {label || 'Retour'}
    </button>
  )
}

