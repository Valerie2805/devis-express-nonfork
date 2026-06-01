import { Navigate } from 'react-router-dom'
import { useInternalAuthStore } from '@/store/internalAuthStore'

export default function RequireInternalAuth({ children }: { children: React.ReactNode }) {
  const { token } = useInternalAuthStore()
  if (!token) return <Navigate to="/internal/login" replace />
  return <>{children}</>
}

