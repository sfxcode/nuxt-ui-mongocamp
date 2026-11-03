/** A numeric response header (`x-pagination-count-rows`, …), or `undefined` when it is absent or not a number. */
export function headerNumber(headers: { get: (name: string) => string | null } | undefined, name: string): number | undefined {
  const parsed = Number.parseInt(headers?.get(name) ?? '', 10)
  return Number.isNaN(parsed) ? undefined : parsed
}
