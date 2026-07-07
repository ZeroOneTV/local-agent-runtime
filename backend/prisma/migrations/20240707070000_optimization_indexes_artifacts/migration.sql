-- Optimization: indexes + tool result artifacts
ALTER TABLE "tool_results" ADD COLUMN IF NOT EXISTS "artifact_path" TEXT;

CREATE INDEX IF NOT EXISTS "messages_conversation_id_idx" ON "messages"("conversation_id");
CREATE INDEX IF NOT EXISTS "conversation_summaries_conversation_id_idx" ON "conversation_summaries"("conversation_id");
CREATE INDEX IF NOT EXISTS "files_project_id_idx" ON "files"("project_id");
CREATE INDEX IF NOT EXISTS "files_hash_idx" ON "files"("hash");
CREATE INDEX IF NOT EXISTS "file_chunks_file_id_idx" ON "file_chunks"("file_id");
CREATE INDEX IF NOT EXISTS "memories_project_id_idx" ON "memories"("project_id");
CREATE INDEX IF NOT EXISTS "memories_active_idx" ON "memories"("active");
CREATE INDEX IF NOT EXISTS "tool_calls_conversation_id_idx" ON "tool_calls"("conversation_id");
CREATE INDEX IF NOT EXISTS "jobs_status_idx" ON "jobs"("status");
CREATE INDEX IF NOT EXISTS "jobs_type_idx" ON "jobs"("type");
CREATE INDEX IF NOT EXISTS "jobs_project_id_idx" ON "jobs"("project_id");
