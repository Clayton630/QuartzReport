CREATE TABLE IF NOT EXISTS contributor_drafts (
  draft_id TEXT PRIMARY KEY,
  github_id TEXT NOT NULL,
  github_login TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_contributor_drafts_owner_updated
  ON contributor_drafts(github_id, updated_at DESC);
