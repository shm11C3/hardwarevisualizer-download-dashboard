import type { GitHubRelease } from '../types'

const RELEASES_PER_PAGE = 100
const MAX_PAGES = 10

export interface GitHubClientOptions {
  owner: string
  repo: string
  token?: string
}

export interface GitHubRepositoryStats {
  stargazers: number
  forks: number
}

export interface GitHubTrafficDay {
  timestamp: string
  count: number
  uniques: number
}

export type GitHubTrafficKind = 'views' | 'clones'

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

async function responseError(response: Response, apiName: string): Promise<Error> {
  const responseBody = await response.text()
  return new Error(
    `${apiName} returned ${response.status}: ${responseBody.slice(0, 300)}.${rateLimitMessage(response)}`,
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
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

export async function fetchGitHubRepositoryStats(
  options: GitHubClientOptions,
): Promise<GitHubRepositoryStats> {
  const url = new URL(`https://api.github.com/repos/${options.owner}/${options.repo}`)
  const response = await fetch(url, { headers: createHeaders(options.token) })
  if (!response.ok) {
    throw await responseError(response, 'GitHub Repository API')
  }

  const body: unknown = await response.json()
  if (
    !isRecord(body) ||
    !isNonNegativeInteger(body.stargazers_count) ||
    !isNonNegativeInteger(body.forks_count)
  ) {
    throw new Error('GitHub Repository API returned an unexpected response shape')
  }

  return { stargazers: body.stargazers_count, forks: body.forks_count }
}

export async function fetchGitHubTraffic(
  options: GitHubClientOptions,
  kind: GitHubTrafficKind,
): Promise<GitHubTrafficDay[]> {
  const url = new URL(
    `https://api.github.com/repos/${options.owner}/${options.repo}/traffic/${kind}`,
  )
  const response = await fetch(url, { headers: createHeaders(options.token) })
  if (!response.ok) {
    throw await responseError(response, `GitHub Traffic ${kind} API`)
  }

  const body: unknown = await response.json()
  if (!isRecord(body) || !Array.isArray(body[kind])) {
    throw new Error(`GitHub Traffic ${kind} API returned an unexpected response shape`)
  }

  return body[kind].map((item) => {
    if (
      !isRecord(item) ||
      typeof item.timestamp !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T/.test(item.timestamp) ||
      !isNonNegativeInteger(item.count) ||
      !isNonNegativeInteger(item.uniques)
    ) {
      throw new Error(`GitHub Traffic ${kind} API returned an unexpected response shape`)
    }
    return { timestamp: item.timestamp, count: item.count, uniques: item.uniques }
  })
}
