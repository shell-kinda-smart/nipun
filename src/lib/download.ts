/**
 * Browser file download utilities. The data layer is local (no backend),
 * so we synthesise files in-memory and trigger a download via blob URL.
 */

function escapeCsvCell(value: unknown): string {
  const s = value == null ? '' : String(value)
  // Quote any cell that contains a comma, quote, or newline; double-up inner quotes.
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(rows: ReadonlyArray<ReadonlyArray<unknown>>): string {
  return rows.map((row) => row.map(escapeCsvCell).join(',')).join('\n')
}

export function downloadBlob(filename: string, mime: string, content: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Defer revoke so Safari has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function downloadCsv(filename: string, rows: ReadonlyArray<ReadonlyArray<unknown>>): void {
  downloadBlob(filename, 'text/csv;charset=utf-8;', toCsv(rows))
}

export function downloadJson(filename: string, data: unknown): void {
  downloadBlob(filename, 'application/json;charset=utf-8;', JSON.stringify(data, null, 2))
}

export function downloadText(filename: string, content: string): void {
  downloadBlob(filename, 'text/plain;charset=utf-8;', content)
}