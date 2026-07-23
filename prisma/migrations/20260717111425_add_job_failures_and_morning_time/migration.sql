-- AlterTable
ALTER TABLE `users` ADD COLUMN `preferred_morning_time` VARCHAR(191) NOT NULL DEFAULT '07:00';

-- CreateTable
CREATE TABLE `job_failures` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `job_type` VARCHAR(191) NOT NULL,
    `step` VARCHAR(191) NOT NULL,
    `error_message` TEXT NOT NULL,
    `context` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `job_failures_user_id_idx`(`user_id`),
    INDEX `job_failures_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `job_failures` ADD CONSTRAINT `job_failures_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
