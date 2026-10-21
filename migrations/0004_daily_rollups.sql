-- Daily download totals pre-aggregated over the only dimensions the dashboard's
-- date series filter or group by. Rendering those series from snapshots read
-- every asset's row for every date on each request, which let a crawler walking
-- the filter combinations exhaust D1's daily read allowance. The collector keeps
-- this table in step with snapshots; see rollupStatements in src/lib/collector.ts,
-- whose rebuild query this backfill must match.
CREATE TABLE IF NOT EXISTS daily_rollups (
  snapshot_date TEXT NOT NULL,
  prerelease INTEGER NOT NULL CHECK (prerelease IN (0, 1)),
  kind TEXT NOT NULL,
  platform TEXT NOT NULL,
  update_manifest INTEGER NOT NULL CHECK (update_manifest IN (0, 1)),
  asset_count INTEGER NOT NULL,
  download_count INTEGER NOT NULL,
  PRIMARY KEY (snapshot_date, prerelease, kind, platform, update_manifest)
) WITHOUT ROWID;

INSERT INTO daily_rollups (
  snapshot_date, prerelease, kind, platform, update_manifest, asset_count, download_count
)
SELECT
  s.snapshot_date,
  r.prerelease,
  a.kind,
  a.platform,
  CASE WHEN LOWER(a.name) = 'latest.json' THEN 1 ELSE 0 END,
  COUNT(*),
  SUM(s.download_count)
FROM snapshots s
INNER JOIN assets a ON a.id = s.asset_id
INNER JOIN releases r ON r.id = a.release_id
WHERE r.draft = 0
GROUP BY 1, 2, 3, 4, 5;
