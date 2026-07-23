-- AlterTable
ALTER TABLE `oauth_tokens` ADD COLUMN `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    MODIFY `access_token` TEXT NOT NULL,
    MODIFY `refresh_token` TEXT NOT NULL;
