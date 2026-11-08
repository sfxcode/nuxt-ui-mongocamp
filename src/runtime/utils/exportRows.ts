// Plain helpers for exporting rows the table already has in memory: no API calls, so they work
// the same in session and server-proxy mode.

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  // a BigInt (an exact integer beyond 2^53) has no JSON form of its own: inside an object or array it is written as text
  const text = typeof value === 'object' ? JSON.stringify(value, (_key, inner) => (typeof inner === 'bigint' ? inner.toString() : inner)) : String(value)
  // RFC 4180: quote when the cell holds a delimiter, quote or line break, doubling inner quotes
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function rowsToCsv(rows: Record<string, unknown>[], keys: string[]): string {
  const lines = [keys.map(csvCell).join(',')]
  for (const row of rows) lines.push(keys.map(key => csvCell(row[key])).join(','))
  return lines.join('\r\n')
}

/** Hands a Blob to the browser as a download. */
export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function downloadTextFile(filename: string, content: string, mimeType: string) {
  downloadBlob(filename, new Blob([content], { type: `${mimeType};charset=utf-8` }))
}
