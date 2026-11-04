# useMongocampAutoRefresh

Calls a load function on an interval for live views, without hammering the server.

```ts
const { start, stop, refreshNow, running, lastRefreshed, lastError } =
  useMongocampAutoRefresh(() => reload(), { intervalMs: 10_000 })

onMounted(start)   // stops by itself when the component unmounts
```

- **No overlap:** the wait starts when the previous load *ended*, so a slow server is never asked twice at once.
- **Backoff:** after a failed load the wait is multiplied (×2 by default) up to 5 minutes; the first success returns to the plain interval. The error is kept in `lastError` — `load` failures are never thrown out of the timer.
- **Hidden tab:** pauses while `document.hidden` and loads once when the tab is shown again (`pauseWhenHidden: false` keeps going).
- **Minimum interval:** below 1000 ms is raised to 1000 ms. `intervalMs` may be a ref or getter; a change applies from the next wait.
- **Cleanup:** stops with the component or effect scope that created it. `start()` twice is harmless.
- **Server:** no `document` ⇒ `start` and `refreshNow` do nothing.

## Options

| Option | Meaning |
|---|---|
| `intervalMs` | time between the end of one load and the start of the next |
| `pauseWhenHidden` | default `true` |
| `backoff` | `{ factor = 2, maxMs = 300000 }`, or `false` for a constant interval |

`refreshNow()` loads at once (sharing a load that is already running) and restarts the wait; it works while stopped too, without starting the timer.

`MongocampDashboard` and `MongocampJobs` use it through their opt-in `autoRefresh` prop (seconds).
