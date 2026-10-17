/**
 * Escapes a field name for use before the `:` of a field query — a name like `first name` would otherwise
 * split into two tokens. Dots are left alone so MongoDB paths (`user.name`) keep working.
 */
export function escapeFieldName(name: string): string {
  return name.replace(/[+\-&|!(){}[\]^"~:\\/ *?]/g, '\\$&')
}
