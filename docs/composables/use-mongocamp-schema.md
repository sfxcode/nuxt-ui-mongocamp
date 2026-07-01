# useMongocampSchema

Infers a table schema by sampling real documents — not by calling `collectionApi.getJsonSchema()`. This means the inferred shape always matches what's actually in the collection, including nested objects and arrays.

```ts
const { schemaFromSamples, schemaToTsInterface } = useMongocampSchema()
```

## `schemaFromSamples(records)`

```ts
function schemaFromSamples(records: Array<Record<string, unknown>>): ColumnDefinition[]
```

```ts
interface ColumnDefinition {
  columnName: string
  columnKey: string
  columnType: string        // 'string' | 'number' | 'boolean' | 'date-time' | 'object' | 'array'
  required: boolean
  arrayItemType?: string    // only set when columnType === 'array'
  children?: ColumnDefinition[] // set for 'object', or 'array' with arrayItemType === 'object'
}
```

Usage:

```ts
const samples = await documentApi.listDocuments({ collectionName, rowsPerPage: 500, page: 1 })
const columns = schemaFromSamples(samples as Array<Record<string, unknown>>)
```

### Type inference rules

- Every non-null value for a field across the sample is inspected; a single consistent type wins, mixed types fall back to `'string'`.
- MongoDB extended JSON is recognized: `{ $date: ... }` → `'date-time'`, `{ $oid: ... }` → `'string'`, `{ $numberInt/$numberLong/$numberDouble/$numberDecimal: ... }` → `'number'`.
- Date-time strings are matched against a broad ISO 8601 pattern — date-only, no-seconds, milliseconds, `Z`, numeric timezone offsets, and space-separated date-times all count.
- Arrays are inspected element-by-element: a single consistent element type sets `arrayItemType`; mixed elements fall back to `'string'`; an array that's always empty across the sample yields `arrayItemType: 'unknown'`.
- Objects (and arrays of objects) recurse: `children` is built by re-running inference over the sampled nested objects/items merged together.
- Field order: `_id` first, `metaData` last, everything else alphabetical.

### `required` means "had a value", not "key existed"

A field only counts as present when its value is non-null/non-undefined in a given document — a key that exists but is always `null` is **not** marked `required`.

## `schemaToTsInterface(columns, name)`

```ts
function schemaToTsInterface(columns: ColumnDefinition[], interfaceName: string): string
```

Generates a root `interface {PascalCase(name)} { ... }`, plus one nested interface per object / array-of-object field, and returns them all joined by blank lines — ready to paste into a `.ts` file.

Nested interface naming:

- object field → `{Parent}{PascalCase(fieldKey)}` — e.g. `Cart` + `shippingAddress` → `CartShippingAddress`
- array-of-object field → `{Parent}{PascalCase(singularize(fieldKey))}` — e.g. `Cart` + `items` → `CartItem`

Falls back to `Record<string, unknown>` / `unknown[]` when the field's shape was never observed (always empty in the sample). Optional fields (`required: false`) get a `?` marker; non-identifier field names are automatically quoted.

This is what powers the "Copy as TS Interface" button in [`MongocampCollectionInfos`](/components/mongocamp-collection-infos).
