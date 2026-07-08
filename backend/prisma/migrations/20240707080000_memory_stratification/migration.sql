-- Extend consolidated memories
ALTER TABLE "memories" ADD COLUMN IF NOT EXISTS "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1;
ALTER TABLE "memories" ADD COLUMN IF NOT EXISTS "source_type" TEXT;
ALTER TABLE "memories" ADD COLUMN IF NOT EXISTS "source_ref" TEXT;
ALTER TABLE "memories" ADD COLUMN IF NOT EXISTS "last_accessed_at" TIMESTAMP(3);
ALTER TABLE "memories" ADD COLUMN IF NOT EXISTS "access_count" INTEGER NOT NULL DEFAULT 0;

-- Recent memory
CREATE TABLE "recent_memory_items" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "conversation_id" UUID,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "summary" TEXT,
    "source_type" TEXT NOT NULL,
    "source_ref" TEXT,
    "importance" INTEGER NOT NULL DEFAULT 3,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "status" TEXT NOT NULL DEFAULT 'active',
    "expires_at" TIMESTAMP(3),
    "promoted_to_memory_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_accessed_at" TIMESTAMP(3),
    "access_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "recent_memory_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "recent_memory_items_project_id_idx" ON "recent_memory_items"("project_id");
CREATE INDEX "recent_memory_items_conversation_id_idx" ON "recent_memory_items"("conversation_id");
CREATE INDEX "recent_memory_items_status_idx" ON "recent_memory_items"("status");
CREATE INDEX "recent_memory_items_expires_at_idx" ON "recent_memory_items"("expires_at");

ALTER TABLE "recent_memory_items" ADD CONSTRAINT "recent_memory_items_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Deep memory
CREATE TABLE "deep_memory_items" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "content_preview" TEXT,
    "source_type" TEXT NOT NULL,
    "source_ref" TEXT,
    "artifact_path" TEXT,
    "context_path" TEXT,
    "document_type" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "entities" JSONB,
    "embedding_status" TEXT NOT NULL DEFAULT 'not_indexed',
    "embedding_model" TEXT,
    "chunk_config_hash" TEXT,
    "importance" INTEGER NOT NULL DEFAULT 2,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.6,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_accessed_at" TIMESTAMP(3),
    "access_count" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "deep_memory_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "deep_memory_items_project_id_idx" ON "deep_memory_items"("project_id");
CREATE INDEX "deep_memory_items_embedding_status_idx" ON "deep_memory_items"("embedding_status");
CREATE INDEX "deep_memory_items_archived_at_idx" ON "deep_memory_items"("archived_at");

ALTER TABLE "deep_memory_items" ADD CONSTRAINT "deep_memory_items_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Cold archive index
CREATE TABLE "archive_items" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "archive_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "storage_path" TEXT NOT NULL,
    "manifest_ref" TEXT,
    "checksum" TEXT,
    "size_bytes" INTEGER,
    "compressed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "restored_at" TIMESTAMP(3),

    CONSTRAINT "archive_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "archive_items_project_id_idx" ON "archive_items"("project_id");
CREATE INDEX "archive_items_archive_type_idx" ON "archive_items"("archive_type");

ALTER TABLE "archive_items" ADD CONSTRAINT "archive_items_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Access logs
CREATE TABLE "memory_access_logs" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "conversation_id" UUID,
    "memory_layer" TEXT NOT NULL,
    "memory_ref_id" UUID NOT NULL,
    "query" TEXT,
    "score" DOUBLE PRECISION,
    "reason" TEXT,
    "accessed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memory_access_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "memory_access_logs_project_id_idx" ON "memory_access_logs"("project_id");
CREATE INDEX "memory_access_logs_memory_layer_idx" ON "memory_access_logs"("memory_layer");

ALTER TABLE "memory_access_logs" ADD CONSTRAINT "memory_access_logs_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Export/import/backup records
CREATE TABLE "memory_portability_records" (
    "id" UUID NOT NULL,
    "project_id" UUID,
    "record_type" TEXT NOT NULL,
    "profile" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "file_path" TEXT,
    "manifest" JSONB,
    "report" JSONB,
    "error" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "memory_portability_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "memory_portability_records_project_id_idx" ON "memory_portability_records"("project_id");
CREATE INDEX "memory_portability_records_record_type_idx" ON "memory_portability_records"("record_type");
CREATE INDEX "memory_portability_records_status_idx" ON "memory_portability_records"("status");

ALTER TABLE "memory_portability_records" ADD CONSTRAINT "memory_portability_records_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
