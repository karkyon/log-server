-- CreateTable
CREATE TABLE "log_verdicts" (
    "id" TEXT NOT NULL,
    "log_id" TEXT NOT NULL,
    "verdict" TEXT NOT NULL DEFAULT 'OK',
    "issue_type" TEXT,
    "priority" TEXT,
    "status" TEXT,
    "content" TEXT,
    "memo" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "log_verdicts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "log_verdicts_log_id_key" ON "log_verdicts"("log_id");

-- AddForeignKey
ALTER TABLE "log_verdicts" ADD CONSTRAINT "log_verdicts_log_id_fkey" FOREIGN KEY ("log_id") REFERENCES "logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
