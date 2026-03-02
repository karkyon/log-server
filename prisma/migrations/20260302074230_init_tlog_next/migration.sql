/*
  Warnings:

  - The values [VIEWER] on the enum `UserRole` will be removed. If these variants are still used in the database, this will fail.
  - The primary key for the `logs` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `featureId` on the `logs` table. All the data in the column will be lost.
  - You are about to drop the column `projectId` on the `logs` table. All the data in the column will be lost.
  - You are about to drop the column `savedAt` on the `logs` table. All the data in the column will be lost.
  - You are about to drop the column `traceId` on the `logs` table. All the data in the column will be lost.
  - You are about to drop the column `ts` on the `logs` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `logs` table. All the data in the column will be lost.
  - The primary key for the `project_members` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `joinedAt` on the `project_members` table. All the data in the column will be lost.
  - You are about to drop the column `projectId` on the `project_members` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `project_members` table. All the data in the column will be lost.
  - The `role` column on the `project_members` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `projects` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `apiKey` on the `projects` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `projects` table. All the data in the column will be lost.
  - You are about to drop the column `createdById` on the `projects` table. All the data in the column will be lost.
  - You are about to drop the column `isActive` on the `projects` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `projects` table. All the data in the column will be lost.
  - The primary key for the `users` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `createdAt` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `displayName` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `isActive` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `passwordHash` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `users` table. All the data in the column will be lost.
  - You are about to drop the `console_logs` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `issues` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `patterns` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `screens` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `screenshots` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `verdicts` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[project_id,user_id]` on the table `project_members` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `event_type` to the `logs` table without a default value. This is not possible if the table is not empty.
  - Added the required column `trace_id` to the `logs` table without a default value. This is not possible if the table is not empty.
  - The required column `id` was added to the `project_members` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.
  - Added the required column `project_id` to the `project_members` table without a default value. This is not possible if the table is not empty.
  - Added the required column `user_id` to the `project_members` table without a default value. This is not possible if the table is not empty.
  - Added the required column `created_by_id` to the `projects` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `projects` table without a default value. This is not possible if the table is not empty.
  - Added the required column `display_name` to the `users` table without a default value. This is not possible if the table is not empty.
  - Added the required column `password_hash` to the `users` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `users` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "TraceStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'TIMEOUT', 'ERROR');

-- AlterEnum
BEGIN;
CREATE TYPE "UserRole_new" AS ENUM ('ADMIN', 'MEMBER');
ALTER TABLE "public"."users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "role" TYPE "UserRole_new" USING ("role"::text::"UserRole_new");
ALTER TYPE "UserRole" RENAME TO "UserRole_old";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
DROP TYPE "public"."UserRole_old";
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'MEMBER';
COMMIT;

-- DropForeignKey
ALTER TABLE "console_logs" DROP CONSTRAINT "console_logs_projectId_fkey";

-- DropForeignKey
ALTER TABLE "issues" DROP CONSTRAINT "issues_createdById_fkey";

-- DropForeignKey
ALTER TABLE "issues" DROP CONSTRAINT "issues_projectId_fkey";

-- DropForeignKey
ALTER TABLE "issues" DROP CONSTRAINT "issues_updatedById_fkey";

-- DropForeignKey
ALTER TABLE "logs" DROP CONSTRAINT "logs_projectId_fkey";

-- DropForeignKey
ALTER TABLE "patterns" DROP CONSTRAINT "patterns_createdById_fkey";

-- DropForeignKey
ALTER TABLE "patterns" DROP CONSTRAINT "patterns_projectId_fkey";

-- DropForeignKey
ALTER TABLE "project_members" DROP CONSTRAINT "project_members_projectId_fkey";

-- DropForeignKey
ALTER TABLE "project_members" DROP CONSTRAINT "project_members_userId_fkey";

-- DropForeignKey
ALTER TABLE "projects" DROP CONSTRAINT "projects_createdById_fkey";

-- DropForeignKey
ALTER TABLE "screens" DROP CONSTRAINT "screens_projectId_fkey";

-- DropForeignKey
ALTER TABLE "screenshots" DROP CONSTRAINT "screenshots_projectId_fkey";

-- DropForeignKey
ALTER TABLE "verdicts" DROP CONSTRAINT "verdicts_projectId_fkey";

-- DropForeignKey
ALTER TABLE "verdicts" DROP CONSTRAINT "verdicts_updatedById_fkey";

-- DropIndex
DROP INDEX "logs_projectId_featureId_idx";

-- DropIndex
DROP INDEX "logs_projectId_ts_idx";

-- DropIndex
DROP INDEX "logs_traceId_idx";

-- DropIndex
DROP INDEX "projects_apiKey_key";

-- AlterTable
ALTER TABLE "logs" DROP CONSTRAINT "logs_pkey",
DROP COLUMN "featureId",
DROP COLUMN "projectId",
DROP COLUMN "savedAt",
DROP COLUMN "traceId",
DROP COLUMN "ts",
DROP COLUMN "type",
ADD COLUMN     "element_id" TEXT,
ADD COLUMN     "event_type" TEXT NOT NULL,
ADD COLUMN     "screen_name" TEXT,
ADD COLUMN     "screenshot_path" TEXT,
ADD COLUMN     "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "trace_id" TEXT NOT NULL,
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "payload" DROP NOT NULL,
ADD CONSTRAINT "logs_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "logs_id_seq";

-- AlterTable
ALTER TABLE "project_members" DROP CONSTRAINT "project_members_pkey",
DROP COLUMN "joinedAt",
DROP COLUMN "projectId",
DROP COLUMN "userId",
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "id" TEXT NOT NULL,
ADD COLUMN     "project_id" TEXT NOT NULL,
ADD COLUMN     "user_id" TEXT NOT NULL,
DROP COLUMN "role",
ADD COLUMN     "role" TEXT NOT NULL DEFAULT 'VIEWER',
ADD CONSTRAINT "project_members_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "projects" DROP CONSTRAINT "projects_pkey",
DROP COLUMN "apiKey",
DROP COLUMN "createdAt",
DROP COLUMN "createdById",
DROP COLUMN "isActive",
DROP COLUMN "updatedAt",
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "created_by_id" TEXT NOT NULL,
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "projects_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "projects_id_seq";

-- AlterTable
ALTER TABLE "users" DROP CONSTRAINT "users_pkey",
DROP COLUMN "createdAt",
DROP COLUMN "displayName",
DROP COLUMN "isActive",
DROP COLUMN "passwordHash",
DROP COLUMN "updatedAt",
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "display_name" TEXT NOT NULL,
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "password_hash" TEXT NOT NULL,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "users_id_seq";

-- DropTable
DROP TABLE "console_logs";

-- DropTable
DROP TABLE "issues";

-- DropTable
DROP TABLE "patterns";

-- DropTable
DROP TABLE "screens";

-- DropTable
DROP TABLE "screenshots";

-- DropTable
DROP TABLE "verdicts";

-- DropEnum
DROP TYPE "MemberRole";

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "label" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traces" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "api_key_id" TEXT NOT NULL,
    "operator_id" TEXT,
    "status" "TraceStatus" NOT NULL DEFAULT 'ACTIVE',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "traces_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");

-- CreateIndex
CREATE UNIQUE INDEX "project_members_project_id_user_id_key" ON "project_members"("project_id", "user_id");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traces" ADD CONSTRAINT "traces_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traces" ADD CONSTRAINT "traces_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logs" ADD CONSTRAINT "logs_trace_id_fkey" FOREIGN KEY ("trace_id") REFERENCES "traces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
