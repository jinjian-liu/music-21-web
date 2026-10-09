ALTER TABLE practice_sessions DROP CONSTRAINT practice_sessions_mode_check;
ALTER TABLE practice_sessions ADD CONSTRAINT practice_sessions_mode_check
  CHECK (mode IN ('practice', 'single-note', 'step'));
ALTER TABLE practice_sessions ADD CONSTRAINT practice_sessions_step_feedback_check
  CHECK (mode <> 'step' OR (matched IS NULL AND attempted IS NULL));
