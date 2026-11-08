# useMongocampExtendedJson

Converts between a raw MongoDB document (containing extended-JSON wrappers like `$oid`/`$date`/`$numberLong`) and the plain-value shape that [`@sfxcode/nuxt-ui-formkit`](https://www.npmjs.com/package/@sfxcode/nuxt-ui-formkit)'s `FUAutoForm`/`useFormKitAutoForm` infer a form from. This is what [`MongocampCollectionData`](/components/mongocamp-collection-data) uses to feed its Add/Edit form and to rewrap the result before saving.

`FUAutoForm`'s schema inference (`inferFormSchemaFromSamples`) has no notion of MongoDB's extended JSON — it only understands plain JS values (strings, numbers, booleans, `Date`/ISO strings, nested objects, arrays). This composable is the small, schema-free bridge that lets raw MongoDB documents flow through it.

```ts
import { unwrapExtendedJson, wrapExtendedJson } from '#imports'
```

## `unwrapExtendedJson(value)`

```ts
function unwrapExtendedJson(value: unknown): unknown
```

Recursively converts extended-JSON wrappers into plain values:

- `{ $oid: '...' }` → the plain string
- `{ $string: '...' }` → the text (the server's marker, in a typed read, for text that looks like a date)
- `{ $date: ... }` (string, epoch millis, or `{ $numberLong: '...' }`) → an ISO string
- `{ $numberInt/$numberLong/$numberDouble/$numberDecimal: '...' }` → a JS number — except a `$numberLong` beyond ±(2^53 − 1), which stays its **exact digit string** (`unwrapExtendedJson(value, { exactLongs: false })` gives the rounded number instead, used only for type inference). A `$numberDecimal` still becomes a JS number, so more than ~15 significant digits are rounded
- Nested objects and arrays recurse
- Any other value passes through untouched

The result is valid both as a live form value and as one entry of the `samples` array passed to `FUAutoForm`'s `data` prop for schema inference.

## `wrapExtendedJson(formData, originalDoc?)`

```ts
function wrapExtendedJson(formData: Record<string, unknown>, originalDoc?: Record<string, unknown>): Record<string, unknown>
```

The inverse conversion, safe to hand to `documentApi.insert`/`documentApi.update`:

- A string shaped like an ISO date/date-time → rewrapped to `{ $date: isoString }` — this mirrors the exact ISO-detection regex `useFormKitAutoForm` uses to infer a date field in the first place, and `nuxtUIInputDate` (with `valueType: 'iso'`) always emits a full ISO string back, so this is symmetric with inference
- A string whose matching field in `originalDoc` was `$oid`-wrapped → rewrapped to `{ $oid: value }`
- A string of digits whose matching field in `originalDoc` was a `$numberLong` wrapper → rewrapped to `{ $numberLong: value }`, so an exact long stays a 64-bit integer (and an untouched one compares equal to the original, so it is never sent)
- Nested objects and arrays of objects recurse, matched positionally/by-key against `originalDoc` so oid detection still works inside them
- `{ $date }` is what the server wants on write: since MongoCamp 1.6.3 it is converted into a real date by insert, full update, partial update and `updateMany` (1.5.x and 1.6.1 stored it as a literal sub-document, so the date could not be filtered). A bare date string such as `2024-03-01` stays plain text.
- **With a typed original** (a document read with `extendedJson=canonical`, server 1.8.1) the types survive the round trip, because the server honours every wrapper on insert, update, partial update and `updateMany` (verified live):
  - a string whose original was `{ $string }` → `{ $string: value }`, so date-looking **text stays text** (the server would store a plain timestamp-shaped string as a date);
  - a number whose original was `{ $numberInt }` (and fits int32) → `{ $numberInt }`; `{ $numberLong }` (a safe integer) → `{ $numberLong }`; `{ $numberDouble }` → `{ $numberDouble }`; `{ $numberDecimal }` → `{ $numberDecimal }`. A value that no longer fits its type (`2.5` for an int) is sent plain and the server picks the type
- A date-looking string of a field the original did not have is still a `{ $date }`, as the form means it
- Everything else (booleans, plain strings, numbers without a typed original, unmatched values) passes through as a plain JS value
- `_id` is always stripped from the output, even if present in `formData` or `originalDoc`

### Full-replace safety

`MongocampCollectionData` no longer sends the result of an edit as a full replace: it compares it with the original row and sends only the differences (`documentApi.updateDocumentPartial`, see [`MongocampCollectionData`](/components/mongocamp-collection-data#insert-edit-delete)). That makes this property *more* important, not less — a field missing from the result would be read as "removed" and unset. The full `documentApi.update` replaces the **entire** document and is only the fallback. Because `FUAutoForm`'s inferred schema only covers fields the *sampled* page happened to see, a document might have a field the sample never observed. To avoid silently deleting that field on save:

- When `originalDoc` is given (the edit case), the result starts as `{ ...originalDoc }`, then only the keys present in `formData` are overlaid on top — any other field on the real document survives untouched.
- When `originalDoc` is omitted (the insert case), there's nothing to preserve — the result is just the rewrapped form fields.

**This is the single most important correctness property of this composable.** Never reconstruct an update payload purely from the form's own output — always route it through `wrapExtendedJson` with the original row.

## Type hints (`wrapExtendedJson(form, original?, hints?)`)

Without an original there is nothing that says a number was an `int` or a text is text, so an insert (or a field the edited document did not have) used to be guessed: a timestamp-shaped string became a date, every number a plain JSON number. `hints` — a map of dotted path to BSON type (`utils/bsonTypes.ts`, built by [`useMongocampFieldTypes().hints()`](/composables/use-mongocamp-field-types)) — types those scalars:

| Hint | Written as |
|---|---|
| `int` | `{ $numberInt }` (int32 range, else plain) |
| `long` | `{ $numberLong }` (a digit string keeps every digit) |
| `double` / `decimal` | `{ $numberDouble }` / `{ $numberDecimal }` (the typed text stays: `2.50`) |
| `date` | `{ $date }` for a full timestamp with a zone |
| `objectId` | `{ $oid }` for 24 hex characters |
| `string` | `{ $string }` for a full timestamp (so the server keeps it as text), else the text |

A value that does not fit its type (`2.5` as an `int`) is sent unchanged and the server picks the type. A **typed original always wins** over a hint; paths are dotted (`address.zip`), array elements `tags[]`. `wireValue(type, value)` is the pure core. Verified live on 1.8.1: every wrapper above is stored with that type on insert (the server normalises `1e3` to `1E+3` and `2` to `2.0` when reading back).

## Related

- [`MongocampCollectionData`](/components/mongocamp-collection-data) — the only current consumer; passes `documents.value.map(unwrapExtendedJson)` as `FUAutoForm`'s `:data` (schema-inference input) and `unwrapExtendedJson(row)` as the live `v-model`
- [`useMongocampSchema`](/composables/use-mongocamp-schema) — a separate, still-used schema inference tool for display purposes (stat cards, generated TS interfaces); not involved in the Add/Edit form anymore
- [`useMongocampDocument`](/composables/use-mongocamp-document) — `ensureMetaData` stamps `metaData` on the result before insert/update
