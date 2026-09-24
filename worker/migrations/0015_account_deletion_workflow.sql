DROP INDEX account_deletion_requests_pending_email;

ALTER TABLE account_deletion_requests RENAME TO account_deletion_requests_legacy;

CREATE TABLE account_deletion_requests (
  id TEXT PRIMARY KEY,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'completed', 'rejected')),
  verification_token_hash TEXT UNIQUE,
  verification_expires_at INTEGER,
  terminal_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

INSERT INTO account_deletion_requests (id, email, status, terminal_at, created_at, updated_at)
SELECT id, email, status,
  CASE WHEN status IN ('completed', 'rejected') THEN updated_at END,
  created_at, updated_at
FROM account_deletion_requests_legacy;

DROP TABLE account_deletion_requests_legacy;

CREATE UNIQUE INDEX account_deletion_requests_pending_email
  ON account_deletion_requests(email) WHERE status IN ('pending', 'verified');

CREATE TABLE account_deletion_request_events (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES account_deletion_requests(id),
  from_status TEXT CHECK (from_status IN ('pending', 'verified', 'completed', 'rejected')),
  to_status TEXT NOT NULL CHECK (to_status IN ('pending', 'verified', 'completed', 'rejected')),
  actor TEXT NOT NULL,
  reason TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (request_id, to_status)
);

CREATE INDEX account_deletion_request_events_request
  ON account_deletion_request_events(request_id, created_at);

INSERT INTO account_deletion_request_events
  (id, request_id, from_status, to_status, actor, reason, created_at)
SELECT lower(hex(randomblob(16))), id, NULL, status, 'migration', 'legacy_import', updated_at
FROM account_deletion_requests;
