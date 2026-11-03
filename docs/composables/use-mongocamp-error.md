# useMongocampError

Turns an error thrown by a MongoCamp API call into a displayable message.

```ts
const { describeError } = useMongocampError()
const { kind, message } = describeError(error, 'nuxtUiMongocamp.databases.errorLoad')
```

| `kind` | When |
|---|---|
| `network` | The generated client threw a `FetchError` — the server is unreachable, or the browser hid a rejected response (this is what an expired session looks like) |
| `unauthorized` | HTTP 401 |
| `forbidden` | HTTP 403 |
| `other` | Anything else; uses the error's own message, then the optional fallback i18n key, then `nuxtUiMongocamp.errors.generic` |

`describeError` is synchronous and only looks at the error object. The `notAllowed` and `invalid` kinds below come from `describeServerError`.

## `describeServerError`

```ts
const { describeServerError } = useMongocampError()
const { kind, message } = await describeServerError(error, 'nuxtUiMongocamp.roles.errorDelete')
```

MongoCamp server 1.6.x sends CORS headers on every error, so the response body `{ code, msg }` is readable. `describeServerError` reads it (one clone of the response, best effort) and says what the server said:

| `kind` | When | Message |
|---|---|---|
| `notAllowed` | code `4031` — the server refuses an operator (`$function`, `$out`, `$merge`, `$accumulator`, `$where`, `$currentOp`) | "The server does not allow the operator $function." — *not* a missing permission, although the status is 403 |
| `invalid` | HTTP 400 with a message (a filter or body the server rejects) | the server's message |
| `other` | any other status ≥ 400 with a message (a 404 "could not find document", a 500) | the server's message |
| `network`, `unauthorized`, `forbidden` | unchanged | the fixed messages above (a plain 403 stays "no permission") |

Anything it cannot read — no response, a non-JSON body (a proxy's 503), no `msg` — falls back to `describeError`. The message never contains the database server's address: MongoDB's own text is extracted from a failed command (`parseServerError`) and every host:port is removed. The reading itself is `readServerError` in `utils/serverError.ts`.

Messages come from the `nuxtUiMongocamp.errors.*` locale keys (English and German). `MongocampErrorAlert`, the aggregation builder, the import wizard and the delete/clone/save dialogs of the users, roles, jobs and grants components use `describeServerError`.
