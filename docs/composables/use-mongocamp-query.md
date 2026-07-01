# useMongocampQuery

High-level Lucene query helpers for MongoCamp collection filters. Every helper returns a Lucene expression string; a return value of `''` means "no filter" and is safe to pass straight into `and`/`or` — they filter empty parts out automatically.

```ts
const h = useMongocampQuery()

h.and(
  h.or(h.like('name', 'alice'), h.like('email', 'alice')),
  h.inClause('role', ['admin', 'user']),
  h.between('createdAt', '2024-01-01', null),
)
// => '((name:*alice* OR email:*alice*) AND role:("admin" OR "user") AND createdAt:[2024-01-01 TO *])'
```

## Value type

```ts
type QueryValue = string | number | boolean | null | undefined
```

`null`/`undefined` (and, for most helpers, empty strings) produce an empty/no-op expression rather than throwing — convenient for building a filter from a form where fields may be unset.

## Helpers

| Helper | Produces | Notes |
|---|---|---|
| `exists(field)` | `_exists_:field` | |
| `notExists(field)` | `-_exists_:field` | |
| `isEmpty(field)` | same as `notExists` | alias |
| `isNotEmpty(field)` | same as `exists` | alias |
| `equals(field, value)` | `field:"value"` | `''` if value is nullish/empty |
| `notEquals(field, value)` | `-field:"value"` | |
| `inRange(field, from, to)` | `field:[from TO to]` | pass `null` for an open bound → `*` |
| `notInRange(field, from, to)` | `-field:[from TO to]` | |
| `between(field, from, to)` | same as `inRange` | alias |
| `like(field, value)` | `field:*value*` | falls back to `field:*` when empty |
| `notLike(field, value)` | `-field:*value*` | |
| `startsWith(field, value)` | `field:value*` | |
| `notStartsWith(field, value)` | `-field:value*` | |
| `endsWith(field, value)` | `field:*value` | |
| `notEndsWith(field, value)` | `-field:*value` | |
| `inClause(field, values)` | `field:("v1" OR "v2" ...)` | numbers unquoted; `''` for an empty array |
| `notInClause(field, values)` | `-field:"v1" AND -field:"v2" ...` | `''` for an empty array |
| `containsAll(field, values)` | `(field:"v1" AND field:"v2" ...)` | `''` for an empty array |
| `and(...parts)` | parts joined with `AND`, wrapped in `()` | filters out empty parts; single survivor returned unwrapped |
| `or(...parts)` | parts joined with `OR`, wrapped in `()` | same filtering behavior |

## Building a filter from form state

```ts
const filter = ref({ name: '', status: '', createdFrom: null, createdTo: null })
const h = useMongocampQuery()

const luceneFilter = computed(() => h.and(
  h.like('name', filter.value.name),
  h.equals('status', filter.value.status),
  h.between('createdAt', filter.value.createdFrom, filter.value.createdTo),
))
```

Empty/unset fields drop out automatically — no manual `if` checks needed before calling `documentApi.listDocumentsRaw({ filter: luceneFilter.value })`.

For lower-level string building (escaping, ranges, fuzzy/proximity search, chainable groups), see [`useMongocampQueryBuilder`](/composables/use-mongocamp-query-builder), which this composable is built on.
