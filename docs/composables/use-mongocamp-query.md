# useMongocampQuery

High-level Lucene query helpers for MongoCamp collection filters. Every helper returns a Lucene expression string; a return value of `''` means "no filter" and is safe to pass straight into `and`/`or` — they filter empty parts out automatically.

```ts
const h = useMongocampQuery()

h.and(
  h.or(h.like('name', 'alice'), h.like('email', 'alice')),
  h.inClause('role', ['admin', 'user']),
  h.between('createdAt', '2024-01-01', null),
)
// => '((name:*alice* OR email:*alice*) AND role:("admin" OR "user") AND createdAt:[2024-01-01T00:00:00Z TO 9999-12-31T23:59:59.999Z])'
```

## Value type

```ts
type QueryValue = string | number | boolean | null | undefined
```

`null`/`undefined` (and, for most helpers, empty strings) produce an empty/no-op expression rather than throwing — convenient for building a filter from a form where fields may be unset.

## Helpers

| Helper | Produces | Notes |
|---|---|---|
| `exists(field, type?)` | `(f:* OR f:[min TO max] OR f:[0001… TO 9999…])` | the field has a value; `type` (`'text'`, `'number'` or `'date'`) selects the one matching clause — see [Existence](#existence) |
| `notExists(field, type?)` | each clause negated, ANDed | the field has no value |
| `isEmpty(field, type?)` | same as `notExists` | alias |
| `isNotEmpty(field, type?)` | same as `exists` | alias |
| `equals(field, value)` | `field:"value"` | `''` if value is nullish/empty |
| `notEquals(field, value)` | `-field:"value"` | |
| `inRange(field, from, to)` | `field:[from TO to]` | inclusive; `null` / `''` / `'*'` is an open end — see [Ranges](#ranges) |
| `notInRange(field, from, to)` | `-field:[from TO to]` | open ends as in `inRange` |
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

## Existence

MongoCamp 1.5 has no working `_exists_:field` (it matches nothing, and its negation matches everything), and `field:*` only matches *text* values. So `exists` is written as a clause per value type that matches only its own type, ORed together:

```ts
h.exists('dateDeleted')
// => '(dateDeleted:* OR dateDeleted:[-9223372036854775808 TO 9223372036854775807] OR dateDeleted:[0001-01-01T00:00:00Z TO 9999-12-31T23:59:59.999Z])'
h.exists('dateDeleted', 'date')  // when you know the type: dateDeleted:[0001-01-01T00:00:00Z TO 9999-12-31T23:59:59.999Z]
h.exists('name', 'text')         // name:*
```

`notExists` negates each clause and ANDs them — negating the whole group (`-( … )` / `NOT ( … )`) is silently ignored by the server and would return the positive result. Both compose with `and` / `or`. Booleans, arrays and objects are not covered (nothing was verified for them).

## Ranges

- **Open ends:** MongoCamp 1.5 rejects `[x TO *]` (the request fails). An open end is therefore closed with the far bound of the *other* bound's type: the 64-bit integer limits for numbers, year 0001 / 9999 for dates. `inRange('age', 20, null)` → `age:[20 TO 9223372036854775807]`. Both ends open means "has a value" and returns `exists(field)`. An open end next to a *text* bound can't be expressed and stays `*`, which the server rejects.
- **Dates:** a date without a time is widened to the whole UTC day — lower bound `T00:00:00Z`, upper bound `T23:59:59.999Z` — because the server matches nothing for a bare date. Full timestamps are used as given.
- **Numbers:** a numeric string keeps its digits, so ids beyond 2^53 aren't rounded.
- **Safety:** brackets, quotes, whitespace and other characters that could end the range or start a new clause are escaped in a bound, so user input can't add query syntax. Field names are escaped by every helper (`first name` works; dots in MongoDB paths are left alone).

## Known server limits

Verified against a MongoCamp 1.5 server: `_id` cannot be filtered at all (`_id:"…"`, `_id:…` and `_id:*` all fail the request), and `>=` / `>` range syntax silently matches nothing. These helpers can't work around that.

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
