CREATE TABLE IF NOT EXISTS contributor_profiles (
  github_id TEXT PRIMARY KEY,
  github_login TEXT NOT NULL,
  display_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  links_json TEXT NOT NULL DEFAULT '[]',
  photo_type TEXT,
  photo_base64 TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_contributor_profiles_github_login
  ON contributor_profiles(github_login);
