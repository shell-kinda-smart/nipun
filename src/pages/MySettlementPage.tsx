import { Wallet } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { usePageMeta } from '@/lib/usePageMeta'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useApi } from '@/hooks/useApi'
import { formatINR } from '@/lib/format'
import type { MyTermination } from '@/data'

export function MySettlementPage() {
  usePageMeta('My final settlement · PayLens', 'The full breakdown of your final settlement.')
  const { data, loading, error, reload } = useApi<MyTermination>('/api/me/termination')
  const settlement = data?.settlement ?? null

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="My account" title="My final settlement" />
        <Card className="p-8 text-center">
          <p className="text-sm text-muted-foreground">{error.message}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={reload}>Try again</Button>
        </Card>
      </div>
    )
  }

  if (!settlement) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="My account"
          title="My final settlement"
          description="The breakdown of your final settlement appears here once it has been prepared."
        />
        <Card className="p-10 text-center">
          <Wallet className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            There is no final settlement to show yet.
          </p>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="My account"
        title="My final settlement"
        description="Every component of the amount, and where it came from."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-muted-foreground" />
            Settlement statement
            <Badge variant={settlement.status === 'finalized' ? 'success' : 'secondary'}>
              {settlement.status}
            </Badge>
          </CardTitle>
          <CardDescription>
            {settlement.items.length} components
            {settlement.finalizedAt ? ` · finalised ${settlement.finalizedAt}` : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full">
              <tbody>
                {settlement.items.map((item) => (
                  <tr key={item.id} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-3">
                      <div className="text-sm">{item.label}</div>
                      {item.note && (
                        <div className="text-[11px] text-muted-foreground">{item.note}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-sm">
                      {item.kind === 'earning' ? '+' : '−'}
                      {formatINR(item.amount)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-border bg-accent/30">
                  <td className="px-4 py-3 text-sm font-semibold">Net payable</td>
                  <td className="px-4 py-3 text-right font-mono text-base font-semibold">
                    {formatINR(settlement.netPayable)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
