# MongocampFilePreview

Drawer (`USlideover`) that previews one file of a GridFS bucket. Used by [`MongocampBucketFiles`](/components/mongocamp-bucket-files)' **Preview** action, but works on its own.

```vue
<MongocampFilePreview v-model:open="open" bucket-name="photos" :file="file" />
```

## Props

| Prop | Type | Description |
|---|---|---|
| `bucketName` | `string` | Bare bucket name |
| `file` | `FileInformation` | The file (from `listFiles`) |
| `v-model:open` | `boolean` | Drawer state; the file is only fetched while open |

## What is shown

The kind is decided by the **file name** (the server stores no content type), the blob's type only as a fallback for names without an extension:

| Kind | Extensions | Shown as | Size cap |
|---|---|---|---|
| image | png, jpg, jpeg, gif, webp, avif, bmp, ico | `<img>` from a blob URL | 10 MB |
| pdf | pdf | sandboxed `<iframe>` | 20 MB |
| json | json, ndjson | pretty-printed text (NDJSON left as is) | 1 MB |
| csv | csv, tsv | text | 1 MB |
| text | txt, md, log, xml, yaml, html, … | text | 1 MB |
| other | everything else, **SVG** | metadata + download only | — |

SVG is never rendered inline because it can carry script. Text is cut at 200 000 characters (a note says so). A file above its cap is not fetched at all. The blob URL is revoked when the drawer closes, the file changes or the component unmounts, and a slow request that has been overtaken is ignored. A failed load shows the readable error message; **Download** and the file's metadata are always available.

Pure helpers: `utils/filePreview.ts` (`previewKind`, `canPreview`, `PREVIEW_LIMITS`, `prettyJson`, `clipText`, `parseMetadataJson`). The bytes come from [`useMongocampBucket`](/composables/use-mongocamp-bucket)'s `fetchFileBlob`.
