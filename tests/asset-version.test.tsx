import { describe, expect, it, vi } from 'vitest'
import { Layout } from '../src/views/Layout'

function envWith(assets: Partial<Fetcher>): CloudflareBindings {
  return { ASSETS: assets as Fetcher } as CloudflareBindings
}

function assetsReturning(headers: Record<string, string>): CloudflareBindings {
  return envWith({
    fetch: (async () => new Response('body', { headers })) as Fetcher['fetch'],
  })
}

// The version is memoised per isolate, so each case needs its own module
// instance rather than one primed by whichever test ran first.
async function freshStylesheetHref() {
  vi.resetModules()
  return (await import('../src/lib/asset-version')).stylesheetHref
}

describe('stylesheetHref', () => {
  it('versions the stylesheet with the asset content hash', async () => {
    const stylesheetHref = await freshStylesheetHref()
    const env = assetsReturning({ ETag: '"a1b2c3d4e5f6"' })
    expect(await stylesheetHref(env, 'https://example.com')).toBe('/styles.css?v=a1b2c3d4e5f6')
  })

  it('strips weak validators and characters that do not belong in a URL', async () => {
    const stylesheetHref = await freshStylesheetHref()
    const env = assetsReturning({ ETag: 'W/"a1b2-c3/d4+e5"' })
    expect(await stylesheetHref(env, 'https://example.com')).toBe('/styles.css?v=a1b2c3d4e5')
  })

  it('falls back to the bare path rather than failing the render', async () => {
    const stylesheetHref = await freshStylesheetHref()
    const missing = assetsReturning({})
    expect(await stylesheetHref(missing, 'https://example.com')).toBe('/styles.css')

    const throwing = envWith({
      fetch: (() => {
        throw new Error('assets unavailable')
      }) as Fetcher['fetch'],
    })
    expect(await stylesheetHref(throwing, 'https://example.com')).toBe('/styles.css')
  })
})

describe('Layout', () => {
  // A stylesheet served from a stable URL is how the control panel once shipped
  // new markup to browsers still holding the previous CSS.
  it('links the stylesheet it is given rather than a fixed path', async () => {
    const html = await Promise.resolve(<Layout stylesheet="/styles.css?v=deadbeef" />).then(String)
    expect(html).toContain('<link rel="stylesheet" href="/styles.css?v=deadbeef"/>')
    expect(html).not.toContain('href="/styles.css"')
  })
})
