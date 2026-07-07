-- Media processing pipeline (images)
CREATE TABLE IF NOT EXISTS "media_assets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "conversation_id" UUID,
    "source" TEXT NOT NULL DEFAULT 'conversation_upload',
    "media_type" TEXT NOT NULL,
    "mime_type" TEXT,
    "original_path" TEXT NOT NULL,
    "thumbnail_path" TEXT,
    "hash" TEXT,
    "size" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "duration" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'uploaded',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "media_processing_results" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "media_asset_id" UUID NOT NULL,
    "processing_mode" TEXT NOT NULL DEFAULT 'balanced',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "provider_versions" JSONB,
    "result_json" JSONB,
    "context_markdown_path" TEXT,
    "error" JSONB,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_processing_results_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "media_ocr_blocks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "media_asset_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "bbox" JSONB,
    "page" INTEGER NOT NULL DEFAULT 0,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_ocr_blocks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "media_layout_blocks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "media_asset_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "block_type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "bbox" JSONB,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_layout_blocks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "media_tags" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "media_asset_id" UUID NOT NULL,
    "tag" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,

    CONSTRAINT "media_tags_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "media_assets_project_id_idx" ON "media_assets"("project_id");
CREATE INDEX IF NOT EXISTS "media_assets_conversation_id_idx" ON "media_assets"("conversation_id");
CREATE INDEX IF NOT EXISTS "media_assets_hash_idx" ON "media_assets"("hash");
CREATE INDEX IF NOT EXISTS "media_processing_results_media_asset_id_idx" ON "media_processing_results"("media_asset_id");
CREATE INDEX IF NOT EXISTS "media_ocr_blocks_media_asset_id_idx" ON "media_ocr_blocks"("media_asset_id");
CREATE INDEX IF NOT EXISTS "media_layout_blocks_media_asset_id_idx" ON "media_layout_blocks"("media_asset_id");
CREATE INDEX IF NOT EXISTS "media_tags_media_asset_id_idx" ON "media_tags"("media_asset_id");
CREATE INDEX IF NOT EXISTS "media_tags_tag_idx" ON "media_tags"("tag");

ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "media_processing_results" ADD CONSTRAINT "media_processing_results_media_asset_id_fkey"
    FOREIGN KEY ("media_asset_id") REFERENCES "media_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "media_ocr_blocks" ADD CONSTRAINT "media_ocr_blocks_media_asset_id_fkey"
    FOREIGN KEY ("media_asset_id") REFERENCES "media_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "media_layout_blocks" ADD CONSTRAINT "media_layout_blocks_media_asset_id_fkey"
    FOREIGN KEY ("media_asset_id") REFERENCES "media_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "media_tags" ADD CONSTRAINT "media_tags_media_asset_id_fkey"
    FOREIGN KEY ("media_asset_id") REFERENCES "media_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
