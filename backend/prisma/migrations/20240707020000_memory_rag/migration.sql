-- AlterTable: files - novos campos RAG
ALTER TABLE "files" ADD COLUMN IF NOT EXISTS "document_type" TEXT;
ALTER TABLE "files" ADD COLUMN IF NOT EXISTS "priority" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "files" ADD COLUMN IF NOT EXISTS "embedding_model" TEXT;
ALTER TABLE "files" ADD COLUMN IF NOT EXISTS "chunk_config_hash" TEXT;
ALTER TABLE "files" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);

-- Unique constraint project + path (remove duplicates first if any)
DELETE FROM "files" a USING "files" b
WHERE a.id > b.id AND a.project_id = b.project_id AND a.path = b.path;

CREATE UNIQUE INDEX IF NOT EXISTS "files_project_id_path_key" ON "files"("project_id", "path");

-- AlterTable: memories - origin e active
ALTER TABLE "memories" ADD COLUMN IF NOT EXISTS "origin" TEXT NOT NULL DEFAULT 'user_confirmation';
ALTER TABLE "memories" ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable: memory_history
CREATE TABLE IF NOT EXISTS "memory_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "memory_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "previous_title" TEXT,
    "previous_content" TEXT,
    "new_title" TEXT,
    "new_content" TEXT,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memory_history_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "memory_history" DROP CONSTRAINT IF EXISTS "memory_history_memory_id_fkey";
ALTER TABLE "memory_history" ADD CONSTRAINT "memory_history_memory_id_fkey"
    FOREIGN KEY ("memory_id") REFERENCES "memories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: file_deletion_audit
CREATE TABLE IF NOT EXISTS "file_deletion_audit" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "file_path" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "hash" TEXT,
    "deleted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_deletion_audit_pkey" PRIMARY KEY ("id")
);
