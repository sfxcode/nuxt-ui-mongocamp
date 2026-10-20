import { describe, it, expect } from 'vitest'
import { ForbiddenPipelineError, parseServerError } from '../src/runtime/utils/aggregationErrors'

const command = (n: number, name: string, message: string, host = '173.249.2.248:5455') =>
  `Command failed with error ${n} (${name}): '${message}' on server ${host}. The full response is {"ok": 0.0, "errmsg": "${message}", "code": ${n}, "codeName": "${name}"}`

describe('parseServerError', () => {
  it('reduces a failed MongoDB command to its message, without the database server address', () => {
    const info = parseServerError(command(15959, 'Location15959', 'the match filter must be an expression in an object'))
    expect(info).toEqual({ kind: 'mongo', message: 'the match filter must be an expression in an object' })
  })

  it('keeps quotes and colons inside the message and works for a hostname:port address too', () => {
    const info = parseServerError(command(5107201, 'Location5107201', 'invalid argument to $limit stage: Expected a number in: $limit: "2"', 'db.internal.example:27017'))
    expect(info.message).toBe('invalid argument to $limit stage: Expected a number in: $limit: "2"')
    expect(JSON.stringify(info)).not.toContain('27017')
  })

  it('recognises the Java exception an empty aggregation result produces', () => {
    expect(parseServerError('Index 0 out of bounds for length 0')).toEqual({ kind: 'empty-result', message: 'Index 0 out of bounds for length 0' })
  })

  it('removes server addresses from any other message', () => {
    expect(parseServerError('Timed out while talking to the database on server 10.0.0.5:27017. Giving up').message).not.toMatch(/10\.0\.0\.5|27017/)
    expect(parseServerError('connect failed: 192.168.1.20:5455').message).not.toMatch(/192\.168|5455/)
    expect(parseServerError('connect failed: mongo-1.internal:27017 refused').message).not.toContain('27017')
  })

  it('leaves an ordinary message alone', () => {
    expect(parseServerError('Invalid value for: body')).toEqual({ kind: 'other', message: 'Invalid value for: body' })
  })

  it('never reports the address of a command failure even when the format is slightly off', () => {
    const info = parseServerError('Command failed with error 2 (BadValue): \'$where is not allowed\' on server 173.249.2.248:5455')
    expect(JSON.stringify(info)).not.toMatch(/173\.249|5455/)
  })
})

describe('ForbiddenPipelineError', () => {
  it('carries the findings and names the first operator', () => {
    const error = new ForbiddenPipelineError([{ stageIndex: 1, operator: '$function', path: '$addFields.x.$function' }])
    expect(error.findings).toHaveLength(1)
    expect(error.message).toContain('$function')
    expect(error).toBeInstanceOf(Error)
  })
})
