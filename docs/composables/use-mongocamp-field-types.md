# useMongocampFieldTypes

The fields of a collection with the types of their values, from the server's own sample (`GET …/fields/detail`, server 1.8.1) — **one request per collection**, shared by every component that asks (a `useState` cache), instead of guessing from the rows on screen.

```ts
const types = useMongocampFieldTypes(() => props.collectionName)
await types.load()            // load(true) asks again

types.status()                // 'idle' | 'loading' | 'ready' | 'failed'
types.filterFields()          // [{ key: 'address.city', type: 'string' }, …] for the filter builder
types.typeOf('age')           // { path, types: ['long', 'string'], dominant: 'long', mixed: true, element: false }
types.hints()                 // { name: 'string', 'tags[]': 'string' } for wrapExtendedJson
types.invalidate()            // forget this collection
```

| Function | Returns |
|---|---|
| `load(force?)` | loads once (a second caller shares the request); never throws — a failure sets status `failed` and leaves the fields empty, so callers keep their own fallback |
| `fields()` / `selectable()` | every path / the paths one can select (no array elements `tags[]`) |
| `typeOf(path)` | a `FieldTypeInfo`: the scalar BSON types found (never `null`), most frequent first; `dominant`; `container` (`object` / `array`); `mixed` (several kinds — `int` + `long` alone is **not** mixed); `element` |
| `filterFields()` | every selectable path that has a filter editor, with its filter type (`_id` is `objectId` with exact operators only; containers have no operators) |
| `hints()` | write hints: a path with exactly **one** scalar type; multi-type paths are left to the server |

The mapping helpers (`toFieldTypeInfos`, `bsonOfType`, `filterTypeOf`, `columnTypeOf`, `toTypeHints`) are pure functions in `utils/fieldDetails.ts`. Type names are MongoDB's `$type` names; `binData`, `regex` and the like have no editor and are left out.

Used by [`MongocampCollectionData`](/components/mongocamp-collection-data#filters) for the filter builder.
