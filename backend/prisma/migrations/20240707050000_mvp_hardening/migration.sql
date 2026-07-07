-- MVP hardening: job result/error/started_at
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "result" JSONB;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "error" JSONB;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "started_at" TIMESTAMP(3);
