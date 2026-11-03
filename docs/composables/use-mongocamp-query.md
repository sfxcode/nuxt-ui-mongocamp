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
| `byId(id)` | `_id:"<hex>"` | one document by id; a 24-character hex ObjectId (any case), otherwise it **throws** a `TypeError` — `''` would mean "no filter", every document |
| `byIds(ids)` | `_id:("a" OR "b" ...)` | any of these documents; every id validated like `byId`; `''` for an empty array |
| `isTrue(field)` / `isFalse(field)` | `field:true` / `field:false` | a boolean field; a document without the field matches neither |
| `arrayContains(field, value)` | `field:"x"` / `field:5` | the array has this element (text quoted, numbers not); `''` for an empty value |
| `hasItems(field, type?)` | same as `exists` | an array with at least one element — see [Arrays](#arrays) |
| `onDay(field, 'YYYY-MM-DD')` | `field:[…T00:00:00Z TO …T23:59:59.999Z]` | the whole UTC day; throws for anything that is not a real calendar date |
| `notOnDay(field, 'YYYY-MM-DD')` | `-field:[the whole day]` | everything except that day, documents without the field included |
| `not(part)` | the negation of any expression these helpers built | a clause becomes `-clause` (and back); a group is rewritten with De Morgan — see [Negating groups](#negating-groups) |
| `notAnd(...parts)` | `((-a) OR (-b))` | "not all of these"; same as `not(and(...))` |
| `notOr(...parts)` | `((-a) AND (-b))` | "none of these"; same as `not(or(...))` |

## Existence

MongoCamp 1.5 has no working `_exists_:field` (it matches nothing, and its negation matches everything), and `field:*` only matches *text* values. So `exists` is written as a clause per value type that matches only its own type, ORed together:

```ts
h.exists('dateDeleted')
// => '(dateDeleted:* OR dateDeleted:[-9223372036854775808 TO 9223372036854775807] OR dateDeleted:[0001-01-01T00:00:00Z TO 9999-12-31T23:59:59.999Z])'
h.exists('dateDeleted', 'date')  // when you know the type: dateDeleted:[0001-01-01T00:00:00Z TO 9999-12-31T23:59:59.999Z]
h.exists('name', 'text')         // name:*
```

`notExists` negates each clause and ANDs them (a negated `AND` group is evaluated wrongly by the server, see [Negating groups](#negating-groups)). Both compose with `and` / `or`. Existence of booleans and objects is not covered (nothing was verified for them); `field:*` on an array does match documents whose array has elements (verified on 1.6.3).

## Arrays

All checked against server 1.6.3 on a scratch collection (2026-11-03, counts compared with the expected ones):

- `arrayContains` matches when **any element** matches: `tags:"a"` finds `["a","b"]`, `nums:7` finds `[5, 7]` (a number element is written unquoted), a value with a space is escaped, `containsAll('tags', ['x','y'])` finds arrays holding both.
- `hasItems` is `exists`: a text wildcard ORed with a full number and a full date range. **`field:*` alone only matches arrays of text** — `nums:*` matched no array of numbers — which is why it is not just a wildcard. An empty array and a missing field do not match. Arrays of dates work. **Arrays of booleans and of objects are not matched by anything** (a known limit). Pass `'text'`, `'number'` or `'date'` when you know the element type for the shorter clause.
- Nested paths work as written: `equals('obj.k', 'v')` → `obj.k:"v"` (the dots are left alone); a field name with a space is escaped (`first\ name:"Ann"`).

## Ids and days

`_id:"<hex>"` and `_id:("a" OR "b")` match case-insensitively; an id that does not exist simply matches nothing. `onDay` matters because the server matches **nothing** for a bare one-day range (`[2024-02-15 TO 2024-02-15]` is midnight to midnight): the helper writes the whole UTC day, and the boundary milliseconds were checked — a timestamp at `23:59:59.999` is inside the day, `00:00:00.000` of the next day and `23:59:59.999` of the day before are not.

## Negating groups

MongoCamp (still, on 1.6.3) evaluates `-(A AND B)` and `NOT (A AND B)` as `-A AND -B`, which is wrong; a single negated clause and `-(A OR B)` are fine. `not`, `notAnd` and `notOr` therefore never write a negated group: by De Morgan's law "not (A and B)" is `(not A) or (not B)`, and "not (A or B)" is `(not A) and (not B)`, applied recursively. Each negated clause gets its own parentheses — **they are required**, `-A OR -B` without them returns the wrong documents.

```ts
h.notAnd('active:true', 'role:"admin"')   // ((-active:true) OR (-role:"admin"))
h.notOr('a:1', 'b:2')                     // ((-a:1) AND (-b:2))
h.not(h.and('a:1', h.or('b:2', 'c:3')))   // ((-a:1) OR ((-b:2) AND (-c:3)))
h.not('-a:1')                             // a:1
h.not(h.exists('f'))                      // ((-f:*) AND (-f:[…number range]) AND (-f:[…date range]))
```

`not` reads the expression it is given, so it understands what the helpers above produce (clauses, parenthesised groups joined by one operator, `-( … )`); text it cannot read — `NOT …`, `AND` and `OR` mixed without parentheses, unbalanced parentheses — throws `UnsupportedExpressionError` instead of guessing, because a wrong negation would silently return the wrong documents. An empty expression stays empty (no filter, never "match nothing"). Verified on server 1.6.3 by comparing counts for 68 random nested expressions against a brute-force evaluation (0 differences).

## Ranges

- **Open ends:** MongoCamp 1.5 rejects `[x TO *]` (the request fails). An open end is therefore closed with the far bound of the *other* bound's type: the 64-bit integer limits for numbers, year 0001 / 9999 for dates. `inRange('age', 20, null)` → `age:[20 TO 9223372036854775807]`. Both ends open means "has a value" and returns `exists(field)`. An open end next to a *text* bound can't be expressed and stays `*`, which the server rejects.
- **Dates:** a date without a time is widened to the whole UTC day — lower bound `T00:00:00Z`, upper bound `T23:59:59.999Z` — because the server matches nothing for a bare date. Full timestamps are used as given.
- **Numbers:** a numeric string keeps its digits, so ids beyond 2^53 aren't rounded.
- **Safety:** brackets, quotes, whitespace and other characters that could end the range or start a new clause are escaped in a bound, so user input can't add query syntax. Field names are escaped by every helper (`first name` works; dots in MongoDB paths are left alone).

## Known server limits

Re-verified on MongoCamp server 1.6.3 (2026-11-03; nothing changed since 1.6.1 for the points below): `_id:"<oid>"`, `_id:<oid>` and lists of ids work with `equals`, `notEquals` and `inClause` (1.5 failed the request), but wildcards on `_id` (`like`, `startsWith`, `endsWith`, `_id:*`) match nothing, open ranges `[x TO *]` still fail the request, and `>=` / `>` range syntax still silently matches nothing. Negating a group whose inner operator is `AND` (`-(a AND b)`) is evaluated like `-(a OR b)` (reported in [MongoCamp/mongocamp-server#69](https://github.com/MongoCamp/mongocamp-server/issues/69)), which is why `notExists` negates clause by clause; negating a whole `AND` group is done with `notAnd` / `not`, see [Negating groups](#negating-groups). A bare date as the upper bound ends at midnight, which is why dates are widened to the whole day.

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
