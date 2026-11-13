# MongocampVersion

Displays the connected MongoCamp server's name and version as a `UBadge`, using the `$mongocampVersion` value provided by the runtime plugin. Shows a neutral "unavailable" badge when the server cannot be reached.

Once signed in (or in server proxy mode) a second badge shows the version of the **MongoDB server** behind MongoCamp (`MongoDB 9.0.4`), read from `GET /system/info` (MongoCamp server 1.9.0+, login required). A server without the endpoint or a refused request just leaves that badge out — no error.

## Usage

```vue
<template>
  <MongocampVersion />
</template>
```

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `hideDatabase` | `boolean` | `false` | Hide the MongoDB version badge (and skip its request) |

## Related

- [Configuration → Runtime plugin](/guide/configuration#runtime-plugin)
