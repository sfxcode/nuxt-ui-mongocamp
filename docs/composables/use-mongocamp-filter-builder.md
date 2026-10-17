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
| `boolean` | `isTrue`, `isFalse`, `isEmpty`, `isNotEmpty` |
| `array`, `object` | `isNotEmpty`, `isEmpty` |

`isEmpty` / `isNotEmpty` mean the field is absent / present (`_exists_`). `gte`/`lte`/`between` are inclusive.

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
- **Safe against query injection:** values are escaped; field names are escaped (a field called `first name` works); range bounds — which the query helpers copy in verbatim — are accepted only as finite numbers or ISO dates.
- **`contains` keeps `*` and `?` as wildcards**, so `a*b` matches "a…b". A leading wildcard (`contains`, `endsWith`) cannot use an index and is slow on large collections.
- **Numbers and booleans are written unquoted** (`age:30`, `active:true`), strings quoted (`name:"ali"`). This follows the existing `inClause` convention; confirm it against your server before relying on numeric/boolean equality.

See also [`useMongocampQuery`](/composables/use-mongocamp-query).
