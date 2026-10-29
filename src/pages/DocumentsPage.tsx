import { useMemo, useState } from 'react'
import { FileText, Search, Upload, AlertCircle, CalendarClock, CheckCircle2 } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { usePageMeta } from '@/lib/usePageMeta'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Pagination } from '@/components/shared/Pagination'
import { useApi } from '@/hooks/useApi'
import { formatShortDate, initials } from '@/lib/format'

const DOC_TYPES = ['Offer letter', 'PAN card', 'Aadhaar', 'Contract', 'Payslip', 'Tax statement', 'ID proof']

type DocStatus = 'verified' | 'pending' | 'expired' | 'expiring'

/** A document as the API returns it, with the employee it belongs to. */
interface ApiDocument {
  id: string
  employeeId: string
  name: string
  type: string
  status: string
  issuedAt: string | null
  expiresAt: string | null
  sizeBytes: number
  createdAt: string
  employee?: { id: string; name: string; avatarSeed: string } | null
  departmentName?: string
}

function toStatus(status: string): DocStatus {
  if (status === 'pending' || status === 'expired' || status === 'expiring') return status
  return 'verified'
}

const PAGE_SIZE = 12

export function DocumentsPage() {
  usePageMeta('Documents · PayLens', 'Employee documents with expiry tracking and verification.')
  const documentsQuery = useApi<ApiDocument[]>('/api/documents')
  const [search, setSearch] = useState('')
  const [type, setType] = useState('all')
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(0)

  const all = useMemo(() => documentsQuery.data ?? [], [documentsQuery.data])

  // The catalogue the server knows about, on top of the documented types.
  const typeOptions = useMemo(() => {
    const options = [...DOC_TYPES]
    for (const d of all) {
      if (d.type && !options.includes(d.type)) options.push(d.type)
    }
    return options
  }, [all])

  const filtered = useMemo(() => {
    return all.filter((d) => {
      if (type !== 'all' && d.type !== type) return false
      if (status !== 'all' && d.status !== status) return false
      if (search) {
        const q = search.toLowerCase()
        const name = d.employee?.name?.toLowerCase() ?? ''
        const employeeId = (d.employee?.id ?? d.employeeId).toLowerCase()
        if (!name.includes(q) && !employeeId.includes(q)) return false
      }
      return true
    })
  }, [all, type, status, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const visible = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  const stats = {
    total: all.length,
    pending: all.filter((d) => d.status === 'pending').length,
    expiring: all.filter((d) => d.status === 'expiring').length,
    expired: all.filter((d) => d.status === 'expired').length,
  }
  const employeeCount = useMemo(
    () => new Set(all.map((d) => d.employeeId)).size,
    [all],
  )

  const reset = (next: string, setter: (v: string) => void) => {
    setter(next)
    setPage(0)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Workforce"
        title="Documents"
        description={`${stats.total} documents across ${employeeCount} employees · showing ${visible.length} of ${filtered.length}`}
        actions={
          <Button>
            <Upload className="h-4 w-4" />
            Upload document
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Total documents" value={stats.total} variant="info" icon={<FileText className="h-4 w-4" />} />
        <Tile label="Pending verification" value={stats.pending} variant="warning" icon={<AlertCircle className="h-4 w-4" />} />
        <Tile label="Expiring soon" value={stats.expiring} variant="info" icon={<CalendarClock className="h-4 w-4" />} />
        <Tile label="Verified" value={stats.total - stats.pending - stats.expiring - stats.expired} variant="success" icon={<CheckCircle2 className="h-4 w-4" />} />
      </div>

      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by employee name or ID…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0) }}
              className="pl-9"
            />
          </div>
          <Select value={type} onValueChange={(v) => reset(v, setType)}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {typeOptions.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => reset(v, setStatus)}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="verified">Verified</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="expiring">Expiring</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 font-semibold">Document</th>
                <th className="px-4 py-3 font-semibold">Employee</th>
                <th className="px-4 py-3 font-semibold">Type</th>
                <th className="px-4 py-3 font-semibold">Uploaded</th>
                <th className="px-4 py-3 font-semibold">Expires</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {documentsQuery.loading && all.length === 0 ? (
                Array.from({ length: 6 }).map((_, r) => (
                  <tr key={r} className="border-b border-border/50">
                    {Array.from({ length: 7 }).map((__, c) => (
                      <td key={c} className="px-4 py-3">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : documentsQuery.error ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <p className="text-sm text-muted-foreground">
                        {documentsQuery.error.message}
                      </p>
                      <Button variant="outline" size="sm" onClick={documentsQuery.reload}>
                        Try again
                      </Button>
                    </div>
                  </td>
                </tr>
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    No documents match your filters.
                  </td>
                </tr>
              ) : (
                visible.map((d) => {
                  const emp = d.employee ?? null
                  return (
                    <tr key={d.id} className="border-b border-border/50 transition-colors hover:bg-accent/40">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary-ink">
                            <FileText className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="font-medium">{d.name}</div>
                            <div className="font-mono text-xs text-muted-foreground">{d.id}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-7 w-7">
                            <AvatarImage src={`https://api.dicebear.com/9.x/initials/svg?seed=${emp?.avatarSeed ?? ''}`} />
                            <AvatarFallback className="text-[10px]">{initials(emp?.name ?? '')}</AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="text-sm font-medium">{emp?.name ?? '—'}</div>
                            <div className="text-xs text-muted-foreground">
                              {d.departmentName} · {d.employeeId}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm">{d.type}</td>
                      <td className="px-4 py-3 text-sm">
                        {d.issuedAt ? formatShortDate(d.issuedAt) : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {d.expiresAt ? formatShortDate(d.expiresAt) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={toStatus(d.status)} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="sm">View</Button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <Pagination
            page={safePage}
            totalPages={totalPages}
            totalItems={filtered.length}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        )}
      </Card>
    </div>
  )
}

function Tile({ label, value, variant, icon }: { label: string; value: number; variant: 'success' | 'warning' | 'info'; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card/50 p-3">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="font-mono text-xl font-bold">{value}</span>
        <Badge variant={variant} className="text-[10px]">
          {variant}
        </Badge>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: DocStatus }) {
  if (status === 'verified') return <Badge variant="success" className="text-[10px] capitalize">Verified</Badge>
  if (status === 'pending') return <Badge variant="warning" className="text-[10px] capitalize">Pending</Badge>
  if (status === 'expiring') return <Badge variant="info" className="text-[10px] capitalize">Expiring</Badge>
  return <Badge variant="destructive" className="text-[10px] capitalize">Expired</Badge>
}

// (icons above)
