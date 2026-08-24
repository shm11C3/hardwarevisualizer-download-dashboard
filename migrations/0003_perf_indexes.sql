-- The dashboard aggregations read only (snapshot_date, asset_id, download_count),
-- so covering indexes let SQLite answer them without touching snapshot rows.
-- Each replaces an existing index that was a strict prefix of the new one.
CREATE INDEX IF NOT EXISTS idx_snapshots_date_asset_count
  ON snapshots (snapshot_date, asset_id, download_count);

DROP INDEX IF EXISTS idx_snapshots_date;

CREATE INDEX IF NOT EXISTS idx_snapshots_asset_date_count
  ON snapshots (asset_id, snapshot_date, download_count);

DROP INDEX IF EXISTS idx_snapshots_asset_date;

-- Statistics decide whether the planner actually picks the covering indexes;
-- D1 recommends refreshing them right after creating an index. The daily
-- collector re-runs this as the data grows.
PRAGMA optimize;
