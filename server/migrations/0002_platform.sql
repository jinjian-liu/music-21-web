ALTER TABLE pieces ADD COLUMN parse_status text NOT NULL DEFAULT 'uploading';
ALTER TABLE pieces ADD COLUMN publication_status text NOT NULL DEFAULT 'private';
ALTER TABLE pieces ADD COLUMN client_id text;
ALTER TABLE pieces ADD COLUMN deleted_at timestamptz;
ALTER TABLE pieces ADD COLUMN review_reason text;
UPDATE pieces SET parse_status = CASE WHEN status='uploading' THEN 'uploading' WHEN status='parsing' THEN 'queued' WHEN status='failed' THEN 'failed' ELSE 'ready' END,
publication_status = CASE WHEN status IN ('pending_review','published','rejected','removed') THEN status ELSE 'private' END;
ALTER TABLE pieces ADD CONSTRAINT pieces_parse_state CHECK(parse_status IN ('uploading','queued','processing','ready','failed'));
ALTER TABLE pieces ADD CONSTRAINT pieces_publication_state CHECK(publication_status IN ('private','pending_review','published','rejected','removed'));
CREATE UNIQUE INDEX pieces_owner_client ON pieces(owner_id,client_id) WHERE client_id IS NOT NULL;
CREATE INDEX pieces_owner_created ON pieces(owner_id,created_at DESC);
CREATE INDEX pieces_public_created ON pieces(publication_status,created_at DESC);
ALTER TABLE parse_jobs ADD COLUMN lock_token uuid;
UPDATE parse_jobs SET status='queued', locked_at=NULL WHERE status='processing';
CREATE INDEX jobs_ready ON parse_jobs(status,available_at);
CREATE TABLE practice_sessions (
 id uuid NOT NULL, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 piece_id text NOT NULL, title text NOT NULL, mode text NOT NULL CHECK(mode IN ('practice','single-note')),
 target_track_id text, started_at timestamptz NOT NULL, ended_at timestamptz NOT NULL,
 active_ms integer NOT NULL CHECK(active_ms>=0), matched integer, attempted integer,
 PRIMARY KEY(user_id,id), CHECK(ended_at>=started_at),
 CHECK((matched IS NULL AND attempted IS NULL) OR (matched>=0 AND attempted>=matched))
);
CREATE INDEX practice_user_started ON practice_sessions(user_id,started_at DESC);
CREATE TABLE user_settings (user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, audio jsonb NOT NULL DEFAULT '{"volume":72,"resonance":34,"tone":"grand"}');
CREATE TABLE storage_cleanup (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), piece_id uuid NOT NULL UNIQUE REFERENCES pieces(id) ON DELETE CASCADE,
 attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(), last_error text
);
