# useMongocampSavedPipelines

Saved aggregation pipelines of one collection, kept **in this browser only** (`localStorage` through [`useMongocampPersistedState`](/composables/use-mongocamp-persisted-state); nothing is sent to the server). Used by [`MongocampAggregationBuilder`](/components/mongocamp-aggregation-builder).

```ts
const { saved, save, remove } = useMongocampSavedPipelines(() => route.params.name as string)

const result = save('Orders per customer', [
  { stage: '$group', value: { _id: '$customerId', n: { $sum: 1 } } },
  { stage: '$sort', value: { n: -1 } },
])
if (!result.ok) toast(result.reason)   // 'invalid-name' | 'invalid-pipeline' | 'limit' | 'too-large'

saved.value   // [{ name, pipeline: RequestStage[] }]
remove('Orders per customer')
```

- A pipeline is the request form `[{ stage, value }]`, 1–50 stages, at most 20 000 characters.
- Names are trimmed (1–80 characters) and unique **ignoring case**; saving an existing name replaces it, also when the list is full (50 per collection).
- **Untrusted on read:** everything coming back from storage goes through the same checks as a pipeline typed into the builder's JSON view — a stage or operator on the deny-list (`$out`, `$merge`, `$function`, `$accumulator`, `$where`, `$lookup`, `$unionWith`, `$graphLookup`, `$collStats`, `$indexStats`, at any depth) drops the whole entry. Hand-edited storage cannot bring one back.
- The key is `savedPipelines:<collection>`; a ref or getter collection reloads when it changes.
