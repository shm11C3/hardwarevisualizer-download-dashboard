PRAGMA foreign_keys = ON;

-- tag_name is intentionally not UNIQUE. Deleting a GitHub release and recreating it
-- under the same tag yields a new release id, and the old row is kept so its assets
-- retain their recorded download history.
CREATE TABLE IF NOT EXISTS releases (
  id INTEGER PRIMARY KEY,
  tag_name TEXT NOT NULL,
  name TEXT,
  published_at TEXT NOT NULL,
  html_url TEXT NOT NULL,
  prerelease INTEGER NOT NULL DEFAULT 0 CHECK (prerelease IN (0, 1)),
  draft INTEGER NOT NULL DEFAULT 0 CHECK (draft IN (0, 1)),
  last_seen_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assets (
  id INTEGER PRIMARY KEY,
  release_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  label TEXT,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL CHECK (size >= 0),
  browser_download_url TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('windows', 'macos', 'linux', 'unknown')),
  architecture TEXT NOT NULL CHECK (
    architecture IN ('x64', 'arm64', 'x86', 'universal', 'unknown')
  ),
  kind TEXT NOT NULL CHECK (kind IN ('installer', 'updater', 'archive', 'metadata', 'other')),
  is_signature INTEGER NOT NULL DEFAULT 0 CHECK (is_signature IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  FOREIGN KEY (release_id) REFERENCES releases(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS snapshots (
  snapshot_date TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  asset_id INTEGER NOT NULL,
  download_count INTEGER NOT NULL CHECK (download_count >= 0),
  PRIMARY KEY (snapshot_date, asset_id),
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS collection_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'failed')),
  snapshot_date TEXT NOT NULL,
  fetched_releases INTEGER NOT NULL DEFAULT 0,
  fetched_assets INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_releases_published_at
  ON releases (published_at DESC);

CREATE INDEX IF NOT EXISTS idx_releases_tag_name
  ON releases (tag_name);

CREATE INDEX IF NOT EXISTS idx_assets_release_id
  ON assets (release_id);

CREATE INDEX IF NOT EXISTS idx_assets_dimensions
  ON assets (platform, kind, architecture);

CREATE INDEX IF NOT EXISTS idx_snapshots_asset_date
  ON snapshots (asset_id, snapshot_date);

CREATE INDEX IF NOT EXISTS idx_snapshots_date
  ON snapshots (snapshot_date);

CREATE INDEX IF NOT EXISTS idx_collection_runs_started_at
  ON collection_runs (started_at DESC);
