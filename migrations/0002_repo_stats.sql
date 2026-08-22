CREATE TABLE repo_stats (
  stat_date TEXT PRIMARY KEY,
  stargazers INTEGER,
  forks INTEGER,
  views_count INTEGER,
  views_uniques INTEGER,
  clones_count INTEGER,
  clones_uniques INTEGER,
  updated_at TEXT NOT NULL
);
