-- Orchestrator events
CREATE TABLE IF NOT EXISTS "orchestrator_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "conversation_id" UUID,
    "type" TEXT NOT NULL,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orchestrator_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "orchestrator_events_conversation_id_idx" ON "orchestrator_events"("conversation_id");
CREATE INDEX IF NOT EXISTS "orchestrator_events_project_id_idx" ON "orchestrator_events"("project_id");
