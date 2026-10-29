import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Wallet, ChevronRight } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { usePageMeta } from '@/lib/usePageMeta'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useApi } from '@/hooks/useApi'
import { formatINR } from '@/lib/format'
import type { Settlement } from '@/data'

export function SettlementsPage() {
  usePageMeta('Final settlements · PayLens', 'What each departing employee is owed, and what has been approved.')
  const listQuery = useApi<Settlement[]>('/api/settlements')
  const settlements = useMemo(() => listQuery.data ?? [], [listQuery.data])

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Decisions"
        title="Final settlements"
        description="A settlement is prepared after the notice is acknowledged, and approved before it is finalised."
      />

      <Card>
        <CardHeader>
          <CardTitle>Settlements</CardTitle>
          <CardDescription>{settlements.length} records</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">Employee</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Payable</th>
                  <th className="px-4 py-3 text-right font-semibold">Recoverable</th>
                  <th className="px-4 py-3 text-right font-semibold">Net</th>
                  <th className="px-4 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {listQuery.loading && settlements.length === 0 ? (
                  Array.from({ length: 4 }).map((_, r) => (
                    <tr key={r} className="border-b border-border/50">
                      {Array.from({ length: 6 }).map((__, c) => (
                        <td key={c} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                      ))}
                    </tr>
                  ))
                ) : listQuery.error ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <p className="text-sm text-muted-foreground">{listQuery.error.message}</p>
                        <Button variant="outline" size="sm" onClick={listQuery.reload}>Try again</Button>
                      </div>
                    </td>
                  </tr>
                ) : settlements.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">
                      No final settlement has been prepared yet.
                    </td>
                  </tr>
                ) : (
                  settlements.map((settlement) => (
                    <tr key={settlement.id} className="border-b border-border/50 transition-colors hover:bg-accent/40">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
                            <Wallet className="h-4 w-4" />
                          </span>
                          <span>
                            <span className="block font-medium">{settlement.employeeName ?? settlement.employeeId}</span>
                            <span className="block font-mono text-xs text-muted-foreground">{settlement.id}</span>
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={settlement.status === 'finalized' ? 'success' : 'secondary'}>
                          {settlement.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm">
                        {formatINR(settlement.totalPayable)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm text-muted-foreground">
                        {settlement.totalRecoverable > 0 ? formatINR(settlement.totalRecoverable) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm font-semibold">
                        {formatINR(settlement.netPayable)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          to={`/terminations/${settlement.terminationRequestId}`}
                          className="inline-flex text-muted-foreground hover:text-foreground"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
