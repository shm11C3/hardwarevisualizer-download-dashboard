import type { GitHubRelease } from '../types'

const RELEASES_PER_PAGE = 100
const MAX_PAGES = 10

export interface GitHubClientOptions {
  owner: string
  repo: string
  token?: string
}

function createHeaders(token?: string): Headers {
  const headers = new Headers({
    Accept: 'application/vnd.github+json',
    'User-Agent': 'HardwareVisualizer-download-dashboard',
    'X-GitHub-Api-Version': '2026-03-10',
  })

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  return headers
}

function rateLimitMessage(response: Response): string {
  const remaining = response.headers.get('x-ratelimit-remaining')
  const reset = response.headers.get('x-ratelimit-reset')

  if (remaining !== '0' || !reset) {
    return ''
  }

  const resetAt = new Date(Number(reset) * 1000).toISOString()
  return ` GitHub API rate limit resets at ${resetAt}.`
}

export async function fetchGitHubReleases(options: GitHubClientOptions): Promise<GitHubRelease[]> {
  const releases: GitHubRelease[] = []
  const headers = createHeaders(options.token)

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = new URL(`https://api.github.com/repos/${options.owner}/${options.repo}/releases`)
    url.searchParams.set('per_page', String(RELEASES_PER_PAGE))
    url.searchParams.set('page', String(page))

    const response = await fetch(url, { headers })
    if (!response.ok) {
      const responseBody = await response.text()
      throw new Error(
        `GitHub Releases API returned ${response.status}: ${responseBody.slice(0, 300)}.${rateLimitMessage(response)}`,
      )
    }

    const pageItems: unknown = await response.json()
    if (!Array.isArray(pageItems)) {
      throw new Error('GitHub Releases API returned an unexpected response shape')
    }

    const typedPageItems = pageItems as GitHubRelease[]
    releases.push(...typedPageItems.filter((release) => !release.draft))

    if (typedPageItems.length < RELEASES_PER_PAGE) {
      break
    }
  }

  return releases
}
