import { describe, expect, it } from 'vitest'
import { type AssetWithRelease, rollupsNeedFullRebuild } from '../src/lib/collector'
import type { GitHubRelease, GitHubReleaseAsset } from '../src/types'

function asset(id: number, name: string): GitHubReleaseAsset {
  return {
    id,
    name,
    label: null,
    content_type: 'application/octet-stream',
    size: 1,
    download_count: 0,
    browser_download_url: `https://example.com/${name}`,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
  }
}

function release(id: number, prerelease: boolean, assets: GitHubReleaseAsset[]): GitHubRelease {
  return {
    id,
    tag_name: `v${id}`,
    name: null,
    html_url: `https://example.com/v${id}`,
    draft: false,
    prerelease,
    published_at: '2026-08-01T00:00:00Z',
    assets,
  }
}

const installer = asset(11, 'HardwareVisualizer_1.0.0_x64-setup.exe')
const manifest = asset(12, 'latest.json')
const releases = [release(1, false, [installer, manifest])]
const assets: AssetWithRelease[] = [
  { releaseId: 1, asset: installer },
  { releaseId: 1, asset: manifest },
]
const storedReleases = [{ id: 1, prerelease: 0, draft: 0 }]
const storedAssets = [
  { id: 11, release_id: 1, name: installer.name, platform: 'windows', kind: 'installer' },
  { id: 12, release_id: 1, name: 'latest.json', platform: 'unknown', kind: 'metadata' },
]

describe('rollupsNeedFullRebuild', () => {
  it('rebuilds only the new date when nothing already stored changed', () => {
    expect(rollupsNeedFullRebuild(storedReleases, storedAssets, releases, assets)).toBe(false)
  })

  it('treats releases and assets seen for the first time as new dates only', () => {
    expect(rollupsNeedFullRebuild([], [], releases, assets)).toBe(false)
  })

  it('rebuilds every date when a release changes channel or draft state', () => {
    expect(
      rollupsNeedFullRebuild([{ id: 1, prerelease: 1, draft: 0 }], storedAssets, releases, assets),
    ).toBe(true)
    expect(
      rollupsNeedFullRebuild([{ id: 1, prerelease: 0, draft: 1 }], storedAssets, releases, assets),
    ).toBe(true)
  })

  it('rebuilds every date when an asset is reclassified or renamed to or from latest.json', () => {
    const reclassified = storedAssets.map((row) =>
      row.id === 11 ? { ...row, kind: 'other' } : row,
    )
    expect(rollupsNeedFullRebuild(storedReleases, reclassified, releases, assets)).toBe(true)

    const renamed = storedAssets.map((row) =>
      row.id === 12 ? { ...row, name: 'old-latest.json' } : row,
    )
    expect(rollupsNeedFullRebuild(storedReleases, renamed, releases, assets)).toBe(true)
  })

  it('rebuilds every date when an asset moves to another release', () => {
    const moved = storedAssets.map((row) => (row.id === 11 ? { ...row, release_id: 2 } : row))
    expect(rollupsNeedFullRebuild(storedReleases, moved, releases, assets)).toBe(true)
  })
})
