# PayLens — gap analysis (enhancement phase)

> **This is the audit that drove the enhancement phase, kept as a record of
> what was found at the time. It is not a description of the application as
> it stands now.**
>
> Every gap listed in sections 2, 3 and 4 below has since been closed, and
> the counts in the header are from that moment, not from today. The
> authoritative picture is the README, `backend/API.md` and the test suite
> (`php backend/tests/run.php`), which currently covers 106 tests.

Audit of the platform as it stands, before the employee-selection / approval /
payment / scheduling / termination work. Every line below was checked against
the code, not inferred from the file names.

**Stack:** React 18 + TypeScript + Vite (frontend, unchanged), PHP 8.3 + PDO
(backend, `backend/`), MySQL 8.x target with a SQLite development fallback.
8 migrations, 23 tables, 60 API routes, 72 backend tests.

---

## 1. Complete and working

| Area | Evidence |
|---|---|
| Authentication | Server-side sessions (SHA-256 digest at rest), `password_hash`, CSRF header, per-IP and per-identity throttling, account lockout, generic failure messages — `backend/src/Core/SessionService.php`, `backend/src/Services/AuthService.php` |
| Authorisation | 14 permissions across 4 roles, seeded from the same matrix the frontend uses, enforced per endpoint — `backend/src/Core/Rbac.php` |
| Payroll calculation | Integer paise throughout, configurable rules, half-up rounding, `gross − deductions = net` exactly — `backend/src/Services/PayrollCalculator.php` |
| Payroll lifecycle | `draft → calculated → approved → finalized`, plus `reversed`; transitions claimed with a conditional UPDATE so two concurrent requests cannot both advance a run — `backend/src/Services/PayrollService.php` |
| Duplicate prevention | `UNIQUE (year, month)` on runs, `UNIQUE (run, employee)` on payslips, plus the conditional-update claim |
| Historical integrity | Compensation is versioned, never overwritten; a finalized payslip keeps the numbers it was calculated with |
| Payslips | Per-employee lines, scoped access (an employee only ever sees their own), print view |
| Reports | 7 report types computed from stored records |
| Audit trail | Actor, action, entity, outcome, non-sensitive metadata, no credentials |
| Notifications | Stored in MySQL, per-user, read state, unread count |
| Data model | Departments, employees, versioned compensation, bank details, attendance, rules, slabs, preferences, billing |
| Frontend | 27 files wired to the API; 18 routes verified in a browser with zero console errors |

## 2. Incomplete — required by the brief

| # | Gap | Where it has to land |
|---|---|---|
| 1 | **Employee selection per run.** Every employee is paid every run; there is no way to select a subset, and no record of who was selected | `payroll_run_employees`, `PayrollService`, wizard steps 1–2 |
| 2 | **Eligibility.** No server-side rule decides who is eligible; the run simply takes every non-exited employee | `PayrollService::eligibleEmployees()` |
| 3 | **Holds and exclusions.** No hold concept, no per-run exclusion, no reason/period/actor/timestamp | `employee_holds`, `payroll_run_employees` |
| 4 | **Approval stage.** The lifecycle jumps `calculated → approved`; there is no *submitted for approval*, no rejection, no rejection reason, no separation of duties (finance can prepare **and** approve) | `payroll_runs.status`, `payroll_runs.rejection_reason`, permissions |
| 5 | **Payment tracking.** Nothing tracks whether an employee was actually paid; a finalized run is displayed as “paid” | `payment_records`, `payment_status_history` |
| 6 | **Scheduled payroll.** No scheduler, no schedule table, no execution history, no idempotency | `scheduled_jobs`, `job_runs`, `bin/worker.php` |
| 7 | **Recurring reports.** Not present | `scheduled_jobs` (report type), email delivery |
| 8 | **Email delivery.** No SMTP, no mailer, no templates, no delivery state | `src/Services/Mailer.php`, `email_deliveries` |
| 9 | **Background jobs and retries.** No job queue, no attempt counting, no failure reason, no retry | `job_runs`, `bin/worker.php` |
| 10 | **Termination workflow.** Absent: no request, no approval, no notice, no letter, no acknowledgement, no settlement | `termination_requests`, `termination_letters`, `termination_acknowledgements`, `settlements`, `settlement_items` |
| 11 | **Termination letter + acknowledgement.** Absent | as above, plus a secure employee-facing viewer |
| 12 | **Employee notice on next login.** Absent — notifications are not generated for termination events at all | notification generation in the termination service |
| 13 | **Final settlement.** Absent — no leave encashment, no notice adjustment, no arrears, no final net | `settlements`, `settlement_items` |
| 14 | **Account access after termination.** Absent — a terminated employee keeps working login | account status + policy on `users`/`employees` |
| 15 | **Role for the approval duty.** `finance` holds `payroll:process` **and** `payroll:approve` | new `approver` role |
| 16 | **Notifications for the new events.** Only approval-request-ish seed rows exist; nothing generates them at runtime | notification service used by the new services |
| 17 | **Audit coverage for the new events.** The audit trail has no entries for holds, exclusions, payments, schedules, terminations, acknowledgements | every new service writes to `AuditLogger` |

## 3. Broken or wrong

| # | Defect | Effect | Fix |
|---|---|---|---|
| 1 | `src/data/seed.ts` is dead code but still exported by nothing and imported by nothing | duplicate source of truth for the domain model | delete it (blocked by the execution policy — needs the user to delete it) |
| 2 | `finance` role can both prepare and approve payroll | no separation of duties | split the approval duty into a new `approver` role |
| 3 | The `payroll_runs.status` → UI mapping calls a finalized run “paid” | a finalized run is **not** paid — no money moved | separate run status from payment status |
| 4 | `bin/seed.php --force` was ambiguous (it could not work — it hit duplicate keys) | confusing failure | `--force`/`--fresh` now mean “reset the seeded tables and reload” and print the table list |
| 5 | `src/index.css` imports `./src/styles/theme.css`, which resolves to `src/src/styles/…` | Vite warns on every build; the theme still loads through Tailwind's resolver | pre-existing; left alone (out of scope) |
| 6 | The dev database carries two extra payroll runs and several resolved anomalies from an earlier manual UI test | the dashboard trend showed Jun–Nov instead of Apr–Sep | needs `php backend/bin/seed.php --fresh` (destructive — needs the user) |

## 4. Blocked by the environment

| # | Blocker | Consequence |
|---|---|---|
| 1 | No MySQL server on this machine (`pdo_mysql` is loaded, there is no server) | the MySQL path cannot be executed here; it is covered by static dialect tests instead. A staged MariaDB 10.11 archive is at `C:\Users\Welcome\AppData\Local\Temp\paylens-mariadb-20261027-232305`, but the execution policy blocks running downloaded binaries |
| 2 | No SMTP server or provider credentials | email delivery can be implemented and unit-tested, but nothing can be *sent*. The feature must report “awaiting configuration”, never “sent” |
| 3 | No systemd/cron on this machine | the scheduler ships as a CLI worker (`bin/worker.php`) plus a documented cron entry; there is no way to run it continuously here |
| 4 | The execution policy blocks destructive dev-database resets and file deletion | two cleanups need the user: `--fresh` reseed, deleting `src/data/seed.ts` |

## 5. Deliberately not doing

- **No CSV/Excel export work.** The exports that exist from the earlier phase are left as they are; the new scheduled-report feature delivers by email instead, as the brief asks. No new export capability is added.
- **No forecasting.** The pre-existing client-side forecast card on the Analytics page is left exactly as designed; nothing server-side and no new predictive feature is added.
- **No ML, no ERP modules, no payment-provider integration.** Payment tracking records *what happened*; it never moves money.

## 6. Files the work will touch

**New migrations** (additive only — `009`–`012`):
`payroll_run_employees`, `employee_holds`, `payment_records`,
`payment_status_history`, `scheduled_jobs`, `job_runs`, `email_deliveries`,
`termination_requests`, `termination_letters`, `termination_acknowledgements`,
`settlements`, `settlement_items`, plus columns on `payroll_runs`,
`payroll_employees` and `users`.

**New backend code:** `Services/{Mailer,NotificationService,PayrollEligibility,PaymentService,SchedulerService,TerminationService,SettlementService,JobService}.php`,
`Controllers/{Termination,Settlement,Payment,Schedule,Job,MyTermination}.php`,
`bin/worker.php`, `database/templates/*.php`.

**Modified:** `src/Core/Rbac.php`, `src/Services/PayrollService.php`,
`src/Repositories/*`, `src/routes.php`, `src/Services/AuthService.php`,
`config/config.php`, `.env.example`, the seed, and the migration files for the
new roles/permissions.

**Frontend:** new pages for payroll runs, approvals, payments, schedules,
recurring reports, failed jobs, termination requests, the letter viewer and
final settlement; the existing Payroll wizard gains selection, holds,
exclusions, submission, approval and payment steps; the notification centre
gains the new event types.
