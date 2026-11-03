// A tiny parser for the Lucene expressions that `useMongocampQuery` builds, just enough to negate one correctly.
//
// Why: MongoCamp server 1.6.3 evaluates `-(A AND B)` and `NOT (A AND B)` as `-A AND -B` (wrong), while a single
// negated clause and `-(A OR B)` are fine. `(-A) OR (-B)` — De Morgan, each negated clause in its own
// parentheses — is right (verified live, brain/project/mongocamp-server-1-6-3-caveat-recheck.md), so a negated AND
// group is rewritten instead of sent as it is. That needs to know the structure of the expression, hence this parser.
//
// It understands exactly what the helpers emit: clauses (`f:v`, `-f:v`, `f:(a OR b)`, `f:[a TO b]`), groups in
// parentheses joined by one operator (`AND` or `OR`), and a negated group `-( … )`. Anything else (`NOT …`, a group
// mixing `AND` and `OR` without parentheses, unbalanced parentheses) throws instead of being guessed at.

export type LuceneNode
  = | { kind: 'clause', text: string }
    | { kind: 'and' | 'or', parts: LuceneNode[] }
    | { kind: 'not', node: LuceneNode }

export class UnsupportedExpressionError extends Error {
  constructor(expression: string, reason: string) {
    super(`Cannot negate this expression (${reason}): ${expression}`)
    this.name = 'UnsupportedExpressionError'
  }
}

const OPEN = new Set(['(', '[', '{'])
const CLOSE = new Set([')', ']', '}'])

// Walks the text once, tracking quotes, backslash escapes and bracket depth, and calls `visit` for every character
// that is outside quotes and not escaped. Returning a value from `visit` stops the walk with that value.
function scan<T>(text: string, visit: (char: string, index: number, depth: number) => T | undefined): T | undefined {
  let depth = 0
  let inQuote = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!
    if (char === '\\') {
      i++
      continue
    }
    if (char === '"') {
      inQuote = !inQuote
      continue
    }
    if (inQuote) continue
    if (CLOSE.has(char)) depth--
    const found = visit(char, i, depth)
    if (found !== undefined) return found
    if (OPEN.has(char)) depth++
  }
  return undefined
}

// index of the `)` that closes the `(` at `start`, or -1
function matchingClose(text: string, start: number): number {
  const index = scan<number>(text.slice(start), (char, i, depth) => (char === ')' && depth === 0 ? i : undefined))
  return index === undefined ? -1 : start + index
}

// splits at top-level ` AND ` / ` OR ` (depth 0, outside quotes); returns the parts and the operators seen
function splitTopLevel(text: string): { parts: string[], operators: Set<'AND' | 'OR'> } {
  const parts: string[] = []
  const operators = new Set<'AND' | 'OR'>()
  let last = 0
  scan<never>(text, (char, i, depth) => {
    if (char !== ' ' || depth !== 0) return undefined
    for (const operator of ['AND', 'OR'] as const) {
      const token = ` ${operator} `
      if (text.startsWith(token, i)) {
        parts.push(text.slice(last, i))
        operators.add(operator)
        last = i + token.length
        return undefined
      }
    }
    return undefined
  })
  parts.push(text.slice(last))
  return { parts: parts.map(part => part.trim()), operators }
}

/** `null` for an empty expression; throws {@link UnsupportedExpressionError} for anything it cannot read. */
export function parseLuceneExpression(expression: string): LuceneNode | null {
  const text = expression.trim()
  if (text === '' || text === '()') return null
  return parse(text, expression)
}

function parse(text: string, original: string): LuceneNode {
  if (text.startsWith('NOT ') || text.startsWith('!')) throw new UnsupportedExpressionError(original, 'NOT is not supported')
  if (text.startsWith('-(') && matchingClose(text, 1) === text.length - 1) {
    return { kind: 'not', node: parse(text.slice(2, -1).trim(), original) }
  }
  if (text.startsWith('(')) {
    const close = matchingClose(text, 0)
    if (close === -1) throw new UnsupportedExpressionError(original, 'unbalanced parentheses')
    if (close === text.length - 1) return parse(text.slice(1, -1).trim(), original)
  }
  const { parts, operators } = splitTopLevel(text)
  if (operators.size === 0) return { kind: 'clause', text }
  if (operators.size > 1) throw new UnsupportedExpressionError(original, 'AND and OR mixed without parentheses')
  if (parts.includes('')) throw new UnsupportedExpressionError(original, 'empty operand')
  return { kind: operators.has('AND') ? 'and' : 'or', parts: parts.map(part => parse(part, original)) }
}
