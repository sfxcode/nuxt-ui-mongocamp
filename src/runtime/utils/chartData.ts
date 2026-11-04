// Small pure helpers the chart components share (see MongocampChart).

export interface LabelledValue {
  label: string
  value: number
}

/** Shortens a label for an axis (`very-long-name` → `very-long-na…`); the full text stays in the data table. */
export function shortenLabel(label: string, max = 24): string {
  return label.length > max ? `${label.slice(0, Math.max(1, max - 1))}…` : label
}

/**
 * The `n` biggest items plus one summed "other" item for the rest (only when something is left over).
 * Keeps the input order of the top items by value, biggest first.
 */
export function topNWithOther(items: LabelledValue[], n: number, otherLabel: string): LabelledValue[] {
  const sorted = [...items].sort((a, b) => b.value - a.value)
  if (sorted.length <= n) return sorted
  const rest = sorted.slice(n).reduce((sum, item) => sum + item.value, 0)
  return [...sorted.slice(0, n), { label: otherLabel, value: rest }]
}
