# useMongocampDynamicForm

Generates a FormKit schema from a `ColumnDefinition` tree (the same shape [`useMongocampSchema`](/composables/use-mongocamp-schema)'s `schemaFromSamples` produces), and round-trips a raw MongoDB document through that schema's plain-data shape. This is what [`MongocampCollectionData`](/components/mongocamp-collection-data) uses to generate its Add/Edit form instead of a raw-JSON textarea.

This module has no FormKit dependency of its own beyond the schema shape it emits — it imports `ColumnDefinition` as a type only from `useMongocampSchema`, never the reverse.

```ts
import { columnsToFormKitSchema, documentToFormData, formDataToDocument } from '#imports'
```

## `columnsToFormKitSchema(columns)`

```ts
function columnsToFormKitSchema(columns: ColumnDefinition[]): FormKitSchemaNode[]
```

### Mapping table

| `columnType` | Generated FormKit node |
|---|---|
| `string` | `nuxtUIInput` |
| `number` | `nuxtUIInputNumber` |
| `boolean` | `nuxtUISwitch` |
| `date-time` | `nuxtUIInputDate` |
| `object` | `group` (nested fields recurse via `children`), wrapped in a padded `$el: 'div'` — FormKit's `group` type renders no element of its own |
| `array`, `arrayItemType: 'string'` or `'unknown'` | `nuxtUIInputTags` |
| `array`, scalar `arrayItemType` (`number`/`boolean`/`date-time`) | `nuxtUIRepeater` wrapping a single field named `value` |
| `array`, `arrayItemType: 'object'` | `nuxtUIRepeater` wrapping the recursively-generated object fields |

`required: true` adds `validation: 'required'` on the field itself (never on a repeater's inner item field). Every generated `nuxtUIRepeater` node enables `displayAddButton`/`displayCloneButton`/`displayDeleteButton`/`alwaysDisplayInsertButton` (all opt-in props the component otherwise hides), a right-aligned button group, and a drag handle in place of up/down buttons — these default to hidden/off if not set explicitly.

## `documentToFormData(doc, columns)`

```ts
function documentToFormData(doc: Record<string, unknown>, columns: ColumnDefinition[]): Record<string, unknown>
```

Converts a raw document into the plain shape the generated schema binds to:

- `{ $oid: '...' }` on a `string` column → the plain string
- `{ $date: ... }` on a `date-time` column (string, epoch millis, or `{ $numberLong: '...' }`) → an `@internationalized/date` value, **not a plain string** — `nuxtUIInputDate` is backed by reka-ui's `DateField`, which crashes (`defaultValue.copy is not a function`) if given a raw string
- `{ $numberInt/$numberLong/$numberDouble/$numberDecimal: '...' }` on a `number` column → a JS number
- `object`/array-of-objects columns recurse
- A field absent from the document entirely is **omitted** from the output (not set to `null`), so FormKit's own default-value behavior applies

## `formDataToDocument(formData, columns, originalDoc?)`

```ts
function formDataToDocument(formData: Record<string, unknown>, columns: ColumnDefinition[], originalDoc?: Record<string, unknown>): Record<string, unknown>
```

The inverse conversion, safe to hand to `documentApi.insert`/`documentApi.update`:

- `date-time` fields (a plain ISO string, or the `@internationalized/date` value `nuxtUIInputDate` actually emits) → rewrapped to `{ $date: isoString }`
- `string` fields that were originally `$oid`-wrapped (detected via `originalDoc`) → rewrapped to `{ $oid: value }`
- `object`/array-of-objects/number fields → passed through as plain JS values; the server accepts plain shapes on write, only reads return the extended-JSON wrapped form
- `_id` is always stripped from the output, even if present in `formData` or `originalDoc`

### Full-replace safety

`documentApi.update` replaces the **entire** document — there is no partial-patch semantics. Because the generated schema only covers fields the *sampled* page happened to see, a document might have a field the schema never observed (an outlier the sample missed). To avoid silently deleting that field on save:

- When `originalDoc` is given (the edit case), the result starts as `{ ...originalDoc }`, then only the keys covered by `columns` are overlaid on top — any other field on the real document survives untouched.
- When `originalDoc` is omitted (the insert case), there's nothing to preserve — the result is just the rewrapped form fields.

**This is the single most important correctness property of this composable.** Never reconstruct an update payload purely from the form's own output — always route it through `formDataToDocument` with the original row.

## Related

- [`useMongocampSchema`](/composables/use-mongocamp-schema) — supplies the `ColumnDefinition` tree this composable consumes
- [`MongocampCollectionData`](/components/mongocamp-collection-data) — the only current consumer
