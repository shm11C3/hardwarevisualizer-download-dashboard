// styles.css lives at a stable path, so changing its contents would otherwise
// reach browsers that still hold the previous copy until their cache expires —
// they would get new markup styled by an old stylesheet. Workers Assets already
// computes a content hash per file and returns it as the ETag, so the stylesheet
// link carries that hash as a version token: the URL changes exactly when the
// bytes change, and never otherwise.

const STYLESHEET_PATH = '/styles.css'

let cachedVersion: string | null = null

async function readAssetVersion(env: CloudflareBindings, origin: string): Promise<string | null> {
  try {
    const response = await env.ASSETS.fetch(new URL(STYLESHEET_PATH, origin))
    // Nothing here needs the file itself, only the hash in its headers.
    await response.body?.cancel()
    const etag = response.headers.get('ETag')
    if (!etag) return null
    const token = etag.replace(/^W\//, '').replace(/[^A-Za-z0-9]/g, '')
    return token ? token.slice(0, 32) : null
  } catch {
    // A missing token only costs cache busting, so fall back to the plain path
    // rather than failing the page render.
    return null
  }
}

export async function stylesheetHref(env: CloudflareBindings, origin: string): Promise<string> {
  // Only a successful lookup is memoised, so a transient failure is retried
  // rather than pinned for the lifetime of the isolate.
  cachedVersion ??= await readAssetVersion(env, origin)
  return cachedVersion ? `${STYLESHEET_PATH}?v=${cachedVersion}` : STYLESHEET_PATH
}
