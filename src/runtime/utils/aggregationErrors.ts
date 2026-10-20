import type { ForbiddenUse } from './aggregationPipeline'

// Thrown instead of sending a pipeline that uses a deny-listed operator. The server would run it.
export class ForbiddenPipelineError extends Error {
  constructor(public findings: ForbiddenUse[]) {
    super(`The pipeline uses ${findings[0]?.operator ?? 'a forbidden operator'}`)
    this.name = 'ForbiddenPipelineError'
  }
}

export interface ServerErrorInfo {
  // 'empty-result': the exception the server throws when an aggregation returns no documents at all
  kind: 'mongo' | 'empty-result' | 'other'
  message: string
}

// What the server answers when MongoDB rejects a command:
//   Command failed with error 15959 (Location15959): 'the match filter …' on server 173.249.2.248:5455. The full response is {…}
// The host and port are the database server's address, which must not reach the UI.
const MONGO_COMMAND_FAILED = /^Command failed with error \d+ \([^)]*\): '([\s\S]*?)' on server \S+?\.\s+The full response is[\s\S]*$/
const SERVER_ADDRESS = / on server \S+?(?=\.(?:\s|$)|\s|$)/g
const BARE_ADDRESS = /\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b|\b[a-z0-9-]+(?:\.[a-z0-9-]+)+:\d{2,5}\b/gi

// Reduces the server's `msg` to something showable: the MongoDB message alone for a failed command,
// a marker for the Java exception an empty result produces, otherwise the text with every
// address removed.
export function parseServerError(msg: string): ServerErrorInfo {
  const text = msg.trim()
  const command = MONGO_COMMAND_FAILED.exec(text)
  if (command) return { kind: 'mongo', message: command[1]!.trim() }
  if (/^Index 0 out of bounds for length 0$/.test(text)) return { kind: 'empty-result', message: text }
  return { kind: 'other', message: text.replace(SERVER_ADDRESS, '').replace(BARE_ADDRESS, '').replace(/\s{2,}/g, ' ').trim() }
}
