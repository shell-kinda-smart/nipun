# PayLens — Payroll Analytics Platform

Enterprise-grade payroll analytics platform. Role-based dashboards, payroll
processing wizard, forecasting, anomaly detection, employee 360° profiles,
payslip designer, reports, audit logs, command palette, dark / light mode.

![PayLens](public/favicon.svg)

## Stack

**Frontend**

- **Vite 6** + **React 18** + **TypeScript 5**
- **Tailwind CSS 3.4** with CSS-variable design tokens
- **shadcn/ui-style primitives** (radix-ui under the hood)
- **Framer Motion** for micro-animations and page transitions
- **Recharts** for analytics charts
- **Zustand** for client state (auth, theme, notifications, settings)
- **React Router v6** for routing
- **Lucide** icons, **date-fns**, **cmdk** for command palette
- **Sonner** for toasts

**Backend**

- **PHP 8.2+** with a small hand-rolled kernel — no framework, no Composer
- **PostgreSQL or MySQL 8.x** (SQLite for zero-setup local development),
  **PDO** with prepared statements
- **REST-style JSON API** with server-side sessions, RBAC and an audit trail
- **Integer minor units (paise)** for every monetary amount — no floating
  point in an authoritative total

## Getting started

### Frontend

```bash
npm install
npm run dev
```

App boots at `http://localhost:5173`.

```bash
npm run build      # production build (dist/)
npm run preview    # serve the built bundle
npm run typecheck  # tsc --noEmit
```

### Backend

The frontend talks to the PHP API in `backend/`. See
[`backend/README.md`](backend/README.md) for the full documentation and
[`backend/API.md`](backend/API.md) for the endpoint reference.

```bash
cp backend/.env.example backend/.env   # development defaults use SQLite
php backend/bin/setup.php              # create the schema + load the demo data
php -S 127.0.0.1:8080 -t backend/public backend/public/router.php
```

Vite proxies `/api` to `http://127.0.0.1:8080`, so the browser stays on one
origin and the session cookie is first-party.

`setup.php` is safe to re-run: it applies any pending migration, and it
leaves an existing dataset alone. It only tops up a demo account that is
missing. To apply a migration on its own:

```bash
php backend/bin/migrate.php             # apply pending migrations
php backend/bin/migrate.php --status    # list applied and pending ones
```

```bash
php backend/tests/run.php              # backend test suite
```

## Deployment

The frontend and PHP API can deploy together on Vercel, backed by PostgreSQL
in an isolated paylens schema. See [DEPLOYMENT.md](DEPLOYMENT.md) for the
required environment variables, database setup and verification steps.

## Demo accounts

The login page exposes one-click chips for every role, backed by the seeded
accounts (the password is the value of `PAYLENS_SEED_PASSWORD`, default
`PayLens#Demo2026` — a development credential only):

| Role             | Access                                                | Sidebar includes                                     |
| ---------------- | ----------------------------------------------------- | ---------------------------------------------------- |
| Admin            | everything                                            | everything · audit + settings + anomalies            |
| HR Manager       | employees · holds · reports · terminations            | employees · workforce analytics · documents · holds   |
| Finance Manager  | payroll preparation · payments · reports · audit       | payroll · tax center · reports · anomalies + audit    |
| Payroll Approver | approval decisions · final settlement sign-off         | approvals · settlements · terminations · schedules    |
| Employee         | own records only                                      | personal overview, payslips, tax info, profile        |

**Preparing and approving are separate duties.** Finance prepares a run and
submits it; an approver (or the admin) approves and finalises it. The server
enforces this from the role matrix in `backend/database/roles.php`, so the
sidebar, the buttons and the API all agree.

Every API call is authorised on the server as well as in the UI, so a direct
request cannot reach data the role does not own.

## Architecture

```
src/
├── components/
│   ├── auth/       # LoginPage, RoleSwitcher, ProtectedRoute
│   ├── command/    # ⌘K CommandPalette (global hotkey + groups)
│   ├── layout/     # AppShell, Sidebar, Topbar, MobileNav, NotificationsPopover
│   ├── shared/     # ErrorBoundary, PageHeader, StatCard, Sparkline, EmptyState, …
│   └── ui/         # shadcn primitives — Button, Card, Input, Dialog, Sheet, …
├── data/           # types, constants, deterministic seed, indexes
├── lib/            # utils (cn), formatters, nav config, download helpers
├── pages/          # one component per route
├── routes/         # route table + LoginRoute wrapper
└── store/          # Zustand stores — auth, command, notifications, settings
```

## Foundation phases (✅ all 6 done)

| #  | Phase                | Status |
| -- | -------------------- | ------ |
| 1  | Scaffold             | ✅     |
| 2  | Design system        | ✅     |
| 3  | Mock data layer      | ✅     |
| 4  | Auth & roles         | ✅     |
| 5  | App shell            | ✅     |
| 6  | Command palette      | ✅     |

## Feature phases (✅ all 8 done)

| #  | Feature                       | Highlights                                          |
| -- | ----------------------------- | --------------------------------------------------- |
| 7  | Employees + 360° profile      | directory w/ filters, profile w/ 5 tabs             |
| 8  | Payroll processing wizard     | 6-step flow, sticky footer, sonner confirmation     |
| 9  | Anomaly detection center      | filterable list, detail Sheet, timeline, actions   |
| 10 | Analytics + forecasting       | linear regression, 3-month forecast, R², bands      |
| 11 | Reports center                | 7 templates, live preview, real CSV/JSON/TXT export |
| 12 | Audit log viewer              | grouped by day, actor/action filters, CSV export    |
| 13 | Payslip designer              | branded card, earnings/deductions, in-words net     |
| 14 | Polish                        | settings, tax center, documents, my tax info        |

## Polish added

- **Error boundary** at the app root (`ErrorBoundary`) — no more blank-screen crashes
- **Server-managed sessions** — HttpOnly cookie, CSRF protection, idle and absolute expiry
- **Real CSV downloads** — audit log + every report downloads an actual file (blob + URL)
- **Settings persistence** — notification/security toggles are stored server-side
- **Login validation** — email regex, inline error, loading state, accessible focus rings
- **Print stylesheet** — payslip prints cleanly without sidebar/topbar
- **Live badge counts** — sidebar + mobile nav badges update as you mark notifications

## What's mocked (intentional)

- **PDF / XLSX generation** — CSV for true downloads; PDF/XLSX fall back to JSON / TXT
- **File upload** — buttons present, no upload handler
- **Email delivery** — password reset and notification emails are not sent

Everything else is served by the PHP backend: employees, compensation, payroll
runs, payslips, anomalies, reports, the audit trail and the notification read
state are all read from and written to the database. The role switcher signs
in as a seeded demo account through a demo-only endpoint that does not exist
when `APP_ENV=production`.

## Extending later

- Add WebSocket for live anomaly notifications
- Wire Form 16 / TDS certificate PDF generation with `pdf-lib`
- Add an employee self-service profile-edit flow
- Replace the seeded payroll rules with verified, jurisdiction-tagged values
