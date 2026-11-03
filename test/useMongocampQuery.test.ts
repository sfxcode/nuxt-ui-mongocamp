import { describe, it, expect } from 'vitest'
import { useMongocampQuery } from '../src/runtime/composables/useMongocampQuery'

const h = useMongocampQuery()

// Closed ranges covering every value of a type — what a real MongoCamp 1.5 server accepts for "has a value"
const NUM = '[-9223372036854775808 TO 9223372036854775807]'
const DATE = '[0001-01-01T00:00:00Z TO 9999-12-31T23:59:59.999Z]'

describe('exists / notExists / isEmpty / isNotEmpty', () => {
  it('exists without a type ORs a text wildcard with a full number and a full date range', () => {
    expect(h.exists('name')).toBe(`(name:* OR name:${NUM} OR name:${DATE})`)
  })

  it('notExists negates each clause and ANDs them — negating the whole group is ignored by the server', () => {
    expect(h.notExists('name')).toBe(`((-name:*) AND (-name:${NUM}) AND (-name:${DATE}))`)
    expect(h.notExists('name')).not.toMatch(/^-\(/)
  })

  it('a type selects the shortest form that works for it', () => {
    expect(h.exists('name', 'text')).toBe('name:*')
    expect(h.exists('age', 'number')).toBe(`age:${NUM}`)
    expect(h.exists('created', 'date')).toBe(`created:${DATE}`)
    expect(h.notExists('name', 'text')).toBe('-name:*')
    expect(h.notExists('age', 'number')).toBe(`-age:${NUM}`)
    expect(h.notExists('created', 'date')).toBe(`-created:${DATE}`)
  })

  it('never uses _exists_, which matches nothing on a MongoCamp 1.5 server', () => {
    expect(h.exists('name')).not.toContain('_exists_')
    expect(h.notExists('name', 'text')).not.toContain('_exists_')
  })

  it('escapes the field name', () => {
    expect(h.exists('first name', 'text')).toBe('first\\ name:*')
  })

  it('the aliases forward the type too', () => {
    expect(h.isEmpty('age', 'number')).toBe(h.notExists('age', 'number'))
    expect(h.isNotEmpty('age', 'number')).toBe(h.exists('age', 'number'))
  })

  it('isEmpty is an alias for notExists', () => {
    expect(h.isEmpty('name')).toBe(h.notExists('name'))
  })

  it('isNotEmpty is an alias for exists', () => {
    expect(h.isNotEmpty('name')).toBe(h.exists('name'))
  })
})

describe('equals / notEquals', () => {
  it('wraps string value in quotes', () => {
    expect(h.equals('status', 'active')).toBe('status:"active"')
  })

  it('returns empty string for null', () => {
    expect(h.equals('status', null)).toBe('')
  })

  it('returns empty string for undefined', () => {
    expect(h.equals('status', undefined)).toBe('')
  })

  it('returns empty string for empty string', () => {
    expect(h.equals('status', '')).toBe('')
  })

  it('handles boolean value', () => {
    expect(h.equals('active', true)).toBe('active:"true"')
  })

  it('notEquals negates a valid value', () => {
    expect(h.notEquals('status', 'active')).toBe('-status:"active"')
  })

  it('notEquals returns empty string for null', () => {
    expect(h.notEquals('status', null)).toBe('')
  })
})

describe('inRange / notInRange / between', () => {
  it('produces inclusive range query', () => {
    expect(h.inRange('age', 20, 30)).toBe('age:[20 TO 30]')
  })

  it('works with text bounds', () => {
    expect(h.inRange('name', 'A', 'M')).toBe('name:[A TO M]')
  })

  it('widens date-only bounds to the whole UTC day, because the server matches nothing for a bare date', () => {
    expect(h.inRange('date', '2024-01-01', '2024-12-31')).toBe('date:[2024-01-01T00:00:00Z TO 2024-12-31T23:59:59.999Z]')
  })

  it('leaves full timestamps exactly as given', () => {
    expect(h.inRange('date', '2024-01-01T10:00:00Z', '2024-02-01T12:30:00Z')).toBe('date:[2024-01-01T10:00:00Z TO 2024-02-01T12:30:00Z]')
  })

  it('keeps the digits of numbers given as text, so big ids are not rounded', () => {
    expect(h.inRange('id', '19185237114620650', '19999999999999999')).toBe('id:[19185237114620650 TO 19999999999999999]')
  })

  it('escapes anything in a bound that could end the range or start a new clause', () => {
    expect(h.inRange('x', '5] OR y:[1', 10)).toBe('x:[5\\]\\ OR\\ y:\\[1 TO 10]')
    expect(h.inRange('x', 'a"b', 'c d')).toBe('x:[a\\"b TO c\\ d]')
  })

  it('escapes the field name', () => {
    expect(h.inRange('first name', 1, 2)).toBe('first\\ name:[1 TO 2]')
  })

  it('notInRange negates', () => {
    expect(h.notInRange('age', 20, 30)).toBe('-age:[20 TO 30]')
  })

  it('between is an alias for inRange', () => {
    expect(h.between('age', 20, 30)).toBe(h.inRange('age', 20, 30))
  })
})

describe('like / notLike', () => {
  it('wraps value in wildcards', () => {
    expect(h.like('name', 'ali')).toBe('name:*ali*')
  })

  it('returns wildcard-only when value is empty', () => {
    expect(h.like('name', '')).toBe('name:*')
  })

  it('returns wildcard-only when value is null', () => {
    expect(h.like('name', null)).toBe('name:*')
  })

  it('notLike negates', () => {
    expect(h.notLike('name', 'ali')).toBe('-name:*ali*')
  })
})

describe('startsWith / notStartsWith', () => {
  it('appends wildcard', () => {
    expect(h.startsWith('name', 'Al')).toBe('name:Al*')
  })

  it('returns wildcard-only for empty value', () => {
    expect(h.startsWith('name', '')).toBe('name:*')
  })

  it('notStartsWith negates', () => {
    expect(h.notStartsWith('name', 'Al')).toBe('-name:Al*')
  })
})

describe('endsWith / notEndsWith', () => {
  it('prepends wildcard', () => {
    expect(h.endsWith('name', 'ice')).toBe('name:*ice')
  })

  it('returns wildcard-only for empty value', () => {
    expect(h.endsWith('name', '')).toBe('name:*')
  })

  it('notEndsWith negates', () => {
    expect(h.notEndsWith('name', 'ice')).toBe('-name:*ice')
  })
})

describe('inClause', () => {
  it('produces OR group for multiple strings', () => {
    expect(h.inClause('status', ['active', 'pending'])).toBe('status:("active" OR "pending")')
  })

  it('no group wrapping for a single value', () => {
    expect(h.inClause('status', ['active'])).toBe('status:"active"')
  })

  it('numbers are not quoted', () => {
    expect(h.inClause('age', [20, 30, 40])).toBe('age:(20 OR 30 OR 40)')
  })

  it('mixed numbers and strings — numbers unquoted, strings quoted', () => {
    expect(h.inClause('val', [1, 'foo'])).toBe('val:(1 OR "foo")')
  })

  it('returns empty string for empty array', () => {
    expect(h.inClause('status', [])).toBe('')
  })
})

describe('notInClause', () => {
  it('produces AND of negated equals', () => {
    expect(h.notInClause('status', ['active', 'pending']))
      .toBe('((-status:"active") AND (-status:"pending"))')
  })

  it('returns empty string for empty array', () => {
    expect(h.notInClause('status', [])).toBe('')
  })
})

describe('containsAll', () => {
  it('produces AND of equals for all values', () => {
    expect(h.containsAll('tags', ['js', 'ts'])).toBe('(tags:"js" AND tags:"ts")')
  })

  it('single value returns plain equals', () => {
    expect(h.containsAll('tags', ['js'])).toBe('tags:"js"')
  })

  it('returns empty string for empty array', () => {
    expect(h.containsAll('tags', [])).toBe('')
  })
})

describe('and / or combinators', () => {
  it('and joins two parts', () => {
    expect(h.and(h.equals('a', '1'), h.equals('b', '2'))).toBe('(a:"1" AND b:"2")')
  })

  it('and with single non-empty part returns it unwrapped', () => {
    expect(h.and(h.equals('a', '1'))).toBe('a:"1"')
  })

  it('and filters out null and empty strings', () => {
    expect(h.and(h.equals('a', '1'), null, '', h.equals('b', '2'))).toBe('(a:"1" AND b:"2")')
  })

  it('and returns empty string when all parts are empty', () => {
    expect(h.and(null, undefined, '')).toBe('')
  })

  it('or joins two parts', () => {
    expect(h.or(h.equals('a', '1'), h.equals('b', '2'))).toBe('(a:"1" OR b:"2")')
  })

  it('negated terms are wrapped in parens before combining', () => {
    expect(h.and(h.notEquals('a', '1'), h.notEquals('b', '2')))
      .toBe('((-a:"1") AND (-b:"2"))')
  })

  it('and with only one valid part skips the outer parens', () => {
    expect(h.and(null, h.equals('a', '1'), null)).toBe('a:"1"')
  })
})

describe('open-ended ranges', () => {
  // a real MongoCamp 1.5 server rejects `[x TO *]` (the request fails), so open ends are closed with far bounds
  it('a null number bound is closed with the 64-bit integer limit', () => {
    expect(h.inRange('age', null, 30)).toBe('age:[-9223372036854775808 TO 30]')
    expect(h.inRange('age', 20, null)).toBe('age:[20 TO 9223372036854775807]')
  })

  it('a null date bound is closed with year 0001 / 9999, after widening the given bare date', () => {
    expect(h.inRange('created', '2024-01-01', null)).toBe('created:[2024-01-01T00:00:00Z TO 9999-12-31T23:59:59.999Z]')
    expect(h.inRange('created', null, '2024-01-01')).toBe('created:[0001-01-01T00:00:00Z TO 2024-01-01T23:59:59.999Z]')
  })

  it('never emits * for a number or date, and "*" or "" mean an open end like null', () => {
    expect(h.inRange('age', '*', 30)).toBe(h.inRange('age', null, 30))
    expect(h.inRange('age', '', 30)).toBe(h.inRange('age', null, 30))
    expect(h.inRange('age', 20, null)).not.toContain('*')
  })

  it('a numeric string bound counts as a number', () => {
    expect(h.inRange('id', '19185237114620650', null)).toBe('id:[19185237114620650 TO 9223372036854775807]')
  })

  it('both bounds open means "has a value"', () => {
    expect(h.inRange('age', null, null)).toBe(h.exists('age'))
    expect(h.notInRange('age', null, null)).toBe(h.notExists('age'))
  })

  it('notInRange with an open end', () => {
    expect(h.notInRange('price', null, 100)).toBe('-price:[-9223372036854775808 TO 100]')
  })

  it('an open end next to a text bound cannot be expressed and stays *', () => {
    expect(h.inRange('name', 'A', null)).toBe('name:[A TO *]')
  })
})

describe('special character escaping', () => {
  it('equals escapes spaces inside quoted value', () => {
    expect(h.equals('name', 'foo bar')).toBe('name:"foo\\ bar"')
  })

  it('equals escapes + in value', () => {
    expect(h.equals('code', 'c++')).toBe('code:"c\\+\\+"')
  })

  it('equals escapes colon in value', () => {
    expect(h.equals('path', 'a:b')).toBe('path:"a\\:b"')
  })

  it('like escapes special chars but keeps wildcards', () => {
    expect(h.like('name', 'foo+bar')).toBe('name:*foo\\+bar*')
  })

  it('startsWith escapes colon in prefix', () => {
    expect(h.startsWith('label', 'key:')).toBe('label:key\\:*')
  })

  it('field names with dots pass through unescaped (MongoDB paths)', () => {
    expect(h.equals('user.name', 'Alice')).toBe('user.name:"Alice"')
    expect(h.exists('meta.created', 'text')).toBe('meta.created:*')
  })
})

describe('field names are escaped by every helper', () => {
  // a name like "first name" would otherwise split into two tokens and break (or change) the query
  const name = 'first name'
  const escaped = 'first\\ name'

  it.each([
    ['equals', () => h.equals(name, 'x'), `${escaped}:"x"`],
    ['notEquals', () => h.notEquals(name, 'x'), `-${escaped}:"x"`],
    ['like', () => h.like(name, 'x'), `${escaped}:*x*`],
    ['notLike', () => h.notLike(name, 'x'), `-${escaped}:*x*`],
    ['startsWith', () => h.startsWith(name, 'x'), `${escaped}:x*`],
    ['endsWith', () => h.endsWith(name, 'x'), `${escaped}:*x`],
    ['inClause', () => h.inClause(name, ['a', 'b']), `${escaped}:("a" OR "b")`],
    ['containsAll', () => h.containsAll(name, ['a', 'b']), `(${escaped}:"a" AND ${escaped}:"b")`],
  ])('%s', (_helper, build, expected) => {
    expect(build()).toBe(expected)
  })
})

describe('null propagation in compound expressions', () => {
  it('and drops empty equals result silently', () => {
    expect(h.and(h.equals('name', 'Alice'), h.equals('status', null))).toBe('name:"Alice"')
  })

  it('or drops empty equals result silently', () => {
    expect(h.or(h.equals('name', null), h.equals('status', 'active'))).toBe('status:"active"')
  })

  it('and with all null values returns empty string', () => {
    expect(h.and(h.equals('a', null), h.equals('b', undefined))).toBe('')
  })

  it('inRange in and when equals is null', () => {
    expect(h.and(h.equals('tag', null), h.inRange('score', 5, 10))).toBe('score:[5 TO 10]')
  })
})

describe('notInClause edge cases', () => {
  it('single item returns plain negated equals without outer parens', () => {
    expect(h.notInClause('status', ['deleted'])).toBe('-status:"deleted"')
  })

  it('single-item notInClause inside and — negated term gets wrapped', () => {
    const result = h.and(h.notInClause('status', ['deleted']), h.equals('active', true))
    expect(result).toBe('((-status:"deleted") AND active:"true")')
  })

  it('multi-item notInClause inside and — already wrapped, no double-wrap', () => {
    const result = h.and(
      h.notInClause('status', ['deleted', 'archived']),
      h.equals('visible', true),
    )
    expect(result).toBe('(((-status:"deleted") AND (-status:"archived")) AND visible:"true")')
  })
})

describe('combined query examples', () => {
  it('active users named Alice', () => {
    const result = h.and(h.equals('name', 'Alice'), h.equals('status', 'active'))
    expect(result).toBe('(name:"Alice" AND status:"active")')
  })

  it('range within an AND query', () => {
    const result = h.and(h.equals('country', 'DE'), h.inRange('age', 18, 65))
    expect(result).toBe('(country:"DE" AND age:[18 TO 65])')
  })

  it('nested and inside or', () => {
    const result = h.or(
      h.and(h.equals('role', 'admin'), h.equals('active', 'true')),
      h.equals('role', 'superadmin'),
    )
    expect(result).toBe('((role:"admin" AND active:"true") OR role:"superadmin")')
  })

  it('three-level nesting: type-partitioned range union', () => {
    const result = h.or(
      h.and(h.equals('type', 'doc'), h.inRange('size', 1, 5)),
      h.and(h.equals('type', 'img'), h.inRange('size', 100, 500)),
    )
    expect(result).toBe('((type:"doc" AND size:[1 TO 5]) OR (type:"img" AND size:[100 TO 500]))')
  })

  it('exists guard combined with equals', () => {
    const result = h.and(h.isNotEmpty('email'), h.equals('role', 'admin'))
    expect(result).toBe(`((email:* OR email:${NUM} OR email:${DATE}) AND role:"admin")`)
  })

  it('containsAll tags AND inClause status', () => {
    const result = h.and(
      h.containsAll('tags', ['typescript', 'nuxt']),
      h.inClause('status', ['draft', 'published']),
    )
    expect(result).toBe('((tags:"typescript" AND tags:"nuxt") AND status:("draft" OR "published"))')
  })

  it('user search: name or email like, role in list, active=true', () => {
    const result = h.and(
      h.or(h.like('name', 'alice'), h.like('email', 'alice')),
      h.inClause('role', ['admin', 'user']),
      h.equals('active', true),
    )
    expect(result).toBe('((name:*alice* OR email:*alice*) AND role:("admin" OR "user") AND active:"true")')
  })

  it('document filter: not deleted, has title, created after date', () => {
    const result = h.and(
      h.notExists('deletedAt'),
      h.isNotEmpty('title'),
      h.inRange('createdAt', '2024-01-01', null),
    )
    expect(result).toBe(
      `(((-deletedAt:*) AND (-deletedAt:${NUM}) AND (-deletedAt:${DATE})) AND (title:* OR title:${NUM} OR title:${DATE})`
      + ' AND createdAt:[2024-01-01T00:00:00Z TO 9999-12-31T23:59:59.999Z])',
    )
  })
})

describe('not / notAnd / notOr (De Morgan — the server evaluates -(A AND B) wrongly)', () => {
  it('negates a single clause, and un-negates a negated one', () => {
    expect(h.not('a:1')).toBe('-a:1')
    expect(h.not('-a:1')).toBe('a:1')
    expect(h.not('role:("admin" OR "user")')).toBe('-role:("admin" OR "user")')
    expect(h.not(h.like('name', 'x'))).toBe('-name:*x*')
  })

  it('returns an empty string for empty input', () => {
    expect(h.not('')).toBe('')
    expect(h.not(null)).toBe('')
    expect(h.not(undefined)).toBe('')
    expect(h.notAnd('', null)).toBe('')
    expect(h.notOr()).toBe('')
  })

  it('rewrites a negated AND group as an OR of parenthesised negations — never -(A AND B)', () => {
    expect(h.notAnd('a:1', 'b:2')).toBe('((-a:1) OR (-b:2))')
    expect(h.not(h.and('a:1', 'b:2'))).toBe('((-a:1) OR (-b:2))')
    expect(h.notAnd('a:1', 'b:2', 'c:3')).toBe('((-a:1) OR (-b:2) OR (-c:3))')
    expect(h.notAnd('a:1', 'b:2')).not.toContain('-(')
  })

  it('rewrites a negated OR group as an AND of parenthesised negations', () => {
    expect(h.notOr('a:1', 'b:2')).toBe('((-a:1) AND (-b:2))')
    expect(h.not(h.or('a:1', 'b:2'))).toBe('((-a:1) AND (-b:2))')
  })

  it('ignores empty parts, and a single remaining part is a plain negation', () => {
    expect(h.notAnd('a:1', '', null)).toBe('-a:1')
    expect(h.notOr(undefined, 'b:2')).toBe('-b:2')
  })

  it('recurses into nested groups', () => {
    // not(a AND (b OR c)) = (not a) OR ((not b) AND (not c))
    expect(h.not(h.and('a:1', h.or('b:2', 'c:3')))).toBe('((-a:1) OR ((-b:2) AND (-c:3)))')
    // not(a OR (b AND c)) = (not a) AND ((not b) OR (not c))
    expect(h.not(h.or('a:1', h.and('b:2', 'c:3')))).toBe('((-a:1) AND ((-b:2) OR (-c:3)))')
  })

  it('double negation gives the original back', () => {
    const original = h.and('a:1', h.or('b:2', 'c:3'))
    expect(h.not(h.not(original))).toBe(original)
  })

  it('negates the compound helpers: exists is an OR of three clauses, notExists an AND of three negations', () => {
    expect(h.not(h.exists('f'))).toBe(`((-f:*) AND (-f:${NUM}) AND (-f:${DATE}))`)
    expect(h.not(h.notExists('f'))).toBe(`(f:* OR f:${NUM} OR f:${DATE})`)
  })

  it('keeps operators and parentheses inside quotes and values intact', () => {
    expect(h.not('s:"a AND b"')).toBe('-s:"a AND b"')
    expect(h.notAnd('s:"a AND b"', 'n:[1 TO 3]')).toBe('((-s:"a AND b") OR (-n:[1 TO 3]))')
  })

  it('refuses what it cannot read instead of guessing', () => {
    expect(() => h.not('NOT (a:1 AND b:2)')).toThrow('Cannot negate')
    expect(() => h.not('a:1 AND b:2 OR c:3')).toThrow('Cannot negate')
  })
})

describe('byId / byIds', () => {
  const a = '6aea4c030f35d7fd9728feba'
  const b = '6AEA4C030F35D7FD9728FEBB'

  it('writes an exact quoted _id clause', () => {
    expect(h.byId(a)).toBe(`_id:"${a}"`)
    expect(h.byIds([a, b])).toBe(`_id:("${a}" OR "${b}")`)
    expect(h.byIds([a])).toBe(`_id:"${a}"`)
  })

  it('throws for anything that is not a 24-character hex id — "" would mean no filter, i.e. every document', () => {
    expect(() => h.byId('abc')).toThrow(TypeError)
    expect(() => h.byId('')).toThrow('byId needs a 24-character hex ObjectId')
    expect(() => h.byId('g'.repeat(24))).toThrow(TypeError)
    expect(() => h.byId(`${a}0`)).toThrow(TypeError)
    expect(() => h.byId(undefined as unknown as string)).toThrow('got undefined')
    expect(() => h.byIds([a, 'nope'])).toThrow('byIds needs a 24-character hex ObjectId, got "nope"')
  })

  it('returns an empty string for an empty list, like inClause', () => {
    expect(h.byIds([])).toBe('')
  })

  it('composes with notEquals and and/or', () => {
    expect(h.notEquals('_id', a)).toBe(`-_id:"${a}"`)
    expect(h.and(h.byId(a), h.isTrue('active'))).toBe(`(_id:"${a}" AND active:true)`)
  })
})

describe('isTrue / isFalse', () => {
  it('writes the plain boolean term and escapes the field name', () => {
    expect(h.isTrue('active')).toBe('active:true')
    expect(h.isFalse('active')).toBe('active:false')
    expect(h.isTrue('is active')).toBe('is\\ active:true')
    expect(h.isFalse('a.b')).toBe('a.b:false')
  })

  it('negates to a single negated clause', () => {
    expect(h.not(h.isTrue('active'))).toBe('-active:true')
  })
})

describe('arrayContains / hasItems', () => {
  it('quotes a text element and leaves a number unquoted', () => {
    expect(h.arrayContains('tags', 'a')).toBe('tags:"a"')
    expect(h.arrayContains('tags', 'x y')).toBe('tags:"x\\ y"')
    expect(h.arrayContains('nums', 7)).toBe('nums:7')
    expect(h.arrayContains('nums', -3)).toBe('nums:-3')
  })

  it('returns an empty string for an empty or nullish value', () => {
    expect(h.arrayContains('tags', '')).toBe('')
    expect(h.arrayContains('tags', null)).toBe('')
    expect(h.arrayContains('tags', undefined)).toBe('')
  })

  it('hasItems is exists: a text wildcard ORed with the full number and date ranges, or the one typed clause', () => {
    expect(h.hasItems('tags')).toBe(h.exists('tags'))
    expect(h.hasItems('tags')).toBe(`(tags:* OR tags:${NUM} OR tags:${DATE})`)
    expect(h.hasItems('tags', 'text')).toBe('tags:*')
    expect(h.hasItems('nums', 'number')).toBe(`nums:${NUM}`)
  })
})

describe('onDay / notOnDay', () => {
  it('is the whole UTC day, because the server matches nothing for a bare one-day range', () => {
    expect(h.onDay('createdAt', '2024-03-01')).toBe('createdAt:[2024-03-01T00:00:00Z TO 2024-03-01T23:59:59.999Z]')
    expect(h.notOnDay('createdAt', '2024-03-01')).toBe('-createdAt:[2024-03-01T00:00:00Z TO 2024-03-01T23:59:59.999Z]')
  })

  it('accepts a leap day and rejects dates that are not on the calendar', () => {
    expect(h.onDay('d', '2024-02-29')).toContain('2024-02-29T00:00:00Z')
    expect(() => h.onDay('d', '2023-02-29')).toThrow(TypeError)
    expect(() => h.onDay('d', '2024-13-01')).toThrow('onDay needs a calendar date like 2024-03-01')
    expect(() => h.onDay('d', '2024-04-31')).toThrow(TypeError)
  })

  it('rejects anything that is not exactly YYYY-MM-DD, including full timestamps and injected syntax', () => {
    expect(() => h.onDay('d', '2024-03-01T10:00:00Z')).toThrow(TypeError)
    expect(() => h.onDay('d', '03/01/2024')).toThrow(TypeError)
    expect(() => h.onDay('d', '')).toThrow(TypeError)
    expect(() => h.onDay('d', '2024-03-01] OR x:[1')).toThrow(TypeError)
    expect(() => h.notOnDay('d', 'nope')).toThrow('notOnDay needs a calendar date')
  })
})

describe('nested paths and awkward field names', () => {
  it('leaves the dots of a nested path alone and escapes spaces', () => {
    expect(h.equals('obj.k', 'v')).toBe('obj.k:"v"')
    expect(h.equals('first name', 'Ann')).toBe('first\\ name:"Ann"')
    expect(h.arrayContains('items.sku', 'a')).toBe('items.sku:"a"')
  })
})
