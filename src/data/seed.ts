/**
 * @deprecated The mock dataset this module generated has been replaced by
 * the PHP API and the database. Nothing in the app imports it any more —
 * `src/data/index.ts` no longer re-exports it — and it is kept only so the
 * original generator stays readable alongside the backend seed that
 * reproduces the same dataset. Delete it once you are happy with the
 * backend's version.
 */
import type {
  Employee,
  Department,
  User,
  PayrollRun,
  Payslip,
  PayslipLine,
  Anomaly,
  AuditLog,
  AppNotification,
  SalaryStructure,
  BankDetails,
  Attendance,
  EmployeeStatus,
} from './types'
import {
  DEPARTMENTS,
  DESIGNATIONS,
  FIRST_NAMES,
  LAST_NAMES,
  BANK_NAMES,
} from './constants'

// ============================================================================
// Deterministic seeded PRNG (LCG) so demos and tests are reproducible.
// ============================================================================
function lcg(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 0x100000000
  }
}

const rand = lcg(0xC0FFEE)
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]
const between = (min: number, max: number) => min + rand() * (max - min)
const intBetween = (min: number, max: number) => Math.floor(between(min, max + 1))
const id = (prefix: string, n: number) => `${prefix}${String(n).padStart(3, '0')}`

function makeName() {
  return `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`
}

function makeEmail(name: string) {
  const [first, last] = name.toLowerCase().split(' ')
  return `${first}.${last}@paylens.co`
}

function makePhone() {
  return `+91 ${intBetween(70000, 99999)} ${intBetween(10000, 99999)}`
}

function makeAvatar(name: string) {
  return name.toLowerCase().replace(/\s+/g, '-')
}

function makeSalary(annualCTC: number): SalaryStructure {
  const monthly = annualCTC / 12
  const basic = monthly * 0.5
  const hra = basic * 0.5
  return {
    basic: Math.round(basic),
    hra: Math.round(hra),
    specialAllowance: Math.round(monthly - basic - hra),
    travelAllowance: rand() < 0.4 ? intBetween(1500, 4000) : 0,
    pf: Math.min(Math.round(basic * 0.12), 1800),
    professionalTax: 200,
  }
}

function makeBank(): BankDetails {
  return {
    account: String(intBetween(100000000, 999999999)),
    ifsc: `${pick(['HDFC', 'ICIC', 'SBIN', 'AXIS', 'KOTK'])}0${intBetween(100000, 999999)}`,
    bankName: pick(BANK_NAMES),
  }
}

function makeAttendance(): Attendance {
  return {
    present: intBetween(18, 22),
    absent: intBetween(0, 2),
    late: intBetween(0, 3),
    leaves: intBetween(0, 2),
  }
}

function randomJoinDate() {
  const month = intBetween(1, 12)
  const year = intBetween(2019, 2025)
  return `${year}-${String(month).padStart(2, '0')}-${String(intBetween(1, 28)).padStart(2, '0')}`
}

// ============================================================================
// System role accounts (admin / hr / finance)
// ============================================================================
const employees: Employee[] = []
let counter = 1

function makeEmployee(opts: {
  desig: string
  dept: string
  role?: Employee['role']
  status?: EmployeeStatus
  performanceRating?: 1 | 2 | 3 | 4 | 5
}): Employee {
  const range = DESIGNATIONS[opts.desig]
  const ctc = between(range.min * 100000, range.max * 100000)
  const name = makeName()
  const eId = id('EMP', counter++)
  const sal = makeSalary(ctc)
  return {
    id: eId,
    name,
    email: makeEmail(name),
    phone: makePhone(),
    designation: opts.desig,
    departmentId: opts.dept,
    role: opts.role ?? 'employee',
    joinedAt: randomJoinDate(),
    status: opts.status ?? 'active',
    ctcAnnual: Math.round(ctc),
    monthlyGross: Math.round(sal.basic + sal.hra + sal.specialAllowance + sal.travelAllowance),
    salary: sal,
    bank: makeBank(),
    avatarSeed: makeAvatar(name),
    attendance: makeAttendance(),
    performanceRating: opts.performanceRating ?? (intBetween(3, 5) as 3 | 4 | 5),
  }
}

// Admin
employees.push(
  makeEmployee({
    desig: 'Platform Administrator',
    dept: 'people',
    role: 'admin',
    performanceRating: 5,
  }),
)

// HR Manager
employees.push(
  makeEmployee({
    desig: 'HR Manager',
    dept: 'people',
    role: 'hr',
    performanceRating: 5,
  }),
)

// Finance Manager
employees.push(
  makeEmployee({
    desig: 'Finance Manager',
    dept: 'people',
    role: 'finance',
    performanceRating: 5,
  }),
)

// 12 employees per remaining department slot
for (const dept of DEPARTMENTS) {
  const designations = Object.entries(DESIGNATIONS)
    .filter(([k, v]) => v.dept.includes(dept.id) && !['Platform Administrator', 'HR Manager', 'Finance Manager'].includes(k))
    .map(([k]) => k)
  for (let i = 0; i < 12; i++) {
    const desig = pick(designations)
    const status: EmployeeStatus =
      rand() < 0.04 ? 'on_leave' : rand() < 0.04 ? 'probation' : 'active'
    employees.push(makeEmployee({ desig, dept: dept.id, status }))
  }
}

// ============================================================================
// Users (system accounts — used by auth + role switcher)
// ============================================================================
const adminEmp = employees[0]
const hrEmp = employees[1]
const financeEmp = employees[2]
const sampleEmployee = employees[5]

export const users: User[] = [
  {
    id: 'U001',
    name: adminEmp.name,
    email: adminEmp.email,
    role: 'admin',
    employeeId: adminEmp.id,
    avatarSeed: adminEmp.avatarSeed,
  },
  {
    id: 'U002',
    name: hrEmp.name,
    email: hrEmp.email,
    role: 'hr',
    employeeId: hrEmp.id,
    avatarSeed: hrEmp.avatarSeed,
  },
  {
    id: 'U003',
    name: financeEmp.name,
    email: financeEmp.email,
    role: 'finance',
    employeeId: financeEmp.id,
    avatarSeed: financeEmp.avatarSeed,
  },
  {
    id: 'U004',
    name: sampleEmployee.name,
    email: sampleEmployee.email,
    role: 'employee',
    employeeId: sampleEmployee.id,
    avatarSeed: sampleEmployee.avatarSeed,
  },
]

// ============================================================================
// Departments with computed headcount & budget
// ============================================================================
export const departments: Department[] = DEPARTMENTS.map((d) => {
  const deptEmployees = employees.filter((e) => e.departmentId === d.id)
  const head = [...deptEmployees].sort((a, b) => b.monthlyGross - a.monthlyGross)[0]
  return {
    ...d,
    headEmployeeId: head?.id ?? '',
    headcount: deptEmployees.length,
    budgetMonthly: deptEmployees.reduce((s, e) => s + e.monthlyGross, 0),
  }
})

// ============================================================================
// Payroll runs (last 6 months: Apr – Sep 2026)
// ============================================================================
const payrollMonths: Array<{ m: number; y: number }> = [
  { m: 4, y: 2026 },
  { m: 5, y: 2026 },
  { m: 6, y: 2026 },
  { m: 7, y: 2026 },
  { m: 8, y: 2026 },
  { m: 9, y: 2026 },
]

const totalMonthlyGross = employees.reduce((s, e) => s + e.monthlyGross, 0)

/**
 * Month-to-month payroll variance, oldest month first. Hand-authored so the
 * demo stays deterministic and reproducible: the series still trends upward,
 * but it wobbles the way real payroll does (headcount changes, increments,
 * one-off payments). The final month stays up so the dashboard delta reads
 * positive.
 */
const PAYROLL_VARIANCE = [0.997, 1.008, 0.995, 1.006, 0.996, 1.004]

export const payrollRuns: PayrollRun[] = payrollMonths.map(({ m, y }, idx) => {
  // Trend plus a hand-authored month-to-month variance. A purely linear series
  // renders as a flat line in every chart and a dead-straight slash in the
  // stat-card sparkline, so the demo data needs realistic wobble.
  const growth = 1 + (idx - 2.5) * 0.012
  const gross = totalMonthlyGross * growth * PAYROLL_VARIANCE[idx]
  const tax = gross * 0.12
  const deductions = gross * 0.18
  const isMostRecent = idx === payrollMonths.length - 1
  const isPast = new Date(y, m, 0) < new Date('2026-10-14')
  return {
    id: `PR-${y}${String(m).padStart(2, '0')}`,
    month: m,
    year: y,
    status: isPast ? 'paid' : isMostRecent ? 'review' : 'approved',
    employeesCount: employees.length,
    totalGross: Math.round(gross),
    totalNet: Math.round(gross - deductions),
    totalTax: Math.round(tax),
    totalDeductions: Math.round(deductions),
    processedBy: financeEmp.name,
    approvedBy: adminEmp.name,
    processedAt: `${y}-${String(m).padStart(2, '0')}-28T10:30:00Z`,
    paidAt: `${y}-${String(m).padStart(2, '0')}-30T14:00:00Z`,
    createdAt: `${y}-${String(m).padStart(2, '0')}-25T09:00:00Z`,
  }
})

// ============================================================================
// Payslips for the most recent payroll run
// ============================================================================
const recentRun = payrollRuns[payrollRuns.length - 1]
const ytdGross = payrollRuns.reduce((s, r) => s + r.totalGross, 0)

export const payslips: Payslip[] = employees.map((emp) => {
  const earnings: PayslipLine[] = [
    { kind: 'basic', label: 'Basic Salary', amount: emp.salary.basic },
    { kind: 'hra', label: 'House Rent Allowance', amount: emp.salary.hra },
    { kind: 'special', label: 'Special Allowance', amount: emp.salary.specialAllowance },
  ]
  if (emp.salary.travelAllowance) {
    earnings.push({ kind: 'travel', label: 'Travel Allowance', amount: emp.salary.travelAllowance })
  }
  const tax = Math.round(emp.salary.basic * 0.1)
  const deductions: PayslipLine[] = [
    { kind: 'pf', label: 'Provident Fund', amount: emp.salary.pf },
    { kind: 'tax', label: 'Income Tax (TDS)', amount: tax },
    { kind: 'professional_tax', label: 'Professional Tax', amount: emp.salary.professionalTax },
  ]
  const gross = earnings.reduce((s, e) => s + e.amount, 0)
  const totalDeductions = deductions.reduce((s, d) => s + d.amount, 0)
  return {
    id: `PS-${recentRun.id}-${emp.id}`,
    payrollRunId: recentRun.id,
    employeeId: emp.id,
    month: recentRun.month,
    year: recentRun.year,
    earnings,
    deductions,
    gross,
    totalDeductions,
    net: gross - totalDeductions,
    ytdEarnings: Math.round((ytdGross / employees.length) * (emp.monthlyGross / 50000)),
    ytdTax: Math.round((ytdGross * 0.12 / employees.length) * (emp.salary.basic / 50000)),
    workingDays: 22,
    daysPresent: emp.attendance.present,
    status: recentRun.status,
    generatedAt: recentRun.processedAt ?? recentRun.createdAt,
  }
})

// ============================================================================
// Anomalies
// ============================================================================
const e = employees
export const anomalies: Anomaly[] = [
  {
    id: 'A001',
    type: 'salary_spike',
    severity: 'high',
    status: 'open',
    employeeId: e[3].id,
    title: 'Unusual salary increase',
    description: `${e[3].name}'s salary increased by 28% without a matching promotion record.`,
    detectedAt: '2026-10-12T08:14:00Z',
    riskScore: 87,
    amount: 420000,
    assignedTo: financeEmp.name,
  },
  {
    id: 'A002',
    type: 'duplicate_payment',
    severity: 'critical',
    status: 'investigating',
    employeeId: e[15].id,
    title: 'Duplicate payment detected',
    description: `${e[15].name} appears to have been paid twice for September 2026.`,
    detectedAt: '2026-10-10T11:42:00Z',
    riskScore: 95,
    amount: 78500,
    assignedTo: adminEmp.name,
  },
  {
    id: 'A003',
    type: 'unusual_deduction',
    severity: 'medium',
    status: 'open',
    employeeId: e[22].id,
    title: 'Unusually high deduction',
    description: 'Loan deduction 3.4× the typical amount for this employee segment.',
    detectedAt: '2026-10-09T16:20:00Z',
    riskScore: 62,
    assignedTo: hrEmp.name,
  },
  {
    id: 'A004',
    type: 'overtime_spike',
    severity: 'medium',
    status: 'open',
    employeeId: e[7].id,
    title: 'Overtime hours 4× above average',
    description: '46 overtime hours logged in September vs department average 11.',
    detectedAt: '2026-10-08T07:55:00Z',
    riskScore: 71,
    assignedTo: hrEmp.name,
  },
  {
    id: 'A005',
    type: 'attendance_mismatch',
    severity: 'low',
    status: 'resolved',
    employeeId: e[11].id,
    title: 'Attendance vs payroll mismatch',
    description: 'Salary paid for 22 days but attendance shows 18 days present.',
    detectedAt: '2026-10-05T14:18:00Z',
    riskScore: 38,
    assignedTo: financeEmp.name,
  },
  {
    id: 'A006',
    type: 'bank_mismatch',
    severity: 'high',
    status: 'investigating',
    employeeId: e[28].id,
    title: 'Bank account mismatch',
    description: 'Bank details changed 2 days before payroll. Flagged for verification.',
    detectedAt: '2026-10-03T10:30:00Z',
    riskScore: 79,
    assignedTo: financeEmp.name,
  },
  {
    id: 'A007',
    type: 'contract_expiring',
    severity: 'low',
    status: 'open',
    employeeId: e[33].id,
    title: 'Contract expiring in 7 days',
    description: 'Fixed-term contract ending 21 Oct 2026. Renewal not yet recorded.',
    detectedAt: '2026-10-01T09:00:00Z',
    riskScore: 28,
    assignedTo: hrEmp.name,
  },
  {
    id: 'A008',
    type: 'late_payroll',
    severity: 'low',
    status: 'resolved',
    title: 'Payroll processing delay',
    description: 'August payroll was processed 2 days after scheduled date.',
    detectedAt: '2026-08-30T18:00:00Z',
    riskScore: 22,
    assignedTo: adminEmp.name,
  },
]

// ============================================================================
// Audit log
// ============================================================================
export const auditLogs: AuditLog[] = [
  { id: 'L001', actor: adminEmp.name, actorRole: 'admin', action: 'login', entity: 'session', description: 'Logged in from Mumbai, IN', timestamp: '2026-10-14T09:12:00Z', ipAddress: '103.21.45.78' },
  { id: 'L002', actor: financeEmp.name, actorRole: 'finance', action: 'payroll.approved', entity: 'payroll', entityId: 'PR-202609', description: `Approved September 2026 payroll for ${employees.length} employees`, timestamp: '2026-09-28T11:20:00Z' },
  { id: 'L003', actor: hrEmp.name, actorRole: 'hr', action: 'employee.created', entity: 'employee', entityId: 'EMP248', description: `Added new employee ${e[47].name}`, timestamp: '2026-09-27T16:32:00Z' },
  { id: 'L004', actor: financeEmp.name, actorRole: 'finance', action: 'salary.changed', entity: 'employee', entityId: 'EMP019', description: 'Updated salary: ₹85,000 → ₹92,500 (+8.8%)', timestamp: '2026-09-25T14:18:00Z' },
  { id: 'L005', actor: adminEmp.name, actorRole: 'admin', action: 'payroll.processed', entity: 'payroll', entityId: 'PR-202609', description: `Processed September 2026 payroll · ₹48.6L`, timestamp: '2026-09-28T10:30:00Z' },
  { id: 'L006', actor: hrEmp.name, actorRole: 'hr', action: 'employee.updated', entity: 'employee', entityId: 'EMP142', description: `Updated bank account details for ${e[41].name}`, timestamp: '2026-10-03T10:11:00Z' },
  { id: 'L007', actor: financeEmp.name, actorRole: 'finance', action: 'report.generated', entity: 'report', description: 'Generated Q3 Tax Summary report', timestamp: '2026-10-08T17:42:00Z' },
  { id: 'L008', actor: adminEmp.name, actorRole: 'admin', action: 'anomaly.resolved', entity: 'anomaly', entityId: 'A005', description: 'Resolved attendance mismatch (clerical error)', timestamp: '2026-10-06T11:00:00Z' },
  { id: 'L009', actor: financeEmp.name, actorRole: 'finance', action: 'payroll.processed', entity: 'payroll', entityId: 'PR-202608', description: 'Processed August 2026 payroll · ₹47.2L', timestamp: '2026-08-28T10:30:00Z' },
  { id: 'L010', actor: adminEmp.name, actorRole: 'admin', action: 'role.changed', entity: 'user', entityId: 'U002', description: `Granted reports.export to ${hrEmp.name}`, timestamp: '2026-08-20T14:00:00Z' },
  { id: 'L011', actor: hrEmp.name, actorRole: 'hr', action: 'employee.created', entity: 'employee', entityId: 'EMP246', description: `Added new employee ${e[44].name}`, timestamp: '2026-08-15T11:00:00Z' },
  { id: 'L012', actor: financeEmp.name, actorRole: 'finance', action: 'settings.updated', entity: 'settings', description: 'Updated TDS slab for 30L+ bracket', timestamp: '2026-08-10T09:30:00Z' },
  { id: 'L013', actor: adminEmp.name, actorRole: 'admin', action: 'login', entity: 'session', description: 'Logged in from Mumbai, IN', timestamp: '2026-10-13T08:55:00Z', ipAddress: '103.21.45.78' },
  { id: 'L014', actor: financeEmp.name, actorRole: 'finance', action: 'anomaly.resolved', entity: 'anomaly', entityId: 'A008', description: 'Resolved late payroll (system downtime on Aug 30)', timestamp: '2026-08-30T19:00:00Z' },
  { id: 'L015', actor: hrEmp.name, actorRole: 'hr', action: 'employee.updated', entity: 'employee', entityId: 'EMP004', description: `Updated reporting structure: ${e[3].name} → ${adminEmp.name}`, timestamp: '2026-07-22T15:00:00Z' },
  { id: 'L016', actor: adminEmp.name, actorRole: 'admin', action: 'payroll.processed', entity: 'payroll', entityId: 'PR-202607', description: 'Processed July 2026 payroll · ₹46.4L', timestamp: '2026-07-28T10:30:00Z' },
  { id: 'L017', actor: financeEmp.name, actorRole: 'finance', action: 'payroll.approved', entity: 'payroll', entityId: 'PR-202607', description: 'Approved July 2026 payroll', timestamp: '2026-07-28T11:20:00Z' },
  { id: 'L018', actor: hrEmp.name, actorRole: 'hr', action: 'salary.changed', entity: 'employee', entityId: 'EMP029', description: 'Updated salary: ₹58,000 → ₹62,000 (+6.9%)', timestamp: '2026-07-15T14:00:00Z' },
  { id: 'L019', actor: financeEmp.name, actorRole: 'finance', action: 'report.generated', entity: 'report', description: 'Generated H1 2026 Payroll Summary', timestamp: '2026-07-01T10:00:00Z' },
  { id: 'L020', actor: adminEmp.name, actorRole: 'admin', action: 'settings.updated', entity: 'settings', description: 'Updated professional tax slab for Karnataka', timestamp: '2026-06-20T11:00:00Z' },
  { id: 'L021', actor: hrEmp.name, actorRole: 'hr', action: 'employee.created', entity: 'employee', entityId: 'EMP242', description: `Added new employee ${e[42].name}`, timestamp: '2026-06-12T10:00:00Z' },
  { id: 'L022', actor: financeEmp.name, actorRole: 'finance', action: 'payroll.processed', entity: 'payroll', entityId: 'PR-202606', description: 'Processed June 2026 payroll · ₹45.7L', timestamp: '2026-06-28T10:30:00Z' },
  { id: 'L023', actor: adminEmp.name, actorRole: 'admin', action: 'logout', entity: 'session', description: 'Logged out', timestamp: '2026-10-12T18:00:00Z' },
  { id: 'L024', actor: financeEmp.name, actorRole: 'finance', action: 'anomaly.resolved', entity: 'anomaly', entityId: 'A005', description: 'Marked attendance mismatch as resolved', timestamp: '2026-10-06T11:00:00Z' },
  { id: 'L025', actor: hrEmp.name, actorRole: 'hr', action: 'login', entity: 'session', description: 'Logged in from Bangalore, IN', timestamp: '2026-10-14T08:30:00Z' },
]

// ============================================================================
// Notifications
// ============================================================================
export const notifications: AppNotification[] = [
  { id: 'N001', type: 'success', category: 'payroll', title: 'Payroll processing completed', description: `September 2026 payroll for ${employees.length} employees · ₹48.6L disbursed.`, timestamp: '2026-10-01T14:32:00Z', read: false, actionLabel: 'View details', actionHref: '/payroll/runs' },
  { id: 'N002', type: 'info', category: 'report', title: 'Tax report ready', description: 'Q3 2026 tax summary has been generated and is ready for download.', timestamp: '2026-10-08T17:42:00Z', read: false, actionLabel: 'Open report', actionHref: '/reports' },
  { id: 'N003', type: 'warning', category: 'anomaly', title: '3 payroll anomalies detected', description: 'Salary spike, duplicate payment and unusual deduction need your review.', timestamp: '2026-10-12T08:14:00Z', read: false, severity: 'high', actionLabel: 'Review', actionHref: '/anomalies' },
  { id: 'N004', type: 'info', category: 'employee', title: '5 employee records need review', description: 'Pending documentation and contract renewals this week.', timestamp: '2026-10-13T09:00:00Z', read: false },
  { id: 'N005', type: 'success', category: 'payroll', title: 'August payroll reconciled', description: 'All bank transactions confirmed by HDFC, ICICI and SBI.', timestamp: '2026-09-05T11:00:00Z', read: true },
  { id: 'N006', type: 'info', category: 'system', title: 'Quarterly review starting', description: 'Q4 performance review cycle opens on 15 Oct.', timestamp: '2026-10-10T09:00:00Z', read: false },
  { id: 'N007', type: 'warning', category: 'security', title: 'New device sign-in', description: 'Sign-in detected from a new Macbook in Mumbai, IN.', timestamp: '2026-10-14T07:30:00Z', read: false },
  { id: 'N008', type: 'success', category: 'employee', title: '2 new employees onboarded', description: `${e[47].name} and ${e[44].name} completed onboarding.`, timestamp: '2026-09-30T16:00:00Z', read: true },
  { id: 'N009', type: 'info', category: 'report', title: 'Department cost report ready', description: 'Engineering department cost analysis for September.', timestamp: '2026-10-05T10:00:00Z', read: true },
  { id: 'N010', type: 'error', category: 'system', title: 'Failed bank transfer · 2 employees', description: 'Re-initiate transfers for EMP142 and EMP198.', timestamp: '2026-10-02T15:20:00Z', read: true },
  { id: 'N011', type: 'info', category: 'employee', title: 'Document expiry · 7 employees', description: 'ID documents expiring within 30 days.', timestamp: '2026-10-09T09:00:00Z', read: true },
  { id: 'N012', type: 'warning', category: 'payroll', title: 'October payroll draft ready', description: 'Review the draft before 28 Oct to avoid delays.', timestamp: '2026-10-14T07:00:00Z', read: false, actionLabel: 'Open draft', actionHref: '/payroll/process' },
]

export { employees }