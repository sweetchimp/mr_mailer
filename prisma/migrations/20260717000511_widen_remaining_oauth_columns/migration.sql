-- AlterTable
ALTER TABLE `oauth_tokens` MODIFY `scope` TEXT NOT NULL,
    ALTER COLUMN `updated_at` DROP DEFAULT;
