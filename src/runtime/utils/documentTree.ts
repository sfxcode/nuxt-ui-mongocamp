// The tree shown by MongocampDocumentView: a document as nested nodes with a type per node, the text to show for a
// leaf, and which nodes are open. Pure. Types and paths come from documentPaths, so the tree, the flat list and the
// compare view agree on both.
import { joinPath, typeOf } from './documentPaths'
import type { PathValueType } from './documentPaths'

export interface TreeNode {
  /** The key (an array index for an array element). */
  key: string
  /** Dotted path, as `getPath` reads it. */
  path: string
  depth: number
  type: PathValueType
  value: unknown
  /** `null` for a leaf (a scalar, a wrapper, or an empty container shown as `[]` / `{}`). */
  children: TreeNode[] | null
}

export interface DocumentTree {
  nodes: TreeNode[]
  /** Nodes built (leaves and containers). */
  total: number
  /** The document was larger than `maxNodes`; the rest is not in the tree. */
  truncated: boolean
}

export const DEFAULT_MAX_NODES = 5000
export const MAX_TREE_DEPTH = 32
/** More nodes than this start fully collapsed; fewer open the first two levels. */
export const COLLAPSE_ABOVE_NODES = 200
export const AUTO_EXPAND_DEPTH = 2

function entriesOf(value: unknown): Array<[string, unknown]> {
  if (Array.isArray(value)) return value.map((v, i) => [String(i), v])
  return Object.entries(value as Record<string, unknown>)
}

export function buildDocumentTree(doc: unknown, options: { maxNodes?: number } = {}): DocumentTree {
  const maxNodes = options.maxNodes ?? DEFAULT_MAX_NODES
  let total = 0
  let truncated = false

  const build = (key: string, value: unknown, segments: string[], depth: number): TreeNode | undefined => {
    if (total >= maxNodes) {
      truncated = true
      return undefined
    }
    total++
    const type = typeOf(value)
    const node: TreeNode = { key, path: joinPath(segments), depth, type, value, children: null }
    const container = (type === 'object' || type === 'array') && depth < MAX_TREE_DEPTH
    const entries = container ? entriesOf(value) : []
    if (entries.length === 0) return node
    node.children = []
    for (const [childKey, child] of entries) {
      const built = build(childKey, child, [...segments, childKey], depth + 1)
      if (built) node.children.push(built)
    }
    return node
  }

  const top: TreeNode[] = []
  const root = typeOf(doc) === 'object' ? entriesOf(doc) : [['', doc] as [string, unknown]]
  for (const [key, value] of root) {
    const node = build(key, value, [key], 0)
    if (node) top.push(node)
  }
  return { nodes: top, total, truncated }
}

/** Paths of the containers that start open: depth 0 and 1 for a small document, none for a large one. */
export function defaultExpanded(tree: DocumentTree): Set<string> {
  const open = new Set<string>()
  if (tree.total > COLLAPSE_ABOVE_NODES) return open
  const walk = (nodes: TreeNode[]) => {
    for (const node of nodes) {
      if (node.children && node.depth < AUTO_EXPAND_DEPTH - 1) {
        open.add(node.path)
        walk(node.children)
      }
    }
  }
  walk(tree.nodes)
  return open
}

export function allContainerPaths(tree: DocumentTree): Set<string> {
  const open = new Set<string>()
  const walk = (nodes: TreeNode[]) => {
    for (const node of nodes) {
      if (node.children) {
        open.add(node.path)
        walk(node.children)
      }
    }
  }
  walk(tree.nodes)
  return open
}

/** The nodes to draw, in order: a node's children follow it only while its path is in `expanded`. */
export function visibleNodes(tree: DocumentTree, expanded: ReadonlySet<string>): TreeNode[] {
  const out: TreeNode[] = []
  const walk = (nodes: TreeNode[]) => {
    for (const node of nodes) {
      out.push(node)
      if (node.children && expanded.has(node.path)) walk(node.children)
    }
  }
  walk(tree.nodes)
  return out
}

/**
 * The text for a node. A wrapper shows its content (`{ $oid }` → the id, `{ $numberLong }` → every digit), a container
 * its size (`[3]`, `{2}`), an empty one `[]` / `{}`. `title` is a longer form where there is one (a date, localised).
 */
export function nodeDisplay(node: TreeNode): { text: string, title?: string } {
  const { value, type } = node
  if (type === 'null') return { text: 'null' }
  if (type === 'array') return { text: `[${(value as unknown[]).length}]` }
  if (type === 'object') return { text: `{${Object.keys(value as object).length}}` }
  if (type === 'date') {
    const raw = value instanceof Date ? value.toISOString() : (value as { $date?: unknown }).$date
    const text = typeof raw === 'string' ? raw : JSON.stringify(raw)
    const parsed = typeof raw === 'string' ? new Date(raw) : undefined
    return parsed && !Number.isNaN(parsed.getTime()) ? { text, title: parsed.toLocaleString() } : { text }
  }
  if (typeof value === 'object' && value !== null) {
    const inner = Object.values(value as Record<string, unknown>)[0]
    return { text: typeof inner === 'string' ? inner : JSON.stringify(inner) }
  }
  return { text: String(value) }
}
