import { useMemo, useState } from 'react'
import {
  FileText, Download, Users2, Building2, AlertTriangle, Receipt, TrendingUp, BarChart3,
} from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { usePageMeta } from '@/lib/usePageMeta'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { useApi } from '@/hooks/useApi'
import { formatINR, formatShortDate } from '@/lib/format'
import { downloadCsv, downloadJson, downloadText } from '@/lib/download'
import { cn } from '@/lib/utils'

type Format = 'pdf' | 'csv' | 'xlsx'
type Period = 'current' | 'last' | 'quarter' | 'ytd'

interface ReportTemplate {
  id: string
  title: string
  description: string
  category: string
  icon: typeof FileText
}

/** GET /api/reports/{type} */
interface ReportPayload {
  title: string
  headers: string[]
  rows: (string | number)[][]
}

/** GET /api/reports/tax-center */
interface TaxCenterPayload {
  currentTax: number
  employeeCount: number
}

const REPORTS: ReportTemplate[] = [
  { id: 'monthly_payroll', title: 'Monthly Payroll', description: 'Complete payroll breakdown for a single month', category: 'Payroll', icon: Receipt },
  { id: 'tax_summary', title: 'Tax Summary', description: 'TDS deducted by employee, department and slab', category: 'Tax', icon: FileText },
  { id: 'employee_salary', title: 'Employee Salary Register', description: 'Per-employee salary structure and YTD summary', category: 'Employees', icon: Users2 },
  { id: 'department_cost', title: 'Department Cost', description: 'Spend breakdown by department over time', category: 'Cost', icon: Building2 },
  { id: 'payroll_growth', title: 'Payroll Growth', description: 'Month-over-month growth and headcount trend', category: 'Analytics', icon: TrendingUp },
  { id: 'anomaly_report', title: 'Anomaly Report', description: 'Open and resolved payroll anomalies', category: 'Compliance', icon: AlertTriangle },
  { id: 'ytd_payroll', title: 'Year-to-Date Payroll', description: 'Cumulative payroll and tax for the financial year', category: 'Finance', icon: BarChart3 },
]

const PERIOD_LABELS: Record<Period, string> = {
  current: 'Current month',
  last: 'Last month',
  quarter: 'This quarter',
  ytd: 'Year to date',
}

export function ReportsPage() {
  usePageMeta('Reports · PayLens', 'Generate and export payroll, tax and workforce reports.')
  const [selected, setSelected] = useState<ReportTemplate | null>(null)
  const [period, setPeriod] = useState<Period>('current')
  const [format, setFormat] = useState<Format>('csv')

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Insights"
        title="Reports Center"
        description="7 report templates · preview, filter, generate and download in CSV / JSON / TXT"
        actions={
          <Button>
            <Download className="h-4 w-4" />
            Schedule report
          </Button>
        }
      />

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map((r) => {
          const Icon = r.icon
          return (
            <Card
              key={r.id}
              onClick={() => setSelected(r)}
              className="cursor-pointer p-5 transition-all hover:border-primary/40 hover:shadow-elev"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary-ink">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{r.title}</h3>
                    <Badge variant="secondary" className="text-[10px]">{r.category}</Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{r.description}</p>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                <span>Last generated 2h ago</span>
                <Button variant="ghost" size="sm" className="h-6 text-xs">
                  Open
                  <Download className="h-3 w-3" />
                </Button>
              </div>
            </Card>
          )
        })}
      </div>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent>
          {selected && (
            <ReportSheet
              key={selected.id}
              report={selected}
              period={period}
              setPeriod={setPeriod}
              format={format}
              setFormat={setFormat}
              onClose={() => setSelected(null)}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

function ReportSheet({
  report, period, setPeriod, format, setFormat, onClose,
}: {
  report: ReportTemplate
  period: Period
  setPeriod: (p: Period) => void
  format: Format
  setFormat: (f: Format) => void
  onClose: () => void
}) {
  // The report itself — its headers and rows drive both the preview and the
  // export.
  const { data, loading, error } = useApi<ReportPayload>(`/api/reports/${report.id}`, { period })

  const headers = useMemo(() => data?.headers ?? [], [data])
  const rows = useMemo(
    () => applyPeriodFilter(headers, data?.rows ?? [], period),
    [headers, data, period],
  )

  const download = () => {
    const stamp = formatShortDate(new Date().toISOString())
    const baseName = `paylens-${report.id}-${stamp}`
    const ext = format
    const table: (string | number)[][] = [headers, ...rows]
    if (format === 'csv') {
      downloadCsv(`${baseName}.csv`, table)
    } else if (format === 'xlsx') {
      // No XLSX writer in this offline bundle — fall back to JSON which
      // opens cleanly in Excel and Google Sheets.
      downloadJson(`${baseName}.json`, table)
    } else {
      // pdf — produce a printable plain-text stub so the action isn't a no-op.
      downloadText(`${baseName}.txt`, buildReportText(report, table))
    }
    toast.success('Report generated', {
      description: `${report.title} · ${ext.toUpperCase()} · ${rows.length} rows`,
    })
    onClose()
  }

  return (
    <div className="space-y-5">
      <SheetHeader>
        <Badge variant="secondary" className="w-fit text-[10px]">
          {report.category}
        </Badge>
        <SheetTitle className="text-xl">{report.title}</SheetTitle>
        <SheetDescription>{report.description}</SheetDescription>
      </SheetHeader>

      <Card className="space-y-3 p-4">
        <h4 className="text-sm font-semibold">Filter</h4>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Period</label>
            <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PERIOD_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Format</label>
            <div className="mt-1 flex gap-2">
              {(['csv', 'xlsx', 'pdf'] as const).map((f) => (
                <Button
                  key={f}
                  variant={format === f ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFormat(f)}
                  className={cn('flex-1 font-mono text-xs')}
                >
                  {f.toUpperCase()}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <h4 className="border-b border-border p-3 text-sm font-semibold">Preview</h4>
        <div className="p-4">
          <ReportPreview
            reportId={report.id}
            headers={headers}
            rows={rows}
            loading={loading}
            error={error ? error.message : null}
          />
        </div>
      </Card>

      <Separator />

      <Button onClick={download} className="w-full" size="lg">
        <Download className="h-4 w-4" />
        Generate &amp; download {format.toUpperCase()}
      </Button>
    </div>
  )
}

function ReportPreview({
  reportId, headers, rows, loading, error,
}: {
  reportId: string
  headers: string[]
  rows: (string | number)[][]
  loading: boolean
  error: string | null
}) {
  // The tax summary tiles are driven by the tax centre; it is only fetched
  // when that report is the one being previewed.
  const { data: taxCenter } = useApi<TaxCenterPayload>(
    reportId === 'tax_summary' ? '/api/reports/tax-center' : null,
  )

  if (loading) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Loading preview…</p>
  }
  if (error) {
    return <p className="py-6 text-center text-sm text-destructive">{error}</p>
  }

  switch (reportId) {
    case 'monthly_payroll':
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Gross" value={formatINR(sumColumn(headers, rows, 'Gross'), { compact: true })} />
            <Stat label="Tax" value={formatINR(sumColumn(headers, rows, 'Tax'), { compact: true })} />
            <Stat label="Net" value={formatINR(sumColumn(headers, rows, 'Net'), { compact: true })} />
          </div>
          <TablePreview headers={headers} rows={rows.slice(0, 4)} />
          <p className="text-center text-[10px] text-muted-foreground">
            + {Math.max(0, rows.length - 4)} more rows
          </p>
        </div>
      )
    case 'tax_summary':
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Total TDS" value={formatINR(taxCenter?.currentTax ?? 0, { compact: true })} />
            <Stat
              label="Avg / emp"
              value={formatINR(
                taxCenter && taxCenter.employeeCount > 0
                  ? Math.round(taxCenter.currentTax / taxCenter.employeeCount)
                  : 0,
              )}
            />
          </div>
          <TablePreview headers={headers} rows={rows} />
        </div>
      )
    case 'employee_salary':
      return <TablePreview headers={headers} rows={rows} />
    case 'department_cost':
      return <TablePreview headers={headers} rows={rows} />
    case 'payroll_growth':
      return <TablePreview headers={headers} rows={rows} />
    case 'anomaly_report':
      return <TablePreview headers={headers} rows={rows} />
    case 'ytd_payroll':
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Stat label="YTD gross" value={formatINR(sumColumn(headers, rows, 'Gross', true), { compact: true })} />
            <Stat label="YTD tax" value={formatINR(sumColumn(headers, rows, 'Tax', true), { compact: true })} />
          </div>
          <TablePreview headers={headers} rows={rows} />
        </div>
      )
    default:
      return <p className="text-sm text-muted-foreground">Preview not available.</p>
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Report helpers
// ─────────────────────────────────────────────────────────────────────────────

interface RunPeriod {
  year: number
  month: number
}

/**
 * The backend does not filter by period yet, so the rows are narrowed here,
 * by the period label the report carries (`PR-YYYYMM`).
 *
 * Reports without a period column are point-in-time views and are returned
 * untouched.
 */
function applyPeriodFilter(
  headers: string[],
  rows: (string | number)[][],
  period: Period,
): (string | number)[][] {
  if (period === 'ytd') return rows

  const index = headers.findIndex((h) => h.trim().toLowerCase() === 'period')
  if (index === -1) return rows

  const parsed = rows.map((row) => parseRunPeriod(row[index]))
  const known = parsed.filter((p): p is RunPeriod => p !== null)
  if (known.length === 0) return rows

  const distinct = Array.from(
    new Map(known.map((p) => [`${p.year}-${p.month}`, p])).values(),
  ).sort((a, b) => b.year - a.year || b.month - a.month)

  const latest = distinct[0]
  if (!latest) return rows

  if (period === 'current' || period === 'last') {
    const target = period === 'current' ? latest : distinct[1]
    if (!target) return rows
    return rows.filter((_, i) => {
      const p = parsed[i]
      return p !== null && p.year === target.year && p.month === target.month
    })
  }

  // quarter — the calendar quarter the latest period falls in
  const quarter = Math.floor((latest.month - 1) / 3)
  return rows.filter((_, i) => {
    const p = parsed[i]
    return p !== null && p.year === latest.year && Math.floor((p.month - 1) / 3) === quarter
  })
}

function parseRunPeriod(value: unknown): RunPeriod | null {
  const match = /PR-?(\d{4})(\d{2})/.exec(String(value ?? ''))
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  if (month < 1 || month > 12) return null
  return { year, month }
}

/** Sum a named column of a report, ignoring the trailing total rows. */
function sumColumn(
  headers: string[],
  rows: (string | number)[][],
  label: string,
  skipTotalRows = false,
): number {
  const index = headers.findIndex((h) => h.trim().toLowerCase() === label.toLowerCase())
  if (index === -1) return 0
  let sum = 0
  for (const row of rows) {
    if (skipTotalRows && /total/i.test(String(row[0] ?? ''))) continue
    sum += toNumber(row[index])
  }
  return sum
}

function toNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value ?? '').replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

function buildReportText(report: ReportTemplate, rows: (string | number)[][]): string {
  const lines = [`${report.title}`, `${report.description}`, '']
  for (const row of rows) {
    lines.push(row.map((c) => String(c)).join('  |  '))
  }
  return lines.join('\n')
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card/50 p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-mono text-lg font-bold">{value}</div>
    </div>
  )
}

function TablePreview({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
            {headers.map((h) => (
              <th key={h} className="px-3 py-2 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border/50 last:border-0">
              {row.map((cell, j) => (
                <td
                  key={j}
                  className={cn('px-3 py-2', j > 0 && 'text-right font-mono')}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
