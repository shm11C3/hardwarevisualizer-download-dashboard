// The Worker now renders `/` itself, and `public/_headers` only applies to files
// served straight from the Assets binding. Anything the Worker returns has to
// carry these headers on its own, so they live here and are applied explicitly.
// Keep the values in sync with `public/_headers`, which still covers the CSS,
// icons, and manifest that Assets serves without touching the Worker.

export const BASELINE_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
}

// The two script hashes cover the Google tag snippets that the Cloudflare zone
// injects into HTML responses; the page itself ships no inline or bundled script.
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' https://static.cloudflareinsights.com https://*.googletagmanager.com 'sha256-2hSB/tWr8XqVgapn5Nk9JhCboziYiTl3N+rdsByWSPc=' 'sha256-bGSVHoMEJKsgXk/66rgtBJc6YaOnmGNN54yqJW2tBjA='",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://*.google-analytics.com https://*.googletagmanager.com",
  "connect-src 'self' https://cloudflareinsights.com https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com",
  "font-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

export const DOCUMENT_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  ...BASELINE_SECURITY_HEADERS,
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
}
