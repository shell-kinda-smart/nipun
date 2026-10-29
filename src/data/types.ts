// ============================================================================
// Domain types — single source of truth for the platform.
// ============================================================================

export type Role = 'admin' | 'hr' | 'finance' | 'approver' | 'employee'

export type Permission =
  | 'employees:read'
  | 'employees:write'
  | 'employees:hold'
  | 'payroll:read'
  | 'payroll:process'
  | 'payroll:select'
  | 'payroll:submit'
  | 'payroll:approve'
  | 'payroll:reject'
  | 'payroll:pay'
  | 'reports:read'
  | 'reports:export'
  | 'reports:schedule'
  | 'analytics:read'
  | 'audit:read'
  | 'audit:export'
  | 'settings:read'
  | 'settings:write'
  | 'anomalies:read'
  | 'anomalies:resolve'
  | 'schedules:read'
  | 'schedules:write'
  | 'jobs:read'
  | 'jobs:retry'
  | 'termination:read'
  | 'termination:write'
  | 'termination:approve'
  | 'settlement:read'
  | 'settlement:approve'

export interface User {
  id: string
  name: string
  email: string
  role: Role
  employeeId: string
  avatarSeed: string
}

export interface Department {
  id: string
  name: string
  /** CSS custom property reference, e.g. "var(--dept-eng)". */
  color: string
  /** Tailwind fill utility, e.g. "fill-dept-eng" — for SVG shapes. */
  fill: string
  icon: string
  headEmployeeId: string
  headcount: number
  budgetMonthly: number
}

export type EmployeeStatus = 'active' | 'on_leave' | 'probation' | 'exited'

export interface SalaryStructure {
  basic: number
  hra: number
  specialAllowance: number
  travelAllowance: number
  pf: number
  professionalTax: number
}

export interface BankDetails {
  account: string
  ifsc: string
  bankName: string
}

export interface Attendance {
  present: number
  absent: number
  late: number
  leaves: number
}

export interface Employee {
  id: string
  name: string
  email: string
  phone: string
  designation: string
  departmentId: string
  role: Role
  joinedAt: string
  status: EmployeeStatus
  ctcAnnual: number
  monthlyGross: number
  salary: SalaryStructure
  bank: BankDetails
  avatarSeed: string
  reportingTo?: string
  attendance: Attendance
  performanceRating?: 1 | 2 | 3 | 4 | 5
}

export type PayrollStatus =
  | 'draft'
  | 'review'
  | 'submitted'
  | 'rejected'
  | 'approved'
  | 'processing'
  | 'paid'
  | 'finalized'
  | 'failed'

export interface PayrollRun {
  id: string
  month: number
  year: number
  status: PayrollStatus
  employeesCount: number
  totalGross: number
  totalNet: number
  totalTax: number
  totalDeductions: number
  processedBy?: string
  approvedBy?: string
  processedAt?: string
  submittedAt?: string
  finalizedAt?: string
  rejectionReason?: string | null
  paidAt?: string
  createdAt: string
}

// ── Employee selection ────────────────────────────────────────────────────

export type IneligibilityReason =
  | 'no_longer_employed'
  | 'access_revoked'
  | 'on_hold'
  | 'no_compensation'
  | 'not_joined_yet'

export interface SelectableEmployee {
  id: string
  name: string
  email: string
  designation: string
  departmentId: string
  departmentName: string
  employmentStatus: string
  accessStatus: string
  basicPaise: number
}

export interface IneligibleEmployee extends SelectableEmployee {
  reason: IneligibilityReason
  detail: string
}

export interface ExcludedEmployee extends SelectableEmployee {
  reason: string
  excludedAt?: string | null
}

export interface EmployeeHold {
  id: number
  employee_id: string
  category?: string
  reason: string
  notes?: string | null
  effective_from: string
  effective_to?: string | null
  status: 'active' | 'released'
  created_at: string
  released_at?: string | null
}

export interface RunSelection {
  runId: string
  status: string
  selected: (SelectableEmployee & { status: string; explicitlySelected: boolean })[]
  excluded: ExcludedEmployee[]
  ineligible: IneligibleEmployee[]
  holds: EmployeeHold[]
  summary: { selected: number; excluded: number; ineligible: number; onHold: number }
}

// ── Payments ──────────────────────────────────────────────────────────────

export type PaymentStatus = 'pending' | 'paid' | 'failed'

export interface PaymentRecord {
  id: number
  payrollRunId: string
  period?: string
  employeeId: string
  employeeName: string
  designation?: string
  departmentName?: string
  status: PaymentStatus
  amount: number
  amountPaise: number
  method: string
  isManual: boolean
  reference?: string | null
  paidAt?: string | null
  failureReason?: string | null
  updatedAt?: string | null
}

export interface PaymentSummary {
  pending: { count: number; amount: number; amountPaise: number }
  paid: { count: number; amount: number; amountPaise: number }
  failed: { count: number; amount: number; amountPaise: number }
  total: { count: number; amount: number; amountPaise: number }
}

// ── Schedules and background jobs ─────────────────────────────────────────

export type ScheduleKind = 'payroll_preparation' | 'recurring_report'
export type ScheduleStatus = 'active' | 'paused' | 'cancelled'

export interface ScheduledJob {
  id: number
  code: string
  kind: ScheduleKind
  name: string
  reportType?: string | null
  frequency: 'once' | 'daily' | 'weekly' | 'monthly'
  scheduledAt: string
  nextRunAt?: string | null
  periodMonth?: number | null
  periodYear?: number | null
  criteria?: Record<string, unknown> | null
  recipients: { name?: string; email: string }[]
  delivery?: string | null
  status: ScheduleStatus
  lastRunAt?: string | null
  lastStatus?: string | null
  lastResult?: string | null
  createdAt: string
}

export interface JobRun {
  id: number
  jobId?: number | null
  jobName?: string | null
  kind: string
  status: 'running' | 'success' | 'failed' | 'skipped'
  attempt: number
  maxAttempts: number
  startedAt: string
  finishedAt?: string | null
  durationMs?: number | null
  lastError?: string | null
  retryable: boolean
  nextRetryAt?: string | null
  triggeredBy: string
}

// ── Termination, notice and settlement ────────────────────────────────────

export type TerminationStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'notice_issued'
  | 'acknowledged'
  | 'settled'
  | 'completed'

export type TerminationCategory =
  | 'resignation'
  | 'termination'
  | 'retirement'
  | 'end_of_contract'

export interface TerminationLetter {
  id: number
  terminationRequestId: string
  version: number
  reference: string
  contentHtml: string
  issuedBy?: number | null
  issuedAt?: string | null
  supersededAt?: string | null
  createdAt: string
}

export interface TerminationRequest {
  id: string
  employeeId: string
  employeeName: string
  designation: string
  departmentName: string
  category: TerminationCategory
  reason: string
  hrNotes?: string | null
  lastWorkingDay: string
  noticePeriodDays: number
  noticeServedFrom?: string | null
  status: TerminationStatus
  requestedBy?: number | null
  requestedAt?: string | null
  approvedAt?: string | null
  rejectedAt?: string | null
  rejectionReason?: string | null
  noticeIssuedAt?: string | null
  acknowledgedAt?: string | null
  completedAt?: string | null
  letters: TerminationLetter[]
  settlement?: Settlement | null
  createdAt: string
}

export interface SettlementItem {
  id: number
  code: string
  label: string
  kind: 'earning' | 'deduction'
  amount: number
  amountPaise: number
  source: 'computed' | 'manual'
  note?: string | null
}

export interface Settlement {
  id: string
  terminationRequestId: string
  employeeId: string
  employeeName?: string
  status: 'draft' | 'approved' | 'finalized'
  totalPayable: number
  totalPayablePaise: number
  totalRecoverable: number
  totalRecoverablePaise: number
  netPayable: number
  netPayablePaise: number
  items: SettlementItem[]
  calculatedAt?: string | null
  approvedAt?: string | null
  finalizedAt?: string | null
  createdAt: string
}

export interface MyTermination {
  notice: TerminationLetter | null
  request: TerminationRequest | null
  settlement: Settlement | null
  acknowledgedAt: string | null
  acknowledgementWording: string
}

export type EarningKind = 'basic' | 'hra' | 'special' | 'travel' | 'bonus' | 'overtime'
export type DeductionKind = 'pf' | 'tax' | 'professional_tax' | 'loan' | 'advance' | 'absent'

export interface PayslipLine {
  kind: EarningKind | DeductionKind
  label: string
  amount: number
}

export interface Payslip {
  id: string
  payrollRunId: string
  employeeId: string
  month: number
  year: number
  earnings: PayslipLine[]
  deductions: PayslipLine[]
  gross: number
  totalDeductions: number
  net: number
  ytdEarnings: number
  ytdTax: number
  workingDays: number
  daysPresent: number
  status: PayrollStatus
  generatedAt: string
}

export type AnomalyType =
  | 'salary_spike'
  | 'duplicate_payment'
  | 'unusual_deduction'
  | 'overtime_spike'
  | 'attendance_mismatch'
  | 'late_payroll'
  | 'bank_mismatch'
  | 'contract_expiring'

export type AnomalySeverity = 'low' | 'medium' | 'high' | 'critical'
export type AnomalyStatus = 'open' | 'investigating' | 'resolved' | 'dismissed'

export interface Anomaly {
  id: string
  type: AnomalyType
  severity: AnomalySeverity
  status: AnomalyStatus
  employeeId?: string
  payrollRunId?: string
  title: string
  description: string
  detectedAt: string
  riskScore: number
  amount?: number
  assignedTo?: string
}

export type AuditAction =
  | 'login'
  | 'logout'
  | 'employee.created'
  | 'employee.updated'
  | 'employee.deleted'
  | 'payroll.processed'
  | 'payroll.approved'
  | 'salary.changed'
  | 'role.changed'
  | 'report.generated'
  | 'settings.updated'
  | 'anomaly.resolved'

export interface AuditLog {
  id: string
  actor: string
  actorRole: Role
  action: AuditAction
  entity: string
  entityId?: string
  description: string
  timestamp: string
  ipAddress?: string
}

export type NotificationType = 'info' | 'success' | 'warning' | 'error'
export type NotificationCategory =
  | 'payroll'
  | 'anomaly'
  | 'report'
  | 'employee'
  | 'system'
  | 'security'

export interface AppNotification {
  id: string
  type: NotificationType
  category: NotificationCategory
  title: string
  description: string
  timestamp: string
  read: boolean
  actionLabel?: string
  actionHref?: string
  severity?: AnomalySeverity
}