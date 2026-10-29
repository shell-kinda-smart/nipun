import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { PublicShell } from '@/components/layout/PublicShell'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { LoginPage } from '@/components/auth/LoginPage'
import { useAuthStore } from '@/store/auth'
import { PageLoader } from '@/components/shared/PageLoader'
import { SettingsLayout } from '@/pages/settings/SettingsLayout'

const DashboardPage = lazy(() => import('@/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const LandingPage = lazy(() => import('@/pages/LandingPage').then((m) => ({ default: m.LandingPage })))
const PricingPage = lazy(() => import('@/pages/PricingPage').then((m) => ({ default: m.PricingPage })))
const FeaturesPage = lazy(() => import('@/pages/FeaturesPage').then((m) => ({ default: m.FeaturesPage })))
const EmployeesPage = lazy(() => import('@/pages/EmployeesPage').then((m) => ({ default: m.EmployeesPage })))
const EmployeeProfilePage = lazy(() =>
  import('@/pages/EmployeeProfilePage').then((m) => ({ default: m.EmployeeProfilePage })),
)
const DocumentsPage = lazy(() => import('@/pages/DocumentsPage').then((m) => ({ default: m.DocumentsPage })))
const PayrollPage = lazy(() => import('@/pages/PayrollPage').then((m) => ({ default: m.PayrollPage })))
const TaxCenterPage = lazy(() => import('@/pages/TaxCenterPage').then((m) => ({ default: m.TaxCenterPage })))
const AnalyticsPage = lazy(() => import('@/pages/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })))
const ReportsPage = lazy(() => import('@/pages/ReportsPage').then((m) => ({ default: m.ReportsPage })))
const AnomaliesPage = lazy(() => import('@/pages/AnomaliesPage').then((m) => ({ default: m.AnomaliesPage })))
const AuditPage = lazy(() => import('@/pages/AuditPage').then((m) => ({ default: m.AuditPage })))
const NotificationsPage = lazy(() =>
  import('@/pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage })),
)
const MyPayslipsPage = lazy(() => import('@/pages/MyPayslipsPage').then((m) => ({ default: m.MyPayslipsPage })))
const MyTaxPage = lazy(() => import('@/pages/MyTaxPage').then((m) => ({ default: m.MyTaxPage })))
const MyProfilePage = lazy(() => import('@/pages/MyProfilePage').then((m) => ({ default: m.MyProfilePage })))
const ForbiddenPage = lazy(() => import('@/pages/ForbiddenPage').then((m) => ({ default: m.ForbiddenPage })))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })))
const PrivacyPage = lazy(() => import('@/pages/PrivacyPage').then((m) => ({ default: m.PrivacyPage })))
const TermsPage = lazy(() => import('@/pages/TermsPage').then((m) => ({ default: m.TermsPage })))

const ProfileSettings = lazy(() =>
  import('@/pages/settings/ProfileSettings').then((m) => ({ default: m.ProfileSettings })),
)
const SessionsSettings = lazy(() =>
  import('@/pages/settings/SessionsSettings').then((m) => ({ default: m.SessionsSettings })),
)
const AppearanceSettings = lazy(() =>
  import('@/pages/settings/AppearanceSettings').then((m) => ({ default: m.AppearanceSettings })),
)
const NotificationsSettings = lazy(() =>
  import('@/pages/settings/NotificationsSettings').then((m) => ({ default: m.NotificationsSettings })),
)
const SecuritySettings = lazy(() =>
  import('@/pages/settings/SecuritySettings').then((m) => ({ default: m.SecuritySettings })),
)
const BillingSettings = lazy(() =>
  import('@/pages/settings/BillingSettings').then((m) => ({ default: m.BillingSettings })),
)

// ── Payroll operations ────────────────────────────────────────────────────
const PayrollRunsPage = lazy(() =>
  import('@/pages/PayrollRunsPage').then((m) => ({ default: m.PayrollRunsPage })),
)
const PayrollPaymentsPage = lazy(() =>
  import('@/pages/PayrollPaymentsPage').then((m) => ({ default: m.PayrollPaymentsPage })),
)
const PayrollApprovalsPage = lazy(() =>
  import('@/pages/PayrollApprovalsPage').then((m) => ({ default: m.PayrollApprovalsPage })),
)
const EmployeeHoldsPage = lazy(() =>
  import('@/pages/EmployeeHoldsPage').then((m) => ({ default: m.EmployeeHoldsPage })),
)

// ── Scheduling and background work ────────────────────────────────────────
const SchedulesPage = lazy(() =>
  import('@/pages/SchedulesPage').then((m) => ({ default: m.SchedulesPage })),
)
const JobsPage = lazy(() => import('@/pages/JobsPage').then((m) => ({ default: m.JobsPage })))

// ── Termination and settlement ────────────────────────────────────────────
const TerminationsPage = lazy(() =>
  import('@/pages/TerminationsPage').then((m) => ({ default: m.TerminationsPage })),
)
const TerminationDetailPage = lazy(() =>
  import('@/pages/TerminationDetailPage').then((m) => ({ default: m.TerminationDetailPage })),
)
const SettlementsPage = lazy(() =>
  import('@/pages/SettlementsPage').then((m) => ({ default: m.SettlementsPage })),
)
const MyTerminationPage = lazy(() =>
  import('@/pages/MyTerminationPage').then((m) => ({ default: m.MyTerminationPage })),
)
const MySettlementPage = lazy(() =>
  import('@/pages/MySettlementPage').then((m) => ({ default: m.MySettlementPage })),
)

function LoginRoute() {
  const status = useAuthStore((s) => s.status)
  if (status === 'loading') return <PageLoader />
  return status === 'authenticated' ? <Navigate to="/" replace /> : <LoginPage />
}

function RootRoute() {
  const status = useAuthStore((s) => s.status)
  if (status === 'loading') return <PageLoader />
  return status === 'authenticated' ? <DashboardPage /> : <LandingPage />
}

const suspense = (children: React.ReactNode) => (
  <Suspense fallback={<PageLoader />}>{children}</Suspense>
)

export function AppRoutes() {
  return (
    <Routes>
      {/* Public marketing routes */}
      <Route element={<PublicShell />}>
        <Route path="pricing" element={suspense(<PricingPage />)} />
        <Route path="features" element={suspense(<FeaturesPage />)} />
        <Route path="privacy" element={suspense(<PrivacyPage />)} />
        <Route path="terms" element={suspense(<TermsPage />)} />
      </Route>

      <Route path="/login" element={<LoginRoute />} />

      {/* App routes — protected + AppShell */}
      <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
        <Route index element={suspense(<RootRoute />)} />

        <Route
          path="employees"
          element={
            <ProtectedRoute permission="employees:read">
              {suspense(<EmployeesPage />)}
            </ProtectedRoute>
          }
        />
        <Route
          path="employees/:id"
          element={
            <ProtectedRoute permission="employees:read">
              {suspense(<EmployeeProfilePage />)}
            </ProtectedRoute>
          }
        />
        <Route path="documents" element={suspense(<DocumentsPage />)} />

        {/* ── Payroll operations ────────────────────────────────────── */}
        <Route
          path="payroll/runs"
          element={
            <ProtectedRoute permission="payroll:read">
              {suspense(<PayrollRunsPage />)}
            </ProtectedRoute>
          }
        />
        <Route
          path="payroll/payments"
          element={
            <ProtectedRoute permission="payroll:read">
              {suspense(<PayrollPaymentsPage />)}
            </ProtectedRoute>
          }
        />
        <Route
          path="payroll/approvals"
          element={
            <ProtectedRoute permission="payroll:approve">
              {suspense(<PayrollApprovalsPage />)}
            </ProtectedRoute>
          }
        />
        <Route
          path="employees/holds"
          element={
            <ProtectedRoute permission="employees:read">
              {suspense(<EmployeeHoldsPage />)}
            </ProtectedRoute>
          }
        />

        {/* ── Scheduling and background work ───────────────────────── */}
        <Route
          path="schedules"
          element={
            <ProtectedRoute permission="schedules:read">
              {suspense(<SchedulesPage />)}
            </ProtectedRoute>
          }
        />
        <Route
          path="jobs"
          element={
            <ProtectedRoute permission="jobs:read">
              {suspense(<JobsPage />)}
            </ProtectedRoute>
          }
        />

        {/* ── Termination and settlement ───────────────────────────── */}
        <Route
          path="terminations"
          element={
            <ProtectedRoute permission="termination:read">
              {suspense(<TerminationsPage />)}
            </ProtectedRoute>
          }
        />
        <Route
          path="terminations/:id"
          element={
            <ProtectedRoute permission="termination:read">
              {suspense(<TerminationDetailPage />)}
            </ProtectedRoute>
          }
        />
        <Route
          path="settlements"
          element={
            <ProtectedRoute permission="settlement:read">
              {suspense(<SettlementsPage />)}
            </ProtectedRoute>
          }
        />
        <Route path="me/termination" element={suspense(<MyTerminationPage />)} />
        <Route path="me/settlement" element={suspense(<MySettlementPage />)} />

        <Route
          path="payroll"
          element={
            <ProtectedRoute permission="payroll:read">
              {suspense(<PayrollPage />)}
            </ProtectedRoute>
          }
        />
        <Route
          path="tax"
          element={
            <ProtectedRoute permission="payroll:read">
              {suspense(<TaxCenterPage />)}
            </ProtectedRoute>
          }
        />
        <Route
          path="analytics"
          element={
            <ProtectedRoute permission="analytics:read">
              {suspense(<AnalyticsPage />)}
            </ProtectedRoute>
          }
        />

        <Route
          path="reports"
          element={
            <ProtectedRoute permission="reports:read">
              {suspense(<ReportsPage />)}
            </ProtectedRoute>
          }
        />
        <Route
          path="anomalies"
          element={
            <ProtectedRoute permission="anomalies:read">
              {suspense(<AnomaliesPage />)}
            </ProtectedRoute>
          }
        />
        <Route
          path="audit"
          element={
            <ProtectedRoute permission="audit:read">
              {suspense(<AuditPage />)}
            </ProtectedRoute>
          }
        />

        <Route path="notifications" element={suspense(<NotificationsPage />)} />

        <Route path="settings">
          <Route index element={<Navigate to="profile" replace />} />
          <Route element={<SettingsLayout />}>
            <Route path="profile" element={suspense(<ProfileSettings />)} />
            <Route path="sessions" element={suspense(<SessionsSettings />)} />
            <Route path="appearance" element={suspense(<AppearanceSettings />)} />
            <Route path="notifications" element={suspense(<NotificationsSettings />)} />
            <Route path="security" element={suspense(<SecuritySettings />)} />
            <Route path="billing" element={suspense(<BillingSettings />)} />
          </Route>
        </Route>

        <Route
          path="me/payslips"
          element={
            <ProtectedRoute permission="payroll:read">
              {suspense(<MyPayslipsPage />)}
            </ProtectedRoute>
          }
        />
        <Route
          path="me/tax"
          element={
            <ProtectedRoute permission="payroll:read">
              {suspense(<MyTaxPage />)}
            </ProtectedRoute>
          }
        />
        <Route path="me/profile" element={suspense(<MyProfilePage />)} />
      </Route>

      <Route path="/forbidden" element={suspense(<ForbiddenPage />)} />
      <Route path="*" element={suspense(<NotFoundPage />)} />
    </Routes>
  )
}