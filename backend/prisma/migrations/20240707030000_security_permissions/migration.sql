-- Project execution mode
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "execution_mode" TEXT NOT NULL DEFAULT 'developer';

-- Tool call approval tracking
ALTER TABLE "tool_calls" ADD COLUMN IF NOT EXISTS "approved_by" UUID;
ALTER TABLE "tool_calls" ADD COLUMN IF NOT EXISTS "approved_at" TIMESTAMP(3);

-- Immutable audit log
CREATE TABLE IF NOT EXISTS "tool_audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "conversation_id" UUID,
    "tool_call_id" UUID,
    "user_id" UUID,
    "tool_name" TEXT NOT NULL,
    "parameters" JSONB NOT NULL,
    "result" JSONB,
    "success" BOOLEAN,
    "execution_time" INTEGER,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "approved_by" UUID,
    "error_code" TEXT,
    "policy_blocked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tool_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "tool_audit_logs_project_id_idx" ON "tool_audit_logs"("project_id");
CREATE INDEX IF NOT EXISTS "tool_audit_logs_conversation_id_idx" ON "tool_audit_logs"("conversation_id");
