import type { CollectionResult, GitHubRelease, GitHubReleaseAsset } from '../types'
import { classifyAsset } from './assets'
import { toDateKey } from './date'
import { fetchGitHubReleases } from './github'

const RELEASE_CHUNK_SIZE = 200
const ASSET_CHUNK_SIZE = 150
const SNAPSHOT_CHUNK_SIZE = 300

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

function releaseStatements(
  database: D1Database,
  releases: GitHubRelease[],
  capturedAt: string,
): D1PreparedStatement[] {
  return chunk(releases, RELEASE_CHUNK_SIZE).map((items) => {
    const rows = items.map((release) => ({
      id: release.id,
      tagName: release.tag_name,
      name: release.name,
      publishedAt: release.published_at ?? release.created_at ?? capturedAt,
      htmlUrl: release.html_url,
      prerelease: Number(release.prerelease),
      draft: Number(release.draft),
      lastSeenAt: capturedAt,
    }))

    return database
      .prepare(
        `
          INSERT INTO releases (
            id, tag_name, name, published_at, html_url, prerelease, draft, last_seen_at
          )
          SELECT
            CAST(json_extract(value, '$.id') AS INTEGER),
            json_extract(value, '$.tagName'),
            json_extract(value, '$.name'),
            json_extract(value, '$.publishedAt'),
            json_extract(value, '$.htmlUrl'),
            CAST(json_extract(value, '$.prerelease') AS INTEGER),
            CAST(json_extract(value, '$.draft') AS INTEGER),
            json_extract(value, '$.lastSeenAt')
          FROM json_each(?)
          WHERE true
          ON CONFLICT(id) DO UPDATE SET
            tag_name = excluded.tag_name,
            name = excluded.name,
            published_at = excluded.published_at,
            html_url = excluded.html_url,
            prerelease = excluded.prerelease,
            draft = excluded.draft,
            last_seen_at = excluded.last_seen_at
        `,
      )
      .bind(JSON.stringify(rows))
  })
}

interface AssetWithRelease {
  releaseId: number
  asset: GitHubReleaseAsset
}

function assetStatements(
  database: D1Database,
  assets: AssetWithRelease[],
  capturedAt: string,
): D1PreparedStatement[] {
  return chunk(assets, ASSET_CHUNK_SIZE).map((items) => {
    const rows = items.map(({ releaseId, asset }) => {
      const classification = classifyAsset(asset.name)
      return {
        id: asset.id,
        releaseId,
        name: asset.name,
        label: asset.label,
        contentType: asset.content_type,
        size: asset.size,
        browserDownloadUrl: asset.browser_download_url,
        platform: classification.platform,
        architecture: classification.architecture,
        kind: classification.kind,
        isSignature: Number(classification.isSignature),
        createdAt: asset.created_at,
        updatedAt: asset.updated_at,
        lastSeenAt: capturedAt,
      }
    })

    return database
      .prepare(
        `
          INSERT INTO assets (
            id, release_id, name, label, content_type, size, browser_download_url,
            platform, architecture, kind, is_signature, created_at, updated_at, last_seen_at
          )
          SELECT
            CAST(json_extract(value, '$.id') AS INTEGER),
            CAST(json_extract(value, '$.releaseId') AS INTEGER),
            json_extract(value, '$.name'),
            json_extract(value, '$.label'),
            json_extract(value, '$.contentType'),
            CAST(json_extract(value, '$.size') AS INTEGER),
            json_extract(value, '$.browserDownloadUrl'),
            json_extract(value, '$.platform'),
            json_extract(value, '$.architecture'),
            json_extract(value, '$.kind'),
            CAST(json_extract(value, '$.isSignature') AS INTEGER),
            json_extract(value, '$.createdAt'),
            json_extract(value, '$.updatedAt'),
            json_extract(value, '$.lastSeenAt')
          FROM json_each(?)
          WHERE true
          ON CONFLICT(id) DO UPDATE SET
            release_id = excluded.release_id,
            name = excluded.name,
            label = excluded.label,
            content_type = excluded.content_type,
            size = excluded.size,
            browser_download_url = excluded.browser_download_url,
            platform = excluded.platform,
            architecture = excluded.architecture,
            kind = excluded.kind,
            is_signature = excluded.is_signature,
            created_at = excluded.created_at,
            updated_at = excluded.updated_at,
            last_seen_at = excluded.last_seen_at
        `,
      )
      .bind(JSON.stringify(rows))
  })
}

function snapshotStatements(
  database: D1Database,
  assets: AssetWithRelease[],
  snapshotDate: string,
  capturedAt: string,
): D1PreparedStatement[] {
  return chunk(assets, SNAPSHOT_CHUNK_SIZE).map((items) => {
    const rows = items.map(({ asset }) => ({
      snapshotDate,
      capturedAt,
      assetId: asset.id,
      downloadCount: asset.download_count,
    }))

    return database
      .prepare(
        `
          INSERT INTO snapshots (snapshot_date, captured_at, asset_id, download_count)
          SELECT
            json_extract(value, '$.snapshotDate'),
            json_extract(value, '$.capturedAt'),
            CAST(json_extract(value, '$.assetId') AS INTEGER),
            CAST(json_extract(value, '$.downloadCount') AS INTEGER)
          FROM json_each(?)
          WHERE true
          ON CONFLICT(snapshot_date, asset_id) DO UPDATE SET
            captured_at = excluded.captured_at,
            download_count = excluded.download_count
        `,
      )
      .bind(JSON.stringify(rows))
  })
}

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 1_000)
}

export async function collectDownloads(
  env: CloudflareBindings,
  now = new Date(),
): Promise<CollectionResult> {
  const startedAt = now.toISOString()
  const timeZone = env.TIME_ZONE ?? 'Asia/Tokyo'
  const snapshotDate = toDateKey(now, timeZone)
  const runId = crypto.randomUUID()
  const startMs = Date.now()

  await env.DB.prepare(
    `INSERT INTO collection_runs (id, started_at, status, snapshot_date)
     VALUES (?, ?, 'running', ?)`,
  )
    .bind(runId, startedAt, snapshotDate)
    .run()

  try {
    const releases = await fetchGitHubReleases({
      owner: env.GITHUB_OWNER ?? 'shm11C3',
      repo: env.GITHUB_REPO ?? 'HardwareVisualizer',
      ...(env.GITHUB_TOKEN ? { token: env.GITHUB_TOKEN } : {}),
    })
    const assets = releases.flatMap((release) =>
      release.assets.map((asset) => ({ releaseId: release.id, asset })),
    )
    const capturedAt = new Date().toISOString()

    const statements = [
      ...releaseStatements(env.DB, releases, capturedAt),
      ...assetStatements(env.DB, assets, capturedAt),
      ...snapshotStatements(env.DB, assets, snapshotDate, capturedAt),
    ]

    if (statements.length > 0) {
      await env.DB.batch(statements)
    }

    // Deleted or temporarily missing release assets are carried forward. Without this,
    // replacing an asset would make the repository's cumulative total appear to decrease.
    await env.DB.prepare(
      `
        INSERT INTO snapshots (snapshot_date, captured_at, asset_id, download_count)
        SELECT ?, ?, a.id,
          COALESCE((
            SELECT previous.download_count
            FROM snapshots previous
            WHERE previous.asset_id = a.id
              AND previous.snapshot_date < ?
            ORDER BY previous.snapshot_date DESC
            LIMIT 1
          ), 0)
        FROM assets a
        WHERE NOT EXISTS (
          SELECT 1
          FROM snapshots current
          WHERE current.asset_id = a.id
            AND current.snapshot_date = ?
        )
      `,
    )
      .bind(snapshotDate, capturedAt, snapshotDate, snapshotDate)
      .run()

    const durationMs = Date.now() - startMs
    await env.DB.prepare(
      `
        UPDATE collection_runs
        SET finished_at = ?, status = 'success', fetched_releases = ?,
            fetched_assets = ?, duration_ms = ?, error_message = NULL
        WHERE id = ?
      `,
    )
      .bind(capturedAt, releases.length, assets.length, durationMs, runId)
      .run()

    return {
      runId,
      snapshotDate,
      capturedAt,
      releases: releases.length,
      assets: assets.length,
      durationMs,
    }
  } catch (error) {
    const finishedAt = new Date().toISOString()
    await env.DB.prepare(
      `
        UPDATE collection_runs
        SET finished_at = ?, status = 'failed', duration_ms = ?, error_message = ?
        WHERE id = ?
      `,
    )
      .bind(finishedAt, Date.now() - startMs, errorMessage(error), runId)
      .run()
    throw error
  }
}
