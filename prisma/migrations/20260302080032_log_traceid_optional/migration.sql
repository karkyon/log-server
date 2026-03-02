-- DropForeignKey
ALTER TABLE "logs" DROP CONSTRAINT "logs_trace_id_fkey";

-- AlterTable
ALTER TABLE "logs" ALTER COLUMN "trace_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "logs" ADD CONSTRAINT "logs_trace_id_fkey" FOREIGN KEY ("trace_id") REFERENCES "traces"("id") ON DELETE SET NULL ON UPDATE CASCADE;
