// Plain helpers for exporting rows the table already has in memory: no API calls, so they work
// the same in session and server-proxy mode.

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
  // RFC 4180: quote when the cell holds a delimiter, quote or line break, doubling inner quotes
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function rowsToCsv(rows: Record<string, unknown>[], keys: string[]): string {
  const lines = [keys.map(csvCell).join(',')]
  for (const row of rows) lines.push(keys.map(key => csvCell(row[key])).join(','))
  return lines.join('\r\n')
}

export function downloadTextFile(filename: string, content: string, mimeType: string) {
  const url = URL.createObjectURL(new Blob([content], { type: `${mimeType};charset=utf-8` }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function useMongocampExport() {
  return { rowsToCsv, downloadTextFile }
}
