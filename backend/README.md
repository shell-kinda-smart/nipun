# PayLens backend

The REST API behind the PayLens payroll platform: authentication, employee
records, a deterministic payroll engine, payslips, reports and an audit trail.

The frontend in this repository is complete and unchanged in design — this
backend is what it talks to.

---

## Stack

| Piece | Choice | Why |
|---|---|---|
| Language | PHP 8.2+ (developed on 8.3) | The brief's preferred default; available here. |
| Framework | None — a small hand-rolled kernel | No Composer dependencies, so it runs on a bare PHP install with no network access. The object graph is short enough to read in one screen. |
| Database | MySQL 8.x | The production target. SQLite is supported as a zero-setup development fallback. |
| Access | PDO with prepared statements | Parameterised queries everywhere; `PDO::ATTR_EMULATE_PREPARES` is off. |
| Sessions | Server-side records in `sessions` | The browser holds an opaque token; the database stores its SHA-256 digest, so a dump cannot be replayed. |
| API | REST-style JSON | One envelope for every response. |

### Requirements

- PHP 8.2 or newer with `pdo_mysql`, `mbstring`, `json` and `openssl`
- MySQL 8.x (or MariaDB 10.6+) for production; SQLite for local development
- Composer is **not** required

---

## Directory structure

```
backend/
├── bootstrap.php              # loads config + .env, wires the app
├── bin/
│   ├── setup.php              # create the database, migrate, seed
│   ├── migrate.php            # apply pending migrations
│   ├── seed.php               # load the fictional demo dataset
│   └── create-admin.php       # create or promote an administrator
├── config/config.php          # configuration (env-overridable)
├── database/
│   ├── migrations/            # one file per migration, applied in order
│   └── seeds/                 # the fictional development dataset
├── public/
│   ├── api/index.php          # HTTP front controller
│   └── router.php             # router script for the built-in server
├── src/
│   ├── Controllers/           # HTTP handlers
│   ├── Core/                  # kernel, router, request/response, DB, auth
│   ├── Repositories/          # SQL
│   ├── Services/              # payroll engine, auth, audit, rules
│   └── Support/               # row → API mappers, the seeded PRNG
├── tests/                     # the test suite and its harness
├── .env.example               # configuration template
└── API.md                     # endpoint reference
```

---

## Getting started

### 1. Configure

```bash
cp backend/.env.example backend/.env
```

For development the template already points at a local SQLite file, so nothing
else is needed. For MySQL, set `DB_DRIVER=mysql` and the connection details.

### 2. Create the database and load the demo data

```bash
php backend/bin/setup.php
```

That creates the schema, applies the migrations and loads the fictional demo
dataset (51 employees, four departments, six payroll periods, anomalies,
notifications, documents, an audit history and the billing records).

`setup.php` is safe to run again at any time: it applies any pending
migration and leaves an existing dataset exactly as it is. The only thing it
adds to a database that already holds data is a demo account that is
missing — for instance the approver account, when that role was added to
the seed after the database was first created.

Re-loading the demo data over an existing dataset needs an explicit flag —
nothing is ever reset silently:

```bash
php backend/bin/seed.php --fresh   # clear the seeded tables, then reload them
php backend/bin/seed.php --force   # load without clearing (fails on conflicts)
```

Both refuse to run when `APP_ENV=production`.

The seeded accounts all share the password in `PAYLENS_SEED_PASSWORD`
(default `PayLens#Demo2026`). **That is a development credential.** The seed
refuses to run with the default password when `APP_ENV=production`.

### 3. Start the API

```bash
php -S 127.0.0.1:8080 -t backend/public backend/public/router.php
```

The API is then on `http://127.0.0.1:8080/api`.

### 4. Start the frontend

```bash
npm run dev
```

Vite proxies `/api` to `http://127.0.0.1:8080` (see `vite.config.ts`), so the
browser stays on one origin and the session cookie is first-party — no CORS
configuration is needed in development. Point the proxy elsewhere with
`PAYLENS_API_URL`.

### Creating an administrator

```bash
php backend/bin/create-admin.php admin@example.com "a long unique password"
```

The password is stored only as a `password_hash()` digest. The command creates
the account, or promotes an existing one to the admin role and resets its
password.

---

## Migrations

Migrations are plain PHP files in `database/migrations`, named
`NNN_description.php`, each returning `['up' => callable(Database): void]`.
They are applied in filename order and recorded in a `migrations` table, so
re-running is a no-op and an existing database is never dropped or reset.

```bash
php backend/bin/migrate.php            # apply pending migrations
php backend/bin/migrate.php --status   # list applied and pending migrations
```

Migrations are written once and emit either MySQL or SQLite DDL — see
`src/Core/Schema.php` for the dialect handling (auto-increment, table-level
foreign keys, index syntax).

---

## Authentication

- Passwords are hashed with `password_hash()` (bcrypt) and checked with
  `password_verify()`.
- A successful sign-in creates a **new** session, which rotates the session
  identifier. Sessions carry an absolute lifetime and an idle timeout.
- The session cookie is `HttpOnly` and `SameSite=Lax`; set
  `SESSION_COOKIE_SECURE=true` when serving over HTTPS.
- Every mutating request must carry the session's CSRF token in the
  `X-CSRF-Token` header. The browser cannot attach a custom header
  cross-origin without a pre-flight the server refuses, so a cross-site
  request cannot forge a state change.
- Sign-in failures are deliberately indistinguishable: an unknown address and
  a wrong password produce the same message and take the same time. Repeated
  failures lock the account and are rate limited per address and per identity.
- `POST /api/auth/demo-login` signs in as a seeded role **without a password**.
  It exists only while the server runs in demo mode and refuses to run when
  `APP_ENV=production`, so the demo's role switcher works without shipping a
  credential to the browser.

### Roles

The permission matrix is the single source of truth in
`backend/database/roles.php`. The frontend mirrors it in
`src/data/constants.ts`, the seed loads it, and the migration keeps an
existing database in step with it.

| Permission | admin | hr | finance | approver | employee |
|---|:--:|:--:|:--:|:--:|:--:|
| `employees:read` | ✔ | ✔ | ✔ |  |  |
| `employees:write` | ✔ | ✔ |  |  |  |
| `employees:hold` | ✔ | ✔ |  |  |  |
| `payroll:read` | ✔ | ✔ | ✔ | ✔ | ✔ |
| `payroll:process` | ✔ |  | ✔ |  |  |
| `payroll:select` | ✔ |  | ✔ |  |  |
| `payroll:submit` | ✔ |  | ✔ |  |  |
| `payroll:approve` | ✔ |  |  | ✔ |  |
| `payroll:reject` | ✔ |  |  | ✔ |  |
| `payroll:pay` | ✔ |  | ✔ |  |  |
| `reports:read` | ✔ | ✔ | ✔ | ✔ |  |
| `reports:export` | ✔ | ✔ | ✔ |  |  |
| `reports:schedule` | ✔ | ✔ | ✔ |  |  |
| `analytics:read` | ✔ | ✔ | ✔ | ✔ |  |
| `audit:read` | ✔ | ✔ | ✔ | ✔ |  |
| `audit:export` | ✔ |  | ✔ |  |  |
| `settings:read` | ✔ |  |  |  |  |
| `settings:write` | ✔ |  |  |  |  |
| `anomalies:read` | ✔ | ✔ | ✔ |  |  |
| `anomalies:resolve` | ✔ |  | ✔ |  |  |
| `schedules:read` | ✔ |  | ✔ | ✔ |  |
| `schedules:write` | ✔ |  | ✔ |  |  |
| `jobs:read` | ✔ |  |  |  |  |
| `jobs:retry` | ✔ |  |  |  |  |
| `termination:read` | ✔ | ✔ |  | ✔ |  |
| `termination:write` | ✔ | ✔ |  |  |  |
| `termination:approve` | ✔ |  |  | ✔ |  |
| `settlement:read` | ✔ | ✔ | ✔ | ✔ |  |
| `settlement:approve` | ✔ |  |  | ✔ |  |

`finance` prepares a run and submits it; `approver` approves it. Approving
is deliberately withheld from the role that prepares, because that is what
gives the payroll process its separation of duties.

The `employee` role is further restricted to its own records on the server,
even where it holds a permission. Every protected endpoint enforces its
permission independently of the UI.

---

## The payroll engine

`src/Services/PayrollCalculator.php` is the only place a salary is computed.
It is independent of any presentation code and every amount is an **integer
number of paise** — no binary floating point ever touches an authoritative
total.

### Formulas

```
Gross Earnings
  = basic salary
  + house rent allowance
  + special allowance
  + travel allowance
  + approved bonus adjustments
  + approved overtime adjustments

Total Deductions
  = provident fund        (percentage of basic, capped by rule)
  + professional tax      (fixed amount by rule)
  + income tax (TDS)     (percentage of basic, by rule)
  + approved deduction adjustments

Net Payable
  = Gross Earnings - Total Deductions
```

### Rounding

Percentages are applied with integer arithmetic (`Money::applyRate`) and
rounded half-up. Component amounts are whole paise, so
`gross - deductions === net` always holds exactly.

### Rules are data, not code

The rules live in `payroll_rules` with a jurisdiction, an effective window and
a basis:

| Code | Basis | Value | Notes |
|---|---|---|---|
| `pf_employee` | percent of basic | 12%, capped at ₹1,800/month | Demo default |
| `professional_tax` | fixed | ₹200/month | Demo default |
| `tds_basic` | percent of basic | 10% | Demo default — a withholding estimate, not a tax computation |

The seeded values reproduce the figures the demo always showed. **They are
labelled as demo defaults and are not statutory rates.** A rule that is not
configured contributes nothing — no rate is ever assumed in code. Replace them
with verified rules (and set the jurisdiction) before using this for a real
payroll.

The same applies to the tax slabs in `tax_slabs`: the bands and rates are
configuration, and the employee counts in each band are always derived from
the payroll records, never stored.

### Workflow

```
draft ──calculate──▶ calculated ──approve──▶ approved ──finalize──▶ finalized
  ▲                       │                      │                      │
  └───────────────────────┴──────────────────────┘               reverse │
                                                                    ◀─────┘
```

- **calculate** reads the compensation in force at the end of the period and
  writes one payslip per employee with its line breakdown.
- **finalize** makes the run immutable. A finalized run can never be
  recalculated; corrections are explicit adjustments or a reversal, and the
  original payslips are preserved.
- Transitions are claimed with a conditional `UPDATE`, so two concurrent
  requests cannot both advance the same run — the second one updates zero rows
  and is rejected with `409`.
- `UNIQUE (year, month)` on `payroll_runs` and `UNIQUE (payroll_run_id,
  employee_id)` on `payslips` make duplicate processing impossible at the
  database level.
- Compensation is versioned: a salary change closes off the previous
  structure and inserts a new one, so a finalized payslip keeps the numbers it
  was calculated with.

---

## Audit trail

`audit_logs` records the actor, the action, the affected entity, the outcome,
the timestamp and non-sensitive change metadata. Passwords, session tokens,
CSRF tokens and personal details are never written there — the logger scrubs
blocked keys before inserting.

Recorded: sign-in and sign-out (including failures), employee creation and
edits, compensation changes, payroll calculation, approval, finalisation and
reversal, adjustments, anomaly resolution, settings changes, report exports
and payslip downloads.

Audit rows are written by the application only; there is no endpoint that
edits or deletes them.

---

## Reports

Reports are read from the database, never from hardcoded numbers:
monthly payroll, tax summary, employee salary, department cost, payroll
growth, anomaly report and year-to-date payroll. Each is available as JSON and
as CSV (`GET /api/reports/{type}.csv`, which requires `reports:export`).

CSV exports are protected against spreadsheet formula injection: a cell that
starts with `=`, `+`, `-` or `@` is prefixed with a quote so a spreadsheet
treats it as text.

---

## Tests

```bash
php backend/tests/run.php
```

The suite runs against an in-memory SQLite database through the real HTTP
kernel, so it exercises the routes, the middleware, the services and the
repositories — not a mock of them. It covers:

- money arithmetic and rounding, Indian digit grouping, validation rules,
  CSV formula-injection defence, the seeded PRNG
- the payroll engine: gross, deductions, net, the provident fund cap,
  zero-value and negative inputs, adjustments
- the schema and the seed, and that run totals reconcile with their payslips
- authentication: valid and invalid sign-in, the generic error, rate
  limiting, expired and invalid sessions, sign-out
- authorisation: each role against each protected endpoint, including an
  employee reaching for another employee's payslip
- employees: list, search, pagination, create, validation, duplicate email,
  unknown department, update, compensation versioning, archiving
- payroll: create, calculate, approve, finalise, duplicate rejection,
  finalising twice, recalculating a finalized run, snapshot stability after a
  compensation change, reversal keeping its payslips
- reports: reconciling with the stored records, CSV export, export permissions
- audit: that important actions are recorded and that no credential is ever
  written to it
- the response envelope: every collection endpoint must answer with a plain
  JSON list, and every single-record endpoint with the record itself

There is no PHPUnit dependency: the harness is `src/Core/TestRunner.php`.

### Running the suite against MySQL

```bash
# a throwaway database — the suite replaces its contents
PAYLENS_TEST_DB=mysql \
DB_HOST=127.0.0.1 DB_PORT=3306 \
DB_TEST_DATABASE=paylens_test \
DB_USERNAME=root DB_PASSWORD=secret \
php backend/tests/run.php
```

`DB_TEST_DATABASE` defaults to `paylens_test`. The suite creates the schema
and loads the fictional dataset, so never point it at a database you care
about.

### The MySQL dialect without a server

The MySQL branch is also asserted statically, so the dialect is covered even
where no MySQL server is available: the suite renders every migration's MySQL
DDL and checks that it contains no SQLite-only syntax, that it uses MySQL's
auto-increment and inline indexes, that every foreign key points at a table
the migrations create, that indexed columns fit InnoDB's 3072-byte key limit
under utf8mb4, and that the upsert statement uses `ON DUPLICATE KEY UPDATE`.

To exercise it live, any MySQL-protocol server works — MariaDB 10.11 is a
drop-in for the parts this backend uses:

```bash
# 1. fetch and unpack a server
#    https://archive.mariadb.org/mariadb-10.11.10/winx64-packages/mariadb-10.11.10-winx64.zip
# 2. initialise a data directory and start it on a spare port
#    (mariadb-install-db.exe --datadir=... --port=3307, then mariadbd.exe)
# 3. point the app at it and migrate
DB_DRIVER=mysql DB_HOST=127.0.0.1 DB_PORT=3306 \
DB_DATABASE=paylens DB_USERNAME=root DB_PASSWORD=secret \
php backend/bin/migrate.php
# 4. run the suite against it (see above)
```

---

## Configuration reference

| Variable | Default | Purpose |
|---|---|---|
| `APP_ENV` | `development` | `production` disables the demo endpoints |
| `APP_DEBUG` | `false` | Adds the exception message to error responses |
| `APP_DEMO_MODE` | `true` | Enables the demo role switcher endpoints |
| `DB_DRIVER` | `mysql` | `mysql` or `sqlite` |
| `DB_HOST` / `DB_PORT` / `DB_DATABASE` / `DB_USERNAME` / `DB_PASSWORD` | — | MySQL connection |
| `SESSION_ABSOLUTE_SECONDS` | `43200` | Maximum session lifetime |
| `SESSION_IDLE_SECONDS` | `1800` | Idle timeout |
| `SESSION_COOKIE_SECURE` | `false` | Set to `true` behind HTTPS |
| `LOGIN_MAX_ATTEMPTS` / `LOGIN_WINDOW_SECONDS` / `LOGIN_LOCKOUT_SECONDS` | `5` / `300` / `900` | Sign-in throttling |
| `PASSWORD_MIN_LENGTH` | `12` | Minimum password length |
| `CORS_ORIGINS` | *(empty)* | Comma-separated allowed origins; empty means same-origin only |
| `PAYROLL_DEFAULT_WORKING_DAYS` | `22` | Used when attendance is not recorded |
| `PAYLENS_SEED_PASSWORD` | `PayLens#Demo2026` | Password for the seeded accounts |

---

## Troubleshooting

**"Database connection failed."** The server cannot reach the database. Check
`DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME` and `DB_PASSWORD`. The
message is deliberately generic so credentials never leak.

**"Class not found"** — the autoloader is not registered. Every entry point
must `require` `backend/bootstrap.php`.

**Port 8080 in use** — set `PAYLENS_API_URL` for the Vite proxy and run the
PHP server on another port, or change `server.port` in `vite.config.ts`.

**Signed in but every request returns 401** — the session cookie was not
stored. Check that the frontend and the API are on the same origin (use the
Vite proxy) and that `SESSION_COOKIE_SECURE` is `false` for plain HTTP.

**"Those credentials do not match our records."** — the account does not
exist or the password is wrong. The message is the same for both, on purpose.
Use `bin/create-admin.php` to (re)set a known administrator.

**A migration fails on SQLite** — the schema builder supports both dialects,
so a failure usually means a migration was hand-edited. `bin/migrate.php`
records what it applied; delete the offending row from `migrations` and
re-run.

---

## Production checklist

- [ ] `APP_ENV=production`, `APP_DEBUG=false`, `APP_DEMO_MODE=false`
- [ ] `SESSION_COOKIE_SECURE=true` and the app served over HTTPS
- [ ] `DB_PASSWORD` set from the environment, not from a tracked file
- [ ] The database user has only the privileges the app needs
- [ ] `PAYLENS_SEED_PASSWORD` changed (or the seed never run in production)
- [ ] `CORS_ORIGINS` left empty unless cross-origin access is required
- [ ] The web server routes `/api` to `backend/public/api/index.php` and serves
      the built frontend for everything else
- [ ] `backend/.env` is not committed and is readable only by the service user
- [ ] The payroll rules have been replaced with verified, jurisdiction-tagged
      values — or statutory deductions left unconfigured
- [ ] Backups and log rotation configured

---

## Known limitations

- The seeded payroll rules are demo defaults, not statutory rates. Nothing
  here should be presented as a tax computation.
- There is no email delivery: password resets and notifications are not sent.
  The "forgot password" control on the sign-in form is inert.
- Billing is read-only: the plan, seats and invoices are stored, but there is
  no payment provider integration.
- CSV export supports the report templates listed above; there is no XLSX
  writer (the frontend's "xlsx" option downloads JSON).
- Document uploads are not implemented — documents are records with metadata,
  not files.
- The audit trail is append-only from the application, but the database user
  can still modify it directly.
