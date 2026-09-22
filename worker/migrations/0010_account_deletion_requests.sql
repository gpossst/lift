CREATE TABLE account_deletion_requests (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'completed', 'rejected')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX account_deletion_requests_pending_email
  ON account_deletion_requests(email) WHERE status IN ('pending', 'verified');
