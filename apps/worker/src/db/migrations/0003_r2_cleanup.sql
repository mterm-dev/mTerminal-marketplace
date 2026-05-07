CREATE TABLE IF NOT EXISTS pending_r2_cleanup (
  key TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  retries INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_pending_r2_cleanup_retries ON pending_r2_cleanup(retries, created_at);
