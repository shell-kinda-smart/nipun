# PayLens API reference

Base URL in development: `/api` (proxied to `http://127.0.0.1:8080` by the Vite
dev server).

## Envelope

Every response uses the same shape:

```jsonc
// success
{ "data": <payload>, "meta": { /* optional */ } }

// failure
{ "error": { "code": "forbidden", "message": "…", "details": { /* optional */ } } }
```

Status codes: `200` ok, `201` created, `400` bad request, `401` not signed in,
`403` not permitted, `404` not found, `409` conflict (duplicate run, already
finalised…), `422` validation failed, `429` rate limited, `500` server error.

## Authentication

Sessions are server-side. The browser holds an opaque `paylens_session` cookie
(HttpOnly, SameSite=Lax). Mutating requests must also send the session's CSRF
token in the `X-CSRF-Token` header — `src/lib/api.ts` does this for you.

| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/login` | `{email, password}` → `{user, csrfToken, permissions, demoMode}` |
| POST | `/api/auth/demo-login` | `{role}` → same shape. **Only exists in demo mode.** |
| GET | `/api/auth/me` | → `{user, permissions, csrfToken, demoMode}` |
| POST | `/api/auth/logout` | revokes the session |
| POST | `/api/auth/password` | `{currentPassword, newPassword}` |
| GET | `/api/auth/sessions` | the signed-in user's own sessions |
| DELETE | `/api/auth/sessions/{id}` | revokes one session |

## Organisation

| Method | Path | Permissions | Notes |
|---|---|---|---|
| GET | `/api/departments` | `employees:read` | headcount + monthly budget |
| GET | `/api/employees` | `employees:read` | `?q=&department=&status=&sort=&page=&perPage=` |
| GET | `/api/employees/export.csv` | `employees:read` | CSV download |
| POST | `/api/employees` | `employees:write` | create |
| GET | `/api/employees/{id}` | `employees:read` | profile + department + colleagues + salary history |
| PATCH | `/api/employees/{id}` | `employees:write` | update |
| POST | `/api/employees/{id}/archive` | `employees:write` | archive (never hard-deletes) |
| GET | `/api/employees/{id}/compensation` | `employees:read` | current + history |
| PUT | `/api/employees/{id}/compensation` | `employees:write` | adds a new compensation version |
| GET | `/api/employees/{id}/payslips` | `payroll:read` | that employee's payslips |

### Employee shape

```ts
interface Employee {
  id: string                 // 'EMP001'
  name: string
  firstName: string
  lastName: string
  email: string
  phone: string
  designation: string
  departmentId: string       // 'eng'
  role: 'admin' | 'hr' | 'finance' | 'employee'
  joinedAt: string           // 'YYYY-MM-DD'
  status: 'active' | 'on_leave' | 'probation' | 'exited'
  employmentType: string
  performanceRating: number | null
  avatarSeed: string
  ctcAnnual: number          // rupees
  ctcAnnualPaise: number     // authoritative integer
  monthlyGross: number       // rupees
  monthlyGrossPaise: number
  salary: { basic, hra, specialAllowance, travelAllowance, pf, professionalTax }
  bank: { account, ifsc, bankName }
  attendance: { present, absent, late, leaves }
  department?: Department
  colleagues?: Employee[]
  salaryHistory?: { effectiveFrom, effectiveTo, basic, ctcAnnual }[]
}
```

Money fields come in two forms: a plain rupee number for display and the
matching `*Paise` integer. Use the integer for anything that matters.

## Payroll

| Method | Path | Permissions |
|---|---|---|
| GET | `/api/payroll/runs` | `payroll:read` |
| POST | `/api/payroll/runs` | `payroll:process` — `{month, year}` |
| GET | `/api/payroll/runs/{id}` | `payroll:read` |
| GET | `/api/payroll/runs/{id}/payslips` | `payroll:read` |
| GET | `/api/payroll/runs/{id}/selection` | `payroll:select` — who the run covers |
| PUT | `/api/payroll/runs/{id}/selection` | `payroll:select` — `{included: [id], excluded: [{id, reason}]}` |
| POST | `/api/payroll/runs/{id}/calculate` | `payroll:process` |
| POST | `/api/payroll/runs/{id}/submit` | `payroll:submit` — calculated → submitted |
| POST | `/api/payroll/runs/{id}/approve` | `payroll:approve` — submitted → approved |
| POST | `/api/payroll/runs/{id}/reject` | `payroll:reject` — `{reason}` |
| POST | `/api/payroll/runs/{id}/finalize` | `payroll:approve` — approved → finalized (opens pending payments) |
| POST | `/api/payroll/runs/{id}/reverse` | `payroll:approve` — `{reason}` |
| POST | `/api/payroll/runs/{id}/adjustments` | `payroll:process` — `{employeeId, kind, amount, reason, approved}` |
| POST | `/api/payroll/preview` | `payroll:process` — `{month, year}`; calculates without writing |
| GET | `/api/payroll/rules` | `payroll:read` — the configured calculation rules |
| GET | `/api/payroll/approvers` | `payroll:read` — accounts that may approve a run |
| GET | `/api/payroll/approvals` | `payroll:approve` — runs waiting for a decision |

Workflow:

```
draft ──calculate──▶ calculated ──submit──▶ submitted ──approve──▶ approved
                          │                     │                       │
                          │                  reject                finalize
                          │                     ▼                       ▼
                          └────────────── rejected              finalized
                                                       (payments open as pending)
```

A finalized run is **not** a paid run: payment is tracked separately. A
finalized run can never be recalculated.

### Selection payload

```ts
{
  runId: string
  status: string
  selected: { id, name, email, designation, departmentId, departmentName,
              employmentStatus, accessStatus, basicPaise, status,
              explicitlySelected }[]
  excluded: { id, name, …, reason, excludedAt }[]
  ineligible: { id, name, …, reason, detail }[]
  holds: { id, employee_id, reason, effective_from, effective_to, … }[]
  summary: { selected, excluded, ineligible, onHold }
}
```

`ineligible[].reason` is one of `no_longer_employed`, `access_revoked`,
`on_hold`, `no_compensation`, `not_joined_yet`.

### Payments

| Method | Path | Permissions |
|---|---|---|
| GET | `/api/payroll/payments` | `payroll:read` — `?status=` |
| GET | `/api/payroll/runs/{id}/payments` | `payroll:read` — `{records, summary}` |
| POST | `/api/payroll/runs/{id}/payments` | `payroll:pay` — `{employeeId, status, reference, failureReason, amount}` |
| GET | `/api/payroll/payments/{id}/history` | `payroll:read` |

`status` is `pending`, `paid` or `failed`. A `paid` record needs a
`reference`; a `failed` one needs a `failureReason`. The summary counts and
amounts by status.

### Holds

| Method | Path | Permissions |
|---|---|---|
| GET | `/api/holds` | `employees:read` |
| POST | `/api/employees/{id}/holds` | `employees:hold` — `{reason, category, effectiveFrom, effectiveTo, notes}` |
| POST | `/api/holds/{id}/release` | `employees:hold` |
| GET | `/api/employees/{id}/holds` | `employees:read` |

### Schedules, jobs and email

| Method | Path | Permissions |
|---|---|---|
| GET | `/api/schedules` | `schedules:read` — `?kind=` |
| POST | `/api/schedules` | `schedules:write` — `{kind, name, reportType, frequency, scheduledAt, criteria, recipients, delivery}` |
| PATCH | `/api/schedules/{id}` | `schedules:write` — `{status}` (active / paused / cancelled) |
| POST | `/api/schedules/run-due` | `schedules:write` — runs whatever is due |
| GET | `/api/schedules/mail-status` | `schedules:read` — `{configured, message}` |
| GET | `/api/jobs` | `jobs:read` — `?status=&limit=` |
| GET | `/api/jobs/failed` | `jobs:read` |
| POST | `/api/jobs/{id}/retry` | `jobs:retry` |

`kind` is `payroll_preparation` or `recurring_report`. A scheduled payroll
preparation never finalises a run: it prepares it and leaves it for the
approval policy. Running the same schedule twice never creates two runs.

### Termination, notice and settlement

| Method | Path | Permissions |
|---|---|---|
| GET | `/api/terminations` | `termination:read` — `?status=&employeeId=` |
| POST | `/api/terminations` | `termination:write` — `{employeeId, category, reason, hrNotes, lastWorkingDay, noticePeriodDays, noticeServedFrom}` |
| GET | `/api/terminations/{id}` | `termination:read` |
| POST | `/api/terminations/{id}/submit` | `termination:write` |
| POST | `/api/terminations/{id}/approve` | `termination:approve` |
| POST | `/api/terminations/{id}/reject` | `termination:approve` — `{reason}` |
| POST | `/api/terminations/{id}/issue-notice` | `termination:approve` — writes a letter version |
| GET | `/api/settlements` | `settlement:read` |
| POST | `/api/settlements/calculate` | `settlement:read` — `{terminationRequestId}` |
| GET | `/api/settlements/{id}` | `settlement:read` |
| POST | `/api/settlements/{id}/items` | `settlement:read` — `{code, label, kind, amount, note}` (manual components) |
| POST | `/api/settlements/{id}/approve` | `settlement:approve` |
| POST | `/api/settlements/{id}/finalize` | `settlement:approve` — completes the offboarding |
| GET | `/api/me/termination` | any signed-in user — their own notice and settlement |
| POST | `/api/me/termination/acknowledge` | the addressed employee — `{letterId}` |

### Termination workflow

```
draft → submitted → approved → notice_issued → acknowledged → settled → completed
```

Submitting a request never terminates an employee. The notice is only issued
after approval, and an acknowledgement records receipt only — never agreement.

```ts
// a termination request
{
  id: 'TR-0001', employeeId, employeeName, designation, departmentName,
  category: 'resignation' | 'termination' | 'retirement' | 'end_of_contract',
  reason, hrNotes, lastWorkingDay, noticePeriodDays, noticeServedFrom,
  status, requestedAt, approvedAt, rejectedAt, rejectionReason,
  noticeIssuedAt, acknowledgedAt, completedAt,
  letters: { id, version, reference, contentHtml, issuedAt, supersededAt }[],
  settlement: Settlement | null
}

// a settlement
{
  id: 'ST-0001', terminationRequestId, employeeId, status,
  totalPayable, totalPayablePaise, totalRecoverable, totalRecoverablePaise,
  netPayable, netPayablePaise,
  items: { id, code, label, kind: 'earning' | 'deduction', amount, amountPaise,
           source: 'computed' | 'manual', note }[],
  calculatedAt, approvedAt, finalizedAt
}
```

The employee's own notice (`GET /api/me/termination`):

```ts
{
  notice: { id, terminationRequestId, version, reference, contentHtml, issuedAt } | null,
  request: TerminationRequest | null,
  settlement: Settlement | null,
  acknowledgedAt: string | null,
  acknowledgementWording: 'I acknowledge that I have received and viewed this notice.'
}
```

## Payslips

| Method | Path | Notes |
|---|---|---|
| GET | `/api/payslips` | `?employeeId=` — an employee role only ever sees its own |
| GET | `/api/payslips/{id}` | one payslip |
| GET | `/api/payslips/{id}/csv` | CSV download |
| GET | `/api/payslips/{id}/print` | print-friendly HTML |

```ts
interface Payslip {
  id: string
  payrollRunId: string
  employeeId: string
  employeeName: string
  designation: string
  departmentId: string
  departmentName: string
  month: number
  year: number
  earnings: { kind, label, amount, amountPaise }[]
  deductions: { kind, label, amount, amountPaise }[]
  gross: number
  grossPaise: number
  totalDeductions: number
  totalDeductionsPaise: number
  net: number
  netPaise: number
  tax: number
  taxPaise: number
  workingDays: number
  daysPresent: number
  status: 'draft' | 'review' | 'approved' | 'paid' | 'failed'
  generatedAt: string
}
```

## Reports

| Method | Path | Permissions | Notes |
|---|---|---|---|
| GET | `/api/summary` | any signed-in user | `{unreadNotifications, openAnomalies, criticalAnomalies, activeEmployees}` |
| GET | `/api/reports/dashboard` | any signed-in user | dashboard payload (below) |
| GET | `/api/reports/analytics` | `analytics:read` | analytics payload (below) |
| GET | `/api/reports/tax-center` | `payroll:read` | tax centre payload (below) |
| GET | `/api/reports/{type}` | `reports:read` | `{title, headers, rows}` |
| GET | `/api/reports/{type}.csv` | `reports:export` | CSV download |

Report types: `monthly_payroll`, `tax_summary`, `employee_salary`,
`department_cost`, `payroll_growth`, `anomaly_report`, `ytd_payroll`.

### Dashboard payload

```ts
{
  currentRun: PayrollRun | null
  previousRun: PayrollRun | null
  growth: number                  // percent, month on month
  activeEmployees: number
  activeEmployeeChange: number    // percent, this period's run vs the last
  openAnomalies: number
  openAnomalyChange: number       // percent, detections in the last 30 days vs the 30 before
  criticalAnomalies: number
  highAnomalies: number
  unreadNotifications: number
  payrollNotifications: number    // unread notifications in the payroll category
  departmentCount: number
  trend: { id, month, year, label, gross, net, tax, employees }[]
  departments: { name, value, color }[]
  recentAnomalies: Anomaly[]
}
```

### Analytics payload

```ts
{
  lastGross: number
  prevGross: number
  growth: number
  averageSalary: number
  headcount: number
  trend: { id, month, year, label, gross, net, tax, employees }[]
  ctcBands: { label, count }[]
  departments: { name, value, color, spend }[]
  totalSpend: number
}
```

### Tax centre payload

```ts
{
  currentTax: number
  previousTax: number
  growth: number
  ytdTax: number
  projectedAnnual: number
  employeeCount: number
  trend: { id, month, year, label, tax }[]
  departments: { name, color, value, tax }[]
  slabs: { label, rate, count }[]
}
```

## Anomalies, audit, notifications, documents

| Method | Path | Permissions |
|---|---|---|
| GET | `/api/anomalies` | `anomalies:read` — `?severity=&status=&employeeId=`; `meta.counts` |
| GET | `/api/anomalies/{id}` | `anomalies:read` |
| PATCH | `/api/anomalies/{id}` | `anomalies:resolve` — `{status, assignedTo}` |
| GET | `/api/audit-logs` | `audit:read` — `?actor=&action=&page=&perPage=`; `meta.actions` and `meta.actors` feed the filters |
| GET | `/api/audit-logs.csv` | `audit:export` |
| GET | `/api/notifications` | any signed-in user; `meta.unread` |
| PATCH | `/api/notifications/{id}/read` | any signed-in user |
| POST | `/api/notifications/read-all` | any signed-in user |
| GET | `/api/documents` | `employees:read` — `?employeeId=&type=&status=` |
| GET | `/api/documents/{id}` | `employees:read` |

## Own records and settings

| Method | Path | Notes |
|---|---|---|
| GET | `/api/me/profile` | the signed-in employee's record |
| GET | `/api/me/payslips` | the signed-in employee's payslips |
| GET | `/api/me/tax` | the signed-in employee's tax summary |
| GET | `/api/settings/profile` | `{id, name, email, role, employeeId, permissions}` |
| PUT | `/api/settings/profile` | `{name}` |
| GET | `/api/settings/preferences` | notification + security preferences |
| PUT | `/api/settings/preferences` | update them |
| GET | `/api/settings/billing` | plan, seats and invoices |
| GET | `/api/settings/tax-slabs` | the configured slabs |

## Roles and permissions

The permission matrix is identical to the frontend's (`src/data/constants.ts`):

| Permission | admin | hr | finance | employee |
|---|:--:|:--:|:--:|:--:|
| `employees:read` | ✔ | ✔ | ✔ | |
| `employees:write` | ✔ | ✔ | | |
| `payroll:read` | ✔ | ✔ | ✔ | ✔ |
| `payroll:process` | ✔ | | ✔ | |
| `payroll:approve` | ✔ | | ✔ | |
| `reports:read` | ✔ | ✔ | ✔ | |
| `reports:export` | ✔ | ✔ | ✔ | |
| `analytics:read` | ✔ | ✔ | ✔ | |
| `audit:read` | ✔ | ✔ | ✔ | |
| `audit:export` | ✔ | | ✔ | |
| `settings:read` | ✔ | | | |
| `settings:write` | ✔ | | | |
| `anomalies:read` | ✔ | ✔ | ✔ | |
| `anomalies:resolve` | ✔ | | ✔ | |

The `employee` role is further restricted to its own records on the server, even
where it holds a permission.
