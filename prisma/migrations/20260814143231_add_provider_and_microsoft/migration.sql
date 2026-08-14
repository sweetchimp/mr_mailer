-- AlterTable
ALTER TABLE `oauth_tokens` ADD COLUMN `provider` ENUM('GOOGLE', 'MICROSOFT') NOT NULL DEFAULT 'GOOGLE';

-- AlterTable
ALTER TABLE `users` ADD COLUMN `microsoft_id` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `users_microsoft_id_key` ON `users`(`microsoft_id`);
