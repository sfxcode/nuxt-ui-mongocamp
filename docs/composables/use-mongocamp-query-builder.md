# useMongocampQueryBuilder

Low-level Lucene syntax builder — value escaping helpers (`q`) plus a chainable expression builder (`Q`). This is what [`useMongocampQuery`](/composables/use-mongocamp-query) is built on; reach for it directly when you need syntax `useMongocampQuery` doesn't cover (fuzzy/proximity search, boosting, manual grouping).

```ts
const { q, Q } = useMongocampQueryBuilder()
```

## `q` — value helpers

| Helper | Produces | Notes |
|---|---|---|
| `q.terms(value)` | `"value"` | escaped and quoted; negative integers preserved as-is |
| `q.phrase(value)` | escaped value | wildcards `*`/`?` preserved |
| `q.wildcard(pattern)` | escaped pattern | wildcards preserved, everything else escaped |
| `q.fuzzy(term, similarity?)` | `term~` or `term~0.8` | |
| `q.proximity(a, b, distance)` | `"a b"~distance` | |
| `q.range(from, to, includeLeft?, includeRight?)` | `[from TO to]` (or `{`/`}` for exclusive bounds) | both bounds inclusive by default |
| `q.boost(term, factor)` | `term^factor` | |
| `q.required(term)` | `+term` | |
| `q.not(term)` | `NOT term` | |
| `q.field(name, value)` | `name:value` | |

## `Q()` — chainable builder

```ts
// Connector style
Q().field('name', q.terms('Alice')).and().field('active', q.terms('true')).build()
// => 'name:"Alice" AND active:"true"'

// Joiner style
Q().and(q.field('name', q.terms('Alice')), q.field('age', q.range('20', '30'))).build()
// => 'name:"Alice" AND age:[20 TO 30]'

// Nested groups
Q()
  .field('name', q.terms('Alice'))
  .and()
  .group(Q().or(q.field('status', q.terms('active')), q.field('status', q.terms('pending'))))
  .build()
// => 'name:"Alice" AND (status:"active" OR status:"pending")'
```

`and()`/`or()` work both ways: called with no arguments they push a bare connector token (for the fluent chain style); called with arguments they join those expressions directly.

| Method | Description |
|---|---|
| `.field(name, value)` | append `name:value` |
| `.and(...exprs)` | connector (no args) or join expressions with `AND` |
| `.or(...exprs)` | connector (no args) or join expressions with `OR` |
| `.not(expr)` | append `NOT expr` |
| `.group(innerOrBuilder)` | wrap a string or nested `Q()` in parentheses |
| `.raw(expr)` | append an expression unchanged |
| `.build()` / `.toString()` | join all parts with spaces |

`Q(...initial)` accepts seed expressions in the constructor, equivalent to calling `.raw()` for each.
