// MongoCamp server 1.6.3 refuses a request URI longer than 2048 characters with a `414` that carries NO CORS
// headers, so in a browser it surfaces as an opaque network failure (brain/project/mongocamp-server-1-6-3-endpoints.md).
// A filter is sent in the query string; the rest of the URI (server URL, path, the other parameters) needs room too,
// so the URL-encoded filter gets a conservative budget instead of the full 2048.
export const MAX_ENCODED_FILTER_LENGTH = 1800

export function isFilterTooLong(filter: string | undefined): boolean {
  return filter !== undefined && encodeURIComponent(filter).length > MAX_ENCODED_FILTER_LENGTH
}
