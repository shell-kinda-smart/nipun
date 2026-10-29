import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface PaginationProps {
  page: number
  totalPages: number
  totalItems: number
  pageSize: number
  onPageChange: (page: number) => void
  /** Optional label that appears before the page counter (e.g. "Showing"). */
  showLabel?: boolean
}

export function Pagination({ page, totalPages, totalItems, pageSize, onPageChange, showLabel = true }: PaginationProps) {
  const start = page * pageSize
  const end = Math.min(start + pageSize, totalItems)
  const hasPrev = page > 0
  const hasNext = end < totalItems

  return (
    <div className="flex flex-col gap-2 border-t border-border px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      {showLabel && (
        <span>
          Showing {totalItems === 0 ? 0 : start + 1}–{end} of {totalItems}
        </span>
      )}
      <div className="flex items-center gap-1">
        <span className="hidden font-mono sm:inline">
          Page {page + 1} / {Math.max(1, totalPages)}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={!hasPrev}
          onClick={() => onPageChange(0)}
          aria-label="First page"
        >
          <ChevronsLeft className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={!hasPrev}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Previous</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={!hasNext}
          onClick={() => onPageChange(page + 1)}
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={!hasNext}
          onClick={() => onPageChange(totalPages - 1)}
          aria-label="Last page"
        >
          <ChevronsRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}