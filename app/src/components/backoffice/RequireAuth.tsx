import { Navigate, useParams } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const { businessId = '' } = useParams()
  const { token } = useAuthStore()
  if (!token) return <Navigate to={`/backoffice/${businessId}/login`} replace />
  return <>{children}</>
}

