-- CreateTable
CREATE TABLE "project_settings" (
    "project_id" TEXT NOT NULL,
    "log_level" TEXT NOT NULL DEFAULT 'INFO',
    "retention_days" INTEGER NOT NULL DEFAULT 90,
    "session_timeout" INTEGER NOT NULL DEFAULT 1800,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_settings_pkey" PRIMARY KEY ("project_id")
);

-- CreateTable
CREATE TABLE "screenshots" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "trace_id" TEXT NOT NULL,
    "feature_id" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "screenshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "console_logs" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "trace_id" TEXT NOT NULL,
    "feature_id" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "args" JSONB NOT NULL,
    "stack" TEXT,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "console_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patterns" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "screen_mode" TEXT,
    "seq_data" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT '未評価',
    "memo" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patterns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issues" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "trace_id" TEXT,
    "feature_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT '未対応',
    "description" TEXT,
    "log_ids" JSONB,
    "screenshot_ids" JSONB,
    "assigned_to_id" TEXT,
    "webhook_sent" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "issues_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "screenshots_project_id_trace_id_idx" ON "screenshots"("project_id", "trace_id");

-- CreateIndex
CREATE INDEX "console_logs_project_id_feature_id_idx" ON "console_logs"("project_id", "feature_id");

-- CreateIndex
CREATE INDEX "issues_project_id_feature_id_idx" ON "issues"("project_id", "feature_id");

-- CreateIndex
CREATE INDEX "issues_project_id_trace_id_idx" ON "issues"("project_id", "trace_id");

-- AddForeignKey
ALTER TABLE "project_settings" ADD CONSTRAINT "project_settings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screenshots" ADD CONSTRAINT "screenshots_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screenshots" ADD CONSTRAINT "screenshots_trace_id_fkey" FOREIGN KEY ("trace_id") REFERENCES "traces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "console_logs" ADD CONSTRAINT "console_logs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "console_logs" ADD CONSTRAINT "console_logs_trace_id_fkey" FOREIGN KEY ("trace_id") REFERENCES "traces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patterns" ADD CONSTRAINT "patterns_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_trace_id_fkey" FOREIGN KEY ("trace_id") REFERENCES "traces"("id") ON DELETE SET NULL ON UPDATE CASCADE;
