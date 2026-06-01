import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Landing from '@/pages/Landing'
import AdminCreate from '@/pages/AdminCreate'
import SiteHome from '@/pages/site/SiteHome'
import SiteServices from '@/pages/site/SiteServices'
import SiteZones from '@/pages/site/SiteZones'
import SiteTarifs from '@/pages/site/SiteTarifs'
import Login from '@/pages/backoffice/Login'
import ForgotPassword from '@/pages/backoffice/ForgotPassword'
import ResetPassword from '@/pages/backoffice/ResetPassword'
import Inbox from '@/pages/backoffice/Inbox'
import LeadDetail from '@/pages/backoffice/LeadDetail'
import Stats from '@/pages/backoffice/Stats'
import Settings from '@/pages/backoffice/Settings'
import Availability from '@/pages/backoffice/Availability'
import Appointments from '@/pages/backoffice/Appointments'
import Audit from '@/pages/backoffice/Audit'
import AbTests from '@/pages/backoffice/AbTests'
import Sites from '@/pages/backoffice/Sites'
import BackofficeProspection from '@/pages/backoffice/Prospection'
import BackofficeCommissions from '@/pages/backoffice/Commissions'
import PublicAudit from '@/pages/PublicAudit'
import SiteAudits from '@/pages/backoffice/SiteAudits'
import RequireAuth from '@/components/backoffice/RequireAuth'
import Portal from '@/pages/portal/Portal'
import PortalPreview from '@/pages/portal/PortalPreview'
import InternalLogin from '@/pages/internal/InternalLogin'
import InternalProspection from '@/pages/internal/Prospection'
import RequireInternalAuth from '@/components/internal/RequireInternalAuth'
import InternalInbox from '@/pages/internal/Inbox'
import Companies from '@/pages/internal/Companies'
import InternalCommissions from '@/pages/internal/Commissions'

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/admin/create" element={<AdminCreate />} />

        <Route path="/site/:businessId" element={<SiteHome />} />
        <Route path="/site/:businessId/services" element={<SiteServices />} />
        <Route path="/site/:businessId/zones" element={<SiteZones />} />
        <Route path="/site/:businessId/tarifs" element={<SiteTarifs />} />

        <Route path="/portal/:portalId" element={<Portal />} />
        <Route path="/portal/:portalId/preview" element={<PortalPreview />} />

        <Route path="/backoffice/:businessId/login" element={<Login />} />
        <Route path="/backoffice/:businessId/forgot" element={<ForgotPassword />} />
        <Route path="/backoffice/:businessId/reset" element={<ResetPassword />} />
        <Route
          path="/backoffice/:businessId"
          element={
            <RequireAuth>
              <Inbox />
            </RequireAuth>
          }
        />
        <Route
          path="/backoffice/:businessId/leads/:leadId"
          element={
            <RequireAuth>
              <LeadDetail />
            </RequireAuth>
          }
        />
        <Route
          path="/backoffice/:businessId/sites"
          element={
            <RequireAuth>
              <Sites />
            </RequireAuth>
          }
        />
        <Route
          path="/backoffice/:businessId/prospection"
          element={
            <RequireAuth>
              <BackofficeProspection />
            </RequireAuth>
          }
        />
        <Route
          path="/backoffice/:businessId/commissions"
          element={
            <RequireAuth>
              <BackofficeCommissions />
            </RequireAuth>
          }
        />
        <Route
          path="/backoffice/:businessId/stats"
          element={
            <RequireAuth>
              <Stats />
            </RequireAuth>
          }
        />
        <Route
          path="/backoffice/:businessId/settings"
          element={
            <RequireAuth>
              <Settings />
            </RequireAuth>
          }
        />
        <Route
          path="/backoffice/:businessId/create-site"
          element={
            <RequireAuth>
              <Settings />
            </RequireAuth>
          }
        />
        <Route
          path="/backoffice/:businessId/ab"
          element={
            <RequireAuth>
              <AbTests />
            </RequireAuth>
          }
        />
        <Route
          path="/backoffice/:businessId/availability"
          element={
            <RequireAuth>
              <Availability />
            </RequireAuth>
          }
        />
        <Route
          path="/backoffice/:businessId/appointments"
          element={
            <RequireAuth>
              <Appointments />
            </RequireAuth>
          }
        />
        <Route
          path="/backoffice/:businessId/audit"
          element={
            <RequireAuth>
              <Audit />
            </RequireAuth>
          }
        />
        <Route
          path="/backoffice/:businessId/site-audits"
          element={
            <RequireAuth>
              <SiteAudits />
            </RequireAuth>
          }
        />

        <Route path="/audit/:auditId" element={<PublicAudit />} />

        <Route path="/internal/login" element={<InternalLogin />} />
        <Route
          path="/internal/prospection"
          element={
            <RequireInternalAuth>
              <InternalProspection />
            </RequireInternalAuth>
          }
        />
        <Route
          path="/internal/inbox"
          element={
            <RequireInternalAuth>
              <InternalInbox />
            </RequireInternalAuth>
          }
        />
        <Route
          path="/internal/companies"
          element={
            <RequireInternalAuth>
              <Companies />
            </RequireInternalAuth>
          }
        />
        <Route
          path="/internal/commissions"
          element={
            <RequireInternalAuth>
              <InternalCommissions />
            </RequireInternalAuth>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  )
}
