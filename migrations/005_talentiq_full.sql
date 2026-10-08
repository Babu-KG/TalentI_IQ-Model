CREATE TABLE IF NOT EXISTS resume_files (id BIGSERIAL PRIMARY KEY, user_id TEXT NOT NULL, file_name TEXT NOT NULL, storage_key TEXT NOT NULL, mime_type TEXT NOT NULL, size_bytes INTEGER DEFAULT 0, created_at TIMESTAMP NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS idx_resume_files_user ON resume_files(user_id);

CREATE TABLE IF NOT EXISTS skill_catalog (id BIGSERIAL PRIMARY KEY, skill TEXT UNIQUE NOT NULL, category TEXT NOT NULL DEFAULT 'technical', aliases JSONB DEFAULT '[]');

CREATE TABLE IF NOT EXISTS job_applications (id BIGSERIAL PRIMARY KEY, job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE, student_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'matched', match_score INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMP NOT NULL DEFAULT now(), UNIQUE(job_id,student_id));
CREATE INDEX IF NOT EXISTS idx_app_student ON job_applications(student_id);

CREATE TABLE IF NOT EXISTS whatif_runs (id BIGSERIAL PRIMARY KEY, student_id TEXT NOT NULL, job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE, added_skills JSONB DEFAULT '[]', score_before INTEGER NOT NULL, score_after INTEGER NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS recommendations (id BIGSERIAL PRIMARY KEY, student_id TEXT NOT NULL, job_id UUID REFERENCES jobs(id) ON DELETE CASCADE, recommendation TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'local', created_at TIMESTAMP NOT NULL DEFAULT now());