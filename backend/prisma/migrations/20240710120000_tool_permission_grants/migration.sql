-- CreateTable
CREATE TABLE "tool_permission_grants" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "conversation_id" UUID,
    "user_id" UUID,
    "tool_name" TEXT NOT NULL,
    "grant_type" TEXT NOT NULL,
    "scope_type" TEXT NOT NULL,
    "path_prefix" TEXT,
    "command_pattern" TEXT,
    "risk_level" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "tool_permission_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tool_permission_grants_project_id_tool_name_idx" ON "tool_permission_grants"("project_id", "tool_name");

-- CreateIndex
CREATE INDEX "tool_permission_grants_conversation_id_idx" ON "tool_permission_grants"("conversation_id");

-- CreateIndex
CREATE INDEX "tool_permission_grants_expires_at_idx" ON "tool_permission_grants"("expires_at");

-- AddForeignKey
ALTER TABLE "tool_permission_grants" ADD CONSTRAINT "tool_permission_grants_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
