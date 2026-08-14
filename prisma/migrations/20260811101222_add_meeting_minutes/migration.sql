-- CreateTable
CREATE TABLE `meeting_minutes` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `raw_notes` TEXT NOT NULL,
    `attendees` TEXT NULL,
    `summary_text` TEXT NOT NULL,
    `decisions` TEXT NOT NULL,
    `action_items` TEXT NOT NULL,
    `next_steps` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `meeting_minutes_user_id_idx`(`user_id`),
    INDEX `meeting_minutes_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `meeting_minutes` ADD CONSTRAINT `meeting_minutes_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
