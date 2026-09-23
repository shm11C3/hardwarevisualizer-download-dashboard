// Every filter combination the dashboard offers is a separate URL — `?days=…`,
// `?channel=…`, `?scope=…`, one or more `?traffic=…` series values, plus the
// refresh nonce `?t=…` — and all of them render the same document with the same
// title and description. Search Console reports them as duplicates of `/`, so
// each page states which single URL it wants indexed.
//
// The origin comes from the request, which is right as long as the site answers
// on one hostname. A deployment reachable both on its workers.dev subdomain and
// on a custom domain has to set CANONICAL_ORIGIN to the host that should be
// indexed: otherwise each host canonicalises to itself and the duplicates
// survive.

const CANONICAL_PATH = '/'

function canonicalOrigin(env: CloudflareBindings, requestUrl: URL): string {
  const configured = env.CANONICAL_ORIGIN?.trim()
  if (!configured) return requestUrl.origin

  try {
    const parsed = new URL(configured)
    // A mistyped variable should not point every page at somewhere unreachable,
    // so anything that is not an http(s) origin falls back to the request.
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return requestUrl.origin
    return parsed.origin
  } catch {
    return requestUrl.origin
  }
}

/**
 * Absolute URL that every filtered view of the dashboard declares as canonical.
 * The filters are views of one dataset rather than distinct pages, so they all
 * collapse onto the unfiltered path.
 */
export function canonicalHref(env: CloudflareBindings, requestUrl: URL): string {
  return new URL(CANONICAL_PATH, canonicalOrigin(env, requestUrl)).toString()
}
