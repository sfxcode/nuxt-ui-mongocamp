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

Messages come from the `nuxtUiMongocamp.errors.*` locale keys (English and German).
