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
- `{ $date: ... }` (string, epoch millis, or `{ $numberLong: '...' }`) → an ISO string
- `{ $numberInt/$numberLong/$numberDouble/$numberDecimal: '...' }` → a JS number
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
- Nested objects and arrays of objects recurse, matched positionally/by-key against `originalDoc` so oid detection still works inside them
- Everything else (numbers, booleans, plain strings, unmatched values) passes through as a plain JS value — the server accepts plain shapes on write, only reads return the extended-JSON wrapped form
- `_id` is always stripped from the output, even if present in `formData` or `originalDoc`

### Full-replace safety

`documentApi.update` replaces the **entire** document — there is no partial-patch semantics. Because `FUAutoForm`'s inferred schema only covers fields the *sampled* page happened to see, a document might have a field the sample never observed. To avoid silently deleting that field on save:

- When `originalDoc` is given (the edit case), the result starts as `{ ...originalDoc }`, then only the keys present in `formData` are overlaid on top — any other field on the real document survives untouched.
- When `originalDoc` is omitted (the insert case), there's nothing to preserve — the result is just the rewrapped form fields.

**This is the single most important correctness property of this composable.** Never reconstruct an update payload purely from the form's own output — always route it through `wrapExtendedJson` with the original row.

## Related

- [`MongocampCollectionData`](/components/mongocamp-collection-data) — the only current consumer; passes `documents.value.map(unwrapExtendedJson)` as `FUAutoForm`'s `:data` (schema-inference input) and `unwrapExtendedJson(row)` as the live `v-model`
- [`useMongocampSchema`](/composables/use-mongocamp-schema) — a separate, still-used schema inference tool for display purposes (stat cards, generated TS interfaces); not involved in the Add/Edit form anymore
- [`useMongocampDocument`](/composables/use-mongocamp-document) — `ensureMetaData` stamps `metaData` on the result before insert/update
