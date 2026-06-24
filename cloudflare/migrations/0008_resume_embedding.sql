-- Per-user resume embeddings — Phase 6 (cosine pre-filter).
--
-- We embed the user's resume + target_roles + must_have_skills with the same
-- bge-m3 model used for jobs (1024-dim, packed as little-endian float32 BLOB).
-- Stored on user_profiles so it lives and dies with the profile row; cleared
-- automatically when a user is deleted.
--
-- Re-embedded inline by Worker on PUT /api/profile when any of the source
-- fields change. NULL = "not yet embedded" (fall back to LLM-score sort).

ALTER TABLE user_profiles ADD COLUMN resume_embedding BLOB;
ALTER TABLE user_profiles ADD COLUMN resume_embedding_updated_at TEXT;
ALTER TABLE user_profiles ADD COLUMN resume_embedding_model TEXT;
