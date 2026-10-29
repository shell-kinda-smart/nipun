import { useState } from 'react'
import { toast } from 'sonner'
import { FileText, Printer, Download, ShieldCheck, Check } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { usePageMeta } from '@/lib/usePageMeta'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useApi } from '@/hooks/useApi'
import { apiSend } from '@/lib/api'
import type { MyTermination } from '@/data'

export function MyTerminationPage() {
  usePageMeta('My documents · PayLens', 'Official employment documents issued to you.')
  const { data, loading, error, reload } = useApi<MyTermination>('/api/me/termination')
  const [busy, setBusy] = useState(false)

  const acknowledge = async () => {
    if (!data?.notice) return
    setBusy(true)
    try {
      await apiSend('POST', '/api/me/termination/acknowledge', { letterId: data.notice.id })
      toast.success('Receipt acknowledged')
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'The acknowledgement could not be recorded.')
    } finally {
      setBusy(false)
    }
  }

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
        <PageHeader eyebrow="My account" title="My documents" />
        <Card className="p-8 text-center">
          <p className="text-sm text-muted-foreground">{error.message}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={reload}>Try again</Button>
        </Card>
      </div>
    )
  }

  if (!data?.notice) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="My account"
          title="My documents"
          description="Official employment documents issued to you appear here."
        />
        <Card className="p-10 text-center">
          <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            There is no document waiting for you at the moment.
          </p>
        </Card>
      </div>
    )
  }

  const acknowledged = data.acknowledgedAt !== null

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="My account"
        title="My documents"
        description="Official employment documents issued to you. They stay here until you acknowledge them."
      />

      {!acknowledged && (
        <div className="flex items-start gap-3 rounded-lg border border-warning/50 bg-warning/5 p-4">
          <FileText className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          <div>
            <div className="text-sm font-medium">An official document is ready for you</div>
            <div className="mt-0.5 text-sm text-muted-foreground">
              Reference {data.notice.reference}. Read it below, then acknowledge that you have received it.
            </div>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Employment termination notice
            <Badge variant={acknowledged ? 'success' : 'warning'}>
              {acknowledged ? 'Acknowledged' : 'Awaiting acknowledgement'}
            </Badge>
          </CardTitle>
          <CardDescription>
            Reference {data.notice.reference} · version {data.notice.version}
            {data.notice.issuedAt ? ` · issued ${data.notice.issuedAt}` : ''}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className="overflow-hidden rounded-lg border border-border bg-background"
            dangerouslySetInnerHTML={{ __html: data.notice.contentHtml }}
          />

          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="h-4 w-4" />
              Print
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const blob = new Blob([data.notice!.contentHtml], { type: 'text/html' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `${data.notice!.reference}.html`
                a.click()
                URL.revokeObjectURL(url)
              }}
            >
              <Download className="h-4 w-4" />
              Download
            </Button>

            {acknowledged ? (
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="h-4 w-4 text-success" />
                You acknowledged receipt on {data.acknowledgedAt}. This confirms receipt only.
              </span>
            ) : (
              <Button size="sm" disabled={busy} onClick={acknowledge}>
                <Check className="h-4 w-4" />
                {data.acknowledgementWording}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
