// Pure helpers for MongocampServerInfo (`GET /system/stats`, `/system/capabilities`, server 1.9.0).

/** `3d 4h`, `5h 12m`, `7m 3s`, `42s` — the two biggest non-zero units; `-` for nothing/unknown. */
export function formatUptime(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '-'
  const total = Math.floor(seconds)
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  const parts = [[days, 'd'], [hours, 'h'], [minutes, 'm'], [secs, 's']] as const
  const shown = parts.filter(([value]) => value > 0).slice(0, 2).map(([value, unit]) => `${value}${unit}`)
  return shown.length ? shown.join(' ') : '0s'
}

/** Thousands separators without a locale dependency (the counters run into the millions). */
export function formatCount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '-'
  return Math.trunc(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

/** Share of connections in use, 0–100 (`current` against `current + available`); `null` if nothing is known. */
export function connectionUsage(current: number | null | undefined, available: number | null | undefined): number | null {
  if (current == null || available == null) return null
  const total = current + available
  return total > 0 ? Math.round((current / total) * 100) : null
}

export const OP_COUNTER_KEYS = ['insert', 'query', 'update', 'delete', 'getmore', 'command'] as const
export type OpCounterKey = typeof OP_COUNTER_KEYS[number]
