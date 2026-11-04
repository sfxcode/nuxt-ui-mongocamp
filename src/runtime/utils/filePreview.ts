export type PreviewKind = 'image' | 'json' | 'csv' | 'text' | 'pdf' | 'other'

/** Largest file loaded for an in-page preview, per kind (bytes). Larger files only offer metadata + download. */
export const PREVIEW_LIMITS: Record<Exclude<PreviewKind, 'other'>, number> = {
  image: 10 * 1024 * 1024,
  pdf: 20 * 1024 * 1024,
  json: 1024 * 1024,
  csv: 1024 * 1024,
  text: 1024 * 1024,
}

/** Characters of text shown at most (a 1 MB file is still cut so the page stays responsive). */
export const MAX_PREVIEW_CHARS = 200_000

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'ico'])
const TEXT_EXT = new Set(['txt', 'md', 'log', 'xml', 'yaml', 'yml', 'html', 'css', 'js', 'ts', 'ini', 'toml', 'sql', 'sh', 'conf', 'properties'])

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot < 0 ? '' : filename.slice(dot + 1).toLowerCase()
}

/**
 * What a file is, from its name first (the server stores no content type) and the blob's own type second.
 * SVG is deliberately `other`: it can carry script, so it is never rendered inline.
 */
export function previewKind(filename: string, blobType = ''): PreviewKind {
  const ext = extensionOf(filename)
  const type = blobType.split(';')[0]!.trim().toLowerCase()
  if (ext === 'svg' || type === 'image/svg+xml') return 'other'
  if (IMAGE_EXT.has(ext) || (type.startsWith('image/') && !ext)) return 'image'
  if (ext === 'pdf' || (type === 'application/pdf' && !ext)) return 'pdf'
  if (ext === 'json' || ext === 'ndjson' || (type === 'application/json' && !ext)) return 'json'
  if (ext === 'csv' || ext === 'tsv' || (type === 'text/csv' && !ext)) return 'csv'
  if (TEXT_EXT.has(ext) || (type.startsWith('text/') && !ext)) return 'text'
  return 'other'
}

/** Whether a file of this kind and size may be loaded for preview. */
export function canPreview(kind: PreviewKind, length: number): boolean {
  if (kind === 'other') return false
  return length <= PREVIEW_LIMITS[kind]
}

/** Pretty-prints JSON text; anything that is not valid JSON (e.g. NDJSON) comes back unchanged. */
export function prettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  }
  catch {
    return text
  }
}

export function clipText(text: string, max = MAX_PREVIEW_CHARS): { text: string, clipped: boolean } {
  return text.length > max ? { text: text.slice(0, max), clipped: true } : { text, clipped: false }
}

export type MetadataParse = { ok: true, value: Record<string, unknown> } | { ok: false, reason: 'invalid-json' | 'not-object' }

/** Validates the metadata editor's text: must be one JSON object (empty text = no metadata). */
export function parseMetadataJson(text: string): MetadataParse {
  if (!text.trim()) return { ok: true, value: {} }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  }
  catch {
    return { ok: false, reason: 'invalid-json' }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return { ok: false, reason: 'not-object' }
  return { ok: true, value: parsed as Record<string, unknown> }
}
