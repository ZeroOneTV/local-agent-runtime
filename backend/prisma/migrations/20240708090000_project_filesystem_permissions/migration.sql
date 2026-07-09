-- CreateTable
CREATE TABLE "project_filesystem_permissions" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "mode" TEXT NOT NULL,
    "host_prefix" TEXT NOT NULL,
    "container_prefix" TEXT,
    "access_level" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_filesystem_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_filesystem_permissions_project_id_idx" ON "project_filesystem_permissions"("project_id");

-- AddForeignKey
ALTER TABLE "project_filesystem_permissions" ADD CONSTRAINT "project_filesystem_permissions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
