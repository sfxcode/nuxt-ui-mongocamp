# useMongocampPersistedState

A ref whose value is remembered in `localStorage` between visits — the data table uses it for page size, sort and hidden columns, and your own components can use it for anything small and per-viewer.

```ts
const { state, reset } = useMongocampPersistedState(
  () => `orders:${route.params.name}`,   // string, ref or getter
  { pageSize: 20, hidden: [] as string[] },
)

state.value.pageSize = 50   // stored automatically
reset()                     // forget it, back to the defaults
```

- Stored under `nuxt-ui-mongocamp:<key>` as `{ "v": 1, "data": … }`.
- Stored values are merged over the defaults, so a field added in a later release gets its default.
- A **getter or ref key** reloads the state when it changes (another collection ⇒ its own entry).
- Never throws: a private window, blocked site data, a full quota, corrupt JSON, a newer version or a value over 16 KB all mean "not remembered" and the defaults are used. On the server nothing is stored.

## Options

| Option | Meaning |
|---|---|
| `storage` | a `Storage`-like object; `null` turns persistence off. Default: `localStorage` in the browser |
| `version` | envelope version (default `1`); data of another version is dropped … |
| `migrate(data, fromVersion)` | … unless this turns an older version into the current shape |
| `validate(data)` | rejects data of the right version but a wrong shape |

The data is **per browser**: it is not synced and is never sent to the server. Do not store anything secret in it.
