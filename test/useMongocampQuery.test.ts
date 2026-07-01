import { describe, it, expect } from 'vitest'
import { useMongocampQuery } from '../src/runtime/composables/useMongocampQuery'

const h = useMongocampQuery()

describe('exists / notExists / isEmpty / isNotEmpty', () => {
  it('exists produces _exists_ field query', () => {
    expect(h.exists('name')).toBe('_exists_:name')
  })

  it('notExists negates exists', () => {
    expect(h.notExists('name')).toBe('-_exists_:name')
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

  it('works with string bounds', () => {
    expect(h.inRange('date', '2024-01-01', '2024-12-31')).toBe('date:[2024-01-01 TO 2024-12-31]')
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
  it('null lower bound uses * (open range)', () => {
    expect(h.inRange('age', null, 30)).toBe('age:[* TO 30]')
  })

  it('null upper bound uses * (open range)', () => {
    expect(h.inRange('age', 20, null)).toBe('age:[20 TO *]')
  })

  it('both bounds null produces full-range wildcard', () => {
    expect(h.inRange('age', null, null)).toBe('age:[* TO *]')
  })

  it('notInRange with null lower bound', () => {
    expect(h.notInRange('price', null, 100)).toBe('-price:[* TO 100]')
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
    expect(h.exists('meta.created')).toBe('_exists_:meta.created')
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
    expect(result).toBe('(_exists_:email AND role:"admin")')
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
    expect(result).toBe('((-_exists_:deletedAt) AND _exists_:title AND createdAt:[2024-01-01 TO *])')
  })
})
