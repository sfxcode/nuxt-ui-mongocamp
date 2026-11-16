# useMongocampConnection

Can the MongoCamp server be reached right now? One shared state per app. With the module option [`offline`](/guide/session-handling#offline-apps), the module keeps it up to date in the browser and the session guard relies on it; without that option the state only changes through `check()` and `report()`.

```ts
const {
  state,      // Ref<'online' | 'offline' | 'unreachable'>
  isOnline,   // ComputedRef<boolean> — state === 'online'
  lastAnswer, // Ref<string | null>   — ISO time the server last answered
  check,      // () => Promise<ConnectionState> — asks the server now
  report,     // (error?: unknown) => boolean   — feed in the outcome of your own request
} = useMongocampConnection()
```

| State | Meaning |
|---|---|
| `online` | The server answered recently |
| `offline` | The browser itself reports no network (`navigator.onLine === false`) |
| `unreachable` | There is a network, but the server does not answer — a WLAN without internet, a server that is down, or the network just came back and no check has succeeded yet |

## `check`

Sends `GET /version` with a 5 s timeout. Any answer, whatever its HTTP status, counts as `online`; a network error or timeout as `unreachable`. While the browser reports no network it does not send anything and returns `offline`.

## `report`

An app with its own data layer passes in what its requests saw, so a failing request switches the state at once instead of waiting for the next check:

```ts
const connection = useMongocampConnection()
try {
  const result = await $fetch('/api/my-data')
  connection.report()
  return result
}
catch (error) {
  if (connection.report(error)) return readFromLocalCopy() // a network failure
  throw error // the server answered with an error
}
```

`report(error)` returns `true` only for a failure without an answer from the server. An error that carries an HTTP status (401, 404, 500, ...) proves the server was there and keeps the state `online`. The same test is public as [`isNetworkFailure`](/guide/utilities#connection).

## With the module option `offline`

The plugin keeps the state current in the browser:

- the browser's `online` and `offline` events switch it at once (`online` triggers a check);
- while `unreachable`, the server is checked again after 5 s, then with a doubling delay up to 60 s;
- a tab that becomes visible while not `online` is checked at once (a tablet may have been asleep);
- there is no polling while `online` — your own requests, through `report()`, notice a lost connection.

## Related

- [Session handling → Offline apps](/guide/session-handling#offline-apps)
- [`useMongocampSession`](/composables/use-mongocamp-session)
