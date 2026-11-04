// The state MongocampQueryBar edits: a filter (the visual group and the Lucene string built from it), a sort and a
// projection. Pure helpers to convert it to and from a saved query, to describe it in a menu and to change its sort and
// projection. A projection lists the fields to LOAD (`_id` always comes with the server's answer); empty = all fields.
import { buildFilterQuery, countActiveConditions } from './filterBuilder'
import type { FilterFieldType, FilterGroup } from './filterBuilder'
import type { SavedQuery } from './savedQueries'

export interface QueryState {
  filterGroup: FilterGroup
  /** What the filter group builds (or a raw Lucene string restored without a group); '' = no filter. */
  lucene: string
  /** `['name', '-age']`: a leading `-` is descending (the server's own syntax). */
  sort: string[]
  projection: string[]
}

export const MAX_SORT_ENTRIES = 5

export function emptyGroup(): FilterGroup {
  return { match: 'all', conditions: [] }
}

export function emptyQueryState(): QueryState {
  return { filterGroup: emptyGroup(), lucene: '', sort: [], projection: [] }
}

export function isEmptyQuery(state: QueryState): boolean {
  return state.lucene === '' && state.sort.length === 0 && state.projection.length === 0
}

/** The query to keep in history / save: only what is set, so an empty one is not worth keeping. */
export function toSavedQuery(state: QueryState): SavedQuery {
  const query: SavedQuery = {}
  if (state.filterGroup.conditions.length > 0) query.filterGroup = state.filterGroup
  if (state.lucene !== '') query.lucene = state.lucene
  if (state.sort.length > 0) query.sort = [...state.sort]
  if (state.projection.length > 0) query.projection = [...state.projection]
  return query
}

/**
 * The state a saved query stands for. A saved visual group is built again with the field types the collection has now (so
 * the string always matches the group); a query saved with only a Lucene string keeps that string.
 */
export function fromSavedQuery(query: SavedQuery, fieldTypes: Record<string, FilterFieldType>): QueryState {
  const filterGroup = query.filterGroup ? { ...query.filterGroup, conditions: query.filterGroup.conditions.map(c => ({ ...c })) } : emptyGroup()
  const lucene = query.filterGroup ? buildFilterQuery(filterGroup, fieldTypes) : (query.lucene ?? '')
  return { filterGroup, lucene, sort: [...(query.sort ?? [])], projection: [...(query.projection ?? [])] }
}

export function parseSortEntry(entry: string): { field: string, desc: boolean } {
  return entry.startsWith('-') ? { field: entry.slice(1), desc: true } : { field: entry, desc: false }
}

export function formatSortEntry(field: string, desc: boolean): string {
  return desc ? `-${field}` : field
}

/** Adds a sort on `field` (ascending), replacing an existing one on the same field; refuses beyond `MAX_SORT_ENTRIES`. */
export function addSort(sort: string[], field: string): string[] {
  if (sort.some(e => parseSortEntry(e).field === field)) return sort
  return sort.length >= MAX_SORT_ENTRIES ? sort : [...sort, field]
}

export function toggleSortDirection(sort: string[], index: number): string[] {
  return sort.map((entry, i) => {
    if (i !== index) return entry
    const { field, desc } = parseSortEntry(entry)
    return formatSortEntry(field, !desc)
  })
}

export function setSortField(sort: string[], index: number, field: string): string[] {
  if (sort.some((e, i) => i !== index && parseSortEntry(e).field === field)) return sort // a field is sorted once
  return sort.map((entry, i) => (i === index ? formatSortEntry(field, parseSortEntry(entry).desc) : entry))
}

export function removeSort(sort: string[], index: number): string[] {
  return sort.filter((_, i) => i !== index)
}

/**
 * The projection after ticking or unticking `field` in a list of `all` selectable fields. An empty projection means "all",
 * so the first untick starts from all of them; ticking everything again goes back to empty; the last field cannot be
 * unticked (a projection of nothing is a request for only `_id`).
 */
export function toggleProjectionField(projection: string[], field: string, all: string[]): string[] {
  const current = projection.length > 0 ? projection : all
  const next = current.includes(field) ? current.filter(f => f !== field) : [...current, field]
  if (next.length === 0) return projection
  const ordered = all.filter(f => next.includes(f))
  return ordered.length === all.length ? [] : ordered
}

/** Fields of the projection that exist in `all`, in `all` order — a restored query may name fields this collection lacks. */
export function usableProjection(projection: string[], all: string[]): string[] {
  const known = all.filter(f => projection.includes(f))
  return known.length === all.length ? [] : known
}

const MAX_DESCRIPTION = 60

/** A short one-line description for the history and saved menus; `labels` supplies the (translated) words. */
export function describeQuery(query: SavedQuery, labels: { filter: string, sort: string, fields: string }, fieldTypes: Record<string, FilterFieldType> = {}): string {
  const parts: string[] = []
  const filter = query.filterGroup ? buildFilterQuery(query.filterGroup, fieldTypes) || query.lucene || '' : (query.lucene ?? '')
  if (filter) parts.push(`${labels.filter}: ${filter.length > MAX_DESCRIPTION ? `${filter.slice(0, MAX_DESCRIPTION - 1)}…` : filter}`)
  else if (query.filterGroup && countActiveConditions(query.filterGroup, fieldTypes) > 0) parts.push(labels.filter)
  if (query.sort?.length) {
    const text = query.sort.map((e) => {
      const entry = parseSortEntry(e)
      return `${entry.field} ${entry.desc ? '↓' : '↑'}`
    }).join(', ')
    parts.push(`${labels.sort}: ${text}`)
  }
  if (query.projection?.length) parts.push(`${labels.fields}: ${query.projection.length}`)
  return parts.join(' · ')
}
