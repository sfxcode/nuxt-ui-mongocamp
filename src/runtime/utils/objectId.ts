// The server only accepts `_id` values it can turn into an ObjectId — a 24-character hex string —
// in inserts and in `_id` filters; anything else answers 500 "hexString has 24 characters".
const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/i

export function isObjectIdHex(value: unknown): value is string {
  return typeof value === 'string' && OBJECT_ID_PATTERN.test(value)
}
