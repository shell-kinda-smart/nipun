import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Search, Plus, Download, MoreHorizontal, ChevronRight, Users2, ArrowUpDown,
} from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { usePageMeta } from '@/lib/usePageMeta'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { EmployeeFormDialog } from '@/components/employees/EmployeeFormDialog'
import { useApi } from '@/hooks/useApi'
import { apiDownload, buildQuery } from '@/lib/api'
import { useHasPermission } from '@/store/auth'
import { formatINR, initials } from '@/lib/format'
import type { Department, Employee, EmployeeStatus } from '@/data'

const STATUS_VARIANT: Record<EmployeeStatus, 'success' | 'warning' | 'info' | 'secondary'> = {
  active: 'success',
  on_leave: 'warning',
  probation: 'info',
  exited: 'secondary',
}

const ROWS_PER_PAGE = 25
const SEARCH_DEBOUNCE_MS = 300

export function EmployeesPage() {
  usePageMeta('Employees · PayLens', 'Browse, search and filter the workforce directory.')
  const [search, setSearch] = useState('')
  const [dept, setDept] = useState<string>('all')
  const [status, setStatus] = useState<string>('all')
  const [sort, setSort] = useState<'name' | 'salary' | 'joined'>('name')
  const [page, setPage] = useState(0)
  const [creating, setCreating] = useState(false)

  // Adding an employee writes to the directory, so it is only offered to
  // the accounts that may do it.
  const canWrite = useHasPermission('employees:write')

  // The search box filters on the server, so its value is debounced before it
  // becomes a query parameter.
  const [query, setQuery] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [search])

  const departmentsQuery = useApi<Department[]>('/api/departments')
  const listQuery = useApi<Employee[]>('/api/employees', {
    q: query || undefined,
    department: dept === 'all' ? undefined : dept,
    status: status === 'all' ? undefined : status,
    sort,
    page: page + 1,
    perPage: ROWS_PER_PAGE,
  })
  // A single-row probe of the same endpoint gives the unfiltered headcount.
  const countQuery = useApi<Employee[]>('/api/employees', { perPage: 1 })

  const departments = useMemo(() => departmentsQuery.data ?? [], [departmentsQuery.data])
  const departmentById = useMemo(
    () => new Map(departments.map((d) => [d.id, d])),
    [departments],
  )

  const rows = listQuery.data ?? []
  const total = typeof listQuery.meta?.total === 'number' ? listQuery.meta.total : rows.length
  const headcount =
    typeof countQuery.meta?.total === 'number' ? countQuery.meta.total : total
  const start = page * ROWS_PER_PAGE

  // A filter change can leave the pager past the last page — step back.
  useEffect(() => {
    if (listQuery.loading) return
    const lastPage = Math.max(0, Math.ceil(total / ROWS_PER_PAGE) - 1)
    if (page > lastPage) setPage(lastPage)
  }, [listQuery.loading, total, page])

  const exportCsv = async () => {
    try {
      await apiDownload(
        `/api/employees/export.csv${buildQuery({
          q: query || undefined,
          department: dept === 'all' ? undefined : dept,
          status: status === 'all' ? undefined : status,
        })}`,
        `paylens-employees-${new Date().toISOString().slice(0, 10)}.csv`,
      )
      toast.success('Employee directory exported')
    } catch {
      toast.error('The employee directory could not be exported')
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Workforce"
        title="Employees"
        description={`${total} of ${headcount} employees matching your filters`}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
            <Button size="sm" onClick={() => setCreating(true)} disabled={!canWrite}>
              <Plus className="h-4 w-4" />
              Add employee
            </Button>
          </>
        }
      />

      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name, ID or designation…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(0)
              }}
              className="pl-9"
            />
          </div>
          <Select value={dept} onValueChange={(v) => { setDept(v); setPage(0) }}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Department" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(0) }}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="on_leave">On leave</SelectItem>
              <SelectItem value="probation">Probation</SelectItem>
              <SelectItem value="exited">Exited</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
            <SelectTrigger className="w-36">
              <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Name (A→Z)</SelectItem>
              <SelectItem value="salary">Salary (high→low)</SelectItem>
              <SelectItem value="joined">Joined (newest)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 font-semibold">Employee</th>
                <th className="px-4 py-3 font-semibold">Department</th>
                <th className="px-4 py-3 font-semibold">Designation</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Monthly gross</th>
                <th className="px-4 py-3 text-center font-semibold">Rating</th>
                <th className="px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {listQuery.loading && rows.length === 0 ? (
                Array.from({ length: 6 }).map((_, r) => (
                  <tr key={r} className="border-b border-border/50">
                    {Array.from({ length: 7 }).map((__, c) => (
                      <td key={c} className="px-4 py-3">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : listQuery.error ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <p className="text-sm text-muted-foreground">
                        {listQuery.error.message}
                      </p>
                      <Button variant="outline" size="sm" onClick={listQuery.reload}>
                        Try again
                      </Button>
                    </div>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    No employees match your filters.
                  </td>
                </tr>
              ) : (
                rows.map((e) => {
                  const d = departmentById.get(e.departmentId)
                  return (
                    <tr
                      key={e.id}
                      className="border-b border-border/50 transition-colors hover:bg-accent/40"
                    >
                      <td className="px-4 py-3">
                        <Link to={`/employees/${e.id}`} className="flex items-center gap-3">
                          <Avatar className="h-9 w-9">
                            <AvatarImage src={`https://api.dicebear.com/9.x/initials/svg?seed=${e.avatarSeed}`} />
                            <AvatarFallback>{initials(e.name)}</AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium">{e.name}</div>
                            <div className="font-mono text-xs text-muted-foreground">{e.id}</div>
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d?.color }} />
                          <span className="text-sm">{d?.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm">{e.designation}</td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={STATUS_VARIANT[e.status]}
                          className="capitalize text-[10px]"
                        >
                          {e.status.replace('_', ' ')}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm">
                        {formatINR(e.monthlyGross)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {e.performanceRating ? (
                          <span className="font-mono text-sm">★ {e.performanceRating}.0</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                          <Link to={`/employees/${e.id}`}>
                            <ChevronRight className="h-4 w-4" />
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-muted-foreground">
          <span>
            Showing {total === 0 ? 0 : start + 1}–{Math.min(start + ROWS_PER_PAGE, total)} of {total}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={start + ROWS_PER_PAGE >= total}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </Card>

      <EmployeeFormDialog
        open={creating}
        onOpenChange={setCreating}
        departments={departments}
        onSaved={() => {
          listQuery.reload()
          countQuery.reload()
        }}
      />
    </div>
  )
}
