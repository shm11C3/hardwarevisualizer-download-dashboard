import { describe, expect, it } from 'vitest'
import { canonicalHref } from '../src/lib/canonical'
import { Layout } from '../src/views/Layout'

function envWith(canonicalOrigin?: string): CloudflareBindings {
  return { CANONICAL_ORIGIN: canonicalOrigin } as CloudflareBindings
}

describe('canonicalHref', () => {
  it('collapses every filtered view onto the unfiltered path', () => {
    const filtered = new URL('https://stats.example.com/?days=90&channel=all&scope=all&t=1734')
    expect(canonicalHref(envWith(), filtered)).toBe('https://stats.example.com/')
  })

  it('prefers the configured origin so a second hostname cannot self-canonicalise', () => {
    const workersDev = new URL('https://dashboard.workers.dev/?days=7')
    expect(canonicalHref(envWith('https://stats.example.com'), workersDev)).toBe(
      'https://stats.example.com/',
    )
  })

  it('ignores a path or trailing slash left on the configured origin', () => {
    const url = new URL('https://dashboard.workers.dev/')
    expect(canonicalHref(envWith('https://stats.example.com/dashboard/'), url)).toBe(
      'https://stats.example.com/',
    )
  })

  it('falls back to the request origin when the configured value is unusable', () => {
    const url = new URL('https://stats.example.com/?days=7')
    expect(canonicalHref(envWith('   '), url)).toBe('https://stats.example.com/')
    expect(canonicalHref(envWith('stats.example.com'), url)).toBe('https://stats.example.com/')
    expect(canonicalHref(envWith('javascript:alert(1)'), url)).toBe('https://stats.example.com/')
  })
})

describe('Layout canonical link', () => {
  it('renders the canonical link when one is given', async () => {
    const html = await Promise.resolve(
      <Layout stylesheet="/styles.css" canonical="https://stats.example.com/" />,
    ).then(String)
    expect(html).toContain('<link rel="canonical" href="https://stats.example.com/"/>')
  })

  it('omits the link on pages that name no canonical URL', async () => {
    const html = await Promise.resolve(<Layout stylesheet="/styles.css" />).then(String)
    expect(html).not.toContain('rel="canonical"')
  })
})
