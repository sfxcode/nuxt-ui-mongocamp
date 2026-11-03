// MongoCamp sends a 64-bit integer as a bare JSON number with every digit (`"big": 9007199254740993`, verified on server
// 1.6.3 with the raw response text), but the generated client reads a response with `JSON.parse`, which rounds anything
// beyond ±(2^53 − 1) to the nearest double — the table, the edit form and an export would silently show another number.
// This module reads the response text itself and keeps such an integer exact by writing it as the extended-JSON wrapper
// `{ "$numberLong": "<digits>" }`, which `unwrapExtendedJson` turns into a string and `wrapExtendedJson` back into the wrapper.

const MIN_UNSAFE_DIGITS = 16 // 2^53 − 1 has 16 digits, so shorter integers are always exact

function isDigit(char: string | undefined): boolean {
  return char !== undefined && char >= '0' && char <= '9'
}

/**
 * `JSON.parse` that does not round integers a JS number cannot hold: every such integer literal outside a string
 * becomes `{ "$numberLong": "<digits>" }`. Decimals, exponents, safe integers and everything inside strings are
 * untouched. Throws like `JSON.parse` for invalid JSON.
 */
export function parseJsonKeepingLongs(text: string): unknown {
  let result = ''
  let copiedUpTo = 0
  let inString = false
  let i = 0
  while (i < text.length) {
    const char = text[i]!
    if (inString) {
      i += char === '\\' ? 2 : 1
      if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      i++
      continue
    }
    if (char !== '-' && !isDigit(char)) {
      i++
      continue
    }
    // a number literal: [-]digits[.digits][e[+-]digits]
    const start = i
    let end = char === '-' ? i + 1 : i
    const digitsStart = end
    while (isDigit(text[end])) end++
    const integerEnd = end
    if (text[end] === '.' || text[end] === 'e' || text[end] === 'E') {
      end++
      while (end < text.length && (isDigit(text[end]) || text[end] === '+' || text[end] === '-' || text[end] === '.' || text[end] === 'e' || text[end] === 'E')) end++
      i = end
      continue
    }
    const token = text.slice(start, integerEnd)
    if (integerEnd - digitsStart >= MIN_UNSAFE_DIGITS && !Number.isSafeInteger(Number(token))) {
      result += `${text.slice(copiedUpTo, start)}{"$numberLong":"${token}"}`
      copiedUpTo = integerEnd
    }
    i = integerEnd
  }
  return JSON.parse(result + text.slice(copiedUpTo))
}

/**
 * The parsed body of an API response with large integers kept exact. Reads the text of a clone of the raw response, so
 * the generated client's own `value()` still works; falls back to `value()` when there is no readable raw response
 * (or the text is not JSON), which is also what a test double without a body gets.
 */
export async function readJsonKeepingLongs<T = unknown>(response: { raw?: Response, value: () => Promise<unknown> }): Promise<T> {
  const raw = response.raw
  if (raw && typeof raw.clone === 'function') {
    try {
      return parseJsonKeepingLongs(await raw.clone().text()) as T
    }
    catch {
      // not readable as JSON here — let the client's own reading decide
    }
  }
  return await response.value() as T
}
