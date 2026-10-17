# useMongocampFilterBuilder

Pure logic behind the visual filter builder: turns "field · operator · value" rows into one Lucene query string for the `filter` parameter of the document and file APIs. It has no UI and no Nuxt dependency — build the rows however you like and pass them in. (The builder component that edits these rows is a separate step.)

```ts
const { buildFilterQuery } = useMongocampFilterBuilder()

const query = buildFilterQuery(
  {
    match: 'all', // 'all' = AND, 'any' = OR
    conditions: [
      { id: '1', field: 'name', operator: 'contains', value: 'ali' },
      { id: '2', field: 'age', operator: 'between', value: '18', value2: '65' },
    ],
  },
  { name: 'string', age: 'number' }, // field → type; unknown fields count as 'string'
)
// => '(name:*ali* AND age:[18 TO 65])'
```

## Operators per field type

| Type | Operators |
|---|---|
| `string` | `contains`, `equals`, `notEquals`, `startsWith`, `endsWith`, `oneOf` (comma list), `isEmpty`, `isNotEmpty` |
| `number` | `equals`, `notEquals`, `gte`, `lte`, `between`, `oneOf`, `isEmpty`, `isNotEmpty` |
| `date-time` | `gte`, `lte`, `between`, `isEmpty`, `isNotEmpty` |
| `boolean` | `isTrue`, `isFalse` |
| `array`, `object` | none — `operatorsFor` returns `[]`, so leave these fields out of the builder |

`gte`/`lte`/`between` are inclusive. `isEmpty` / `isNotEmpty` ("does not exist" / "exists") use [`useMongocampQuery`](/composables/use-mongocamp-query)'s typed `exists` / `notExists`; booleans, arrays and objects have none.

## Functions

| Function | Description |
|---|---|
| `operatorsFor(type)` | Operators valid for a type (string operators for an unknown type) |
| `valueCountFor(operator)` | How many value inputs the operator needs: `0`, `1`, or `2` (`between`) |
| `buildCondition(condition, type)` | Lucene for one row, or `''` if the row is incomplete or invalid |
| `buildFilterQuery(group, fieldTypes)` | All valid rows joined with AND/OR; `''` means "no filter" |
| `countActiveConditions(group, fieldTypes)` | How many rows contribute to the query (for a "Filters (n)" badge) |

## Behaviour worth knowing

- **Incomplete or invalid rows are skipped**, never turned into "match everything": empty values, non-numeric numbers, non-ISO dates, an operator that doesn't fit the field type. A `oneOf` list with a single bad number is rejected as a whole.
- **Safe against query injection:** values and field names are escaped by the query helpers (a field called `first name` works); range bounds are additionally accepted here only as plain numbers or ISO dates.
- **`contains` keeps `*` and `?` as wildcards**, so `a*b` matches "a…b". A leading wildcard (`contains`, `endsWith`) cannot use an index and is slow on large collections.
- **Numbers keep the digits as typed** and are written unquoted (`age:30`); only plain decimals are accepted (no `1e3`). Ids and account numbers beyond 2^53 therefore aren't rounded. Strings are written quoted (`name:"ali"`).
- **Dates**: a bare date means the whole day in UTC — `gte 2024-01-01` is `[2024-01-01T00:00:00Z …`, `lte 2024-01-01` ends at `2024-01-01T23:59:59.999Z`. A full timestamp is used as given.
- **No open-ended ranges.** `gte` / `lte` close the range with a far-away bound (the 64-bit integer limits for numbers, year 0001 / 9999 for dates) instead of `*`. The date and range handling lives in `useMongocampQuery().inRange`; this composable only validates what was typed.

## Checked against a real server

These behaviours were verified against a MongoCamp server (1.5.x) and are why the operator tables look the way they do — see also [`useMongocampQuery`](/composables/use-mongocamp-query#existence):

| Works | Does not work |
|---|---|
| `name:*x*`, `name:"x"`, `name:x*`, `name:*x`, `name:("a" OR "b")` | `_id:"<oid>"` and `_id:<oid>` — the request fails, so `_id` can't be filtered |
| `n:12345` (unquoted number, exact digits), `n:[a TO b]` (closed range) | `n:[a TO *]` / `[* TO b]` (open end) — the request fails |
| `d:[2018-01-01T00:00:00Z TO 2018-12-31T23:59:59.999Z]` | `d:[2018-01-01 TO 2018-12-31]` (bare dates) — silently matches nothing |
| `name:*` / `-name:*` on a text field; a closed full-range for numbers and dates (as "exists") | `_exists_:field` — matches nothing; `-_exists_:field` matches everything |
| `(a OR b OR c)` of the above; each clause negated and ANDed | `-( … )` / `NOT ( … )` on a group — the negation is ignored; `field:*` on a number or date — matches nothing |

Boolean terms (`active:true`) and `oneOf` on numbers are written the obvious way but were not exercised against the server.

See also [`useMongocampQuery`](/composables/use-mongocamp-query).
