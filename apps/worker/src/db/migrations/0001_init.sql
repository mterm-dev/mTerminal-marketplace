CREATE TABLE IF NOT EXISTS authors (
  id TEXT PRIMARY KEY,
  github_login TEXT NOT NULL UNIQUE,
  github_user_id INTEGER,
  api_key_hash TEXT NOT NULL,
  banned INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS public_keys (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
  pubkey_b64 TEXT NOT NULL,
  name TEXT,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_public_keys_author ON public_keys(author_id);

CREATE TABLE IF NOT EXISTS extensions (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL REFERENCES authors(id) ON DELETE RESTRICT,
  display_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'other',
  icon_url TEXT,
  homepage_url TEXT,
  repo_url TEXT,
  latest_version TEXT NOT NULL DEFAULT '',
  curated INTEGER NOT NULL DEFAULT 0,
  recommended INTEGER NOT NULL DEFAULT 0,
  download_total INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_extensions_category ON extensions(category);
CREATE INDEX IF NOT EXISTS idx_extensions_recommended ON extensions(recommended);
CREATE INDEX IF NOT EXISTS idx_extensions_author ON extensions(author_id);

CREATE TABLE IF NOT EXISTS versions (
  ext_id TEXT NOT NULL REFERENCES extensions(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  api_range TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  signature_b64 TEXT NOT NULL,
  key_id TEXT NOT NULL REFERENCES public_keys(id) ON DELETE RESTRICT,
  manifest_json TEXT NOT NULL,
  capabilities TEXT NOT NULL DEFAULT '[]',
  readme_md TEXT,
  yanked INTEGER NOT NULL DEFAULT 0,
  published_at INTEGER NOT NULL,
  PRIMARY KEY (ext_id, version)
);

CREATE INDEX IF NOT EXISTS idx_versions_published ON versions(published_at);

CREATE TABLE IF NOT EXISTS ratings (
  ext_id TEXT NOT NULL REFERENCES extensions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  user_login TEXT NOT NULL,
  stars INTEGER NOT NULL,
  comment TEXT,
  helpful INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (ext_id, user_id)
);

CREATE TABLE IF NOT EXISTS downloads (
  ext_id TEXT NOT NULL,
  version TEXT NOT NULL,
  day TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ext_id, version, day)
);

CREATE VIEW IF NOT EXISTS v_extension_stats AS
  SELECT
    e.id AS ext_id,
    COALESCE(AVG(r.stars), 0) AS avg_stars,
    COALESCE(COUNT(r.stars), 0) AS rating_count
  FROM extensions e
  LEFT JOIN ratings r ON r.ext_id = e.id
  GROUP BY e.id;
