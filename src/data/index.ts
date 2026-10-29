/**
 * The domain model and the static configuration that goes with it.
 *
 * The records themselves — employees, compensation, payroll runs, payslips,
 * anomalies, documents, notifications and the audit trail — live in the
 * database and are read through the API (see `src/lib/api.ts`). Only the
 * shapes and the static tables stay here, so the frontend and the backend
 * cannot drift apart.
 */
export * from './types'
export * from './constants'
