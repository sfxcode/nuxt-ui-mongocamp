// Turns the server's configuration list into rows for the read-only settings viewer. Checked against a real
// MongoCamp 1.5.10: the generated client types `value` as a number, but real values are numbers, booleans,
// strings, lists, null (an unset list) and Option values wrapped as `{ value }` — and the list holds real
// secrets (`AUTH_SECRET`, `CONNECTION_PASSWORD`, `CONNECTION_USERNAME`, the database host).
//
// Masking happens here, while the rows are built: a secret is replaced by `MASKED_VALUE` and the original is
// never copied into a row, so it cannot reach component state, the DOM, a search box or a copy/paste. There
// is no way to reveal it.

export const MASKED_VALUE = '••••••••'
const EMPTY_VALUE = '—'

export interface ConfigRow {
  key: string
  // what is shown: the formatted value, or `MASKED_VALUE`
  value: string
  masked: boolean
  configType: string
  needsRestart: boolean
  comment: string
}

// Credentials and internal addresses. `AUTH_APIKEYLENGTH` is only a number and stays visible.
const SECRET_KEY = /pass(?:word)?|secret|token|api[_-]?key(?!length)|credential|private|username|host/i

export function isSecretConfigKey(key: string): boolean {
  return SECRET_KEY.test(key)
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// `Option[String]` arrives as `{ value: ... }`
function unwrapOption(value: unknown): unknown {
  return isPlainRecord(value) && Object.keys(value).length === 1 && 'value' in value ? value.value : value
}

function hasContent(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value !== ''
  if (Array.isArray(value)) return value.length > 0
  return true
}

function formatScalar(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value) ?? EMPTY_VALUE
  }
  catch {
    return '[unreadable value]'
  }
}

function formatValue(raw: unknown): string {
  const value = unwrapOption(raw)
  if (!hasContent(value)) return EMPTY_VALUE
  return Array.isArray(value) ? value.map(formatScalar).join(', ') : formatScalar(value)
}

// A switch or a size is not a secret even when its key mentions one (`AUTH_TOKEN` is a boolean).
function isMaskable(raw: unknown): boolean {
  const value = unwrapOption(raw)
  return hasContent(value) && typeof value !== 'boolean' && typeof value !== 'number'
}

export function buildConfigRows(configurations: unknown): ConfigRow[] {
  if (!Array.isArray(configurations)) return []
  const rows: ConfigRow[] = []
  for (const item of configurations) {
    if (!isPlainRecord(item) || typeof item.key !== 'string' || item.key === '') continue
    const masked = isSecretConfigKey(item.key) && isMaskable(item.value)
    rows.push({
      key: item.key,
      value: masked ? MASKED_VALUE : formatValue(item.value),
      masked,
      configType: typeof item.configType === 'string' ? item.configType : '',
      needsRestart: item.needsRestartForActivation === true,
      comment: typeof item.comment === 'string' ? item.comment : '',
    })
  }
  return rows.sort((a, b) => a.key.localeCompare(b.key))
}
