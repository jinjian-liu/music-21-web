CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE,
  password_hash text NOT NULL, display_name text NOT NULL, role text NOT NULL DEFAULT 'user',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE pieces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE, title text NOT NULL, author text, original_name text NOT NULL,
  object_key text NOT NULL, score_object_key text, size_bytes integer NOT NULL, status text NOT NULL DEFAULT 'uploading',
  duration_seconds integer, ppq integer, inferred_key text, track_count integer, rights_source text,
  rights_expires_at timestamptz, rights_confirmed boolean NOT NULL DEFAULT false, parse_error text,
  play_count integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE piece_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), piece_id uuid NOT NULL REFERENCES pieces(id) ON DELETE CASCADE,
  track_key text NOT NULL, order_index integer NOT NULL, name text NOT NULL, channel integer NOT NULL,
  program integer NOT NULL, instrument text NOT NULL, percussion boolean NOT NULL, note_count integer NOT NULL,
  range_low integer, range_high integer
);
CREATE TABLE parse_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), piece_id uuid NOT NULL UNIQUE REFERENCES pieces(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued', attempts integer NOT NULL DEFAULT 0, last_error text,
  available_at timestamptz NOT NULL DEFAULT now(), locked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), piece_id uuid NOT NULL REFERENCES pieces(id) ON DELETE CASCADE,
  reporter_email text NOT NULL, reason text NOT NULL, detail text, status text NOT NULL DEFAULT 'open', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE moderation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), piece_id uuid NOT NULL REFERENCES pieces(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES users(id), action text NOT NULL, reason text, metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pieces_gallery_idx ON pieces(status, created_at DESC);
CREATE INDEX reports_status_idx ON reports(status, created_at);
