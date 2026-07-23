-- CreateTable
CREATE TABLE `reply_feedback` (
    `id` VARCHAR(36) NOT NULL,
    `email_id` VARCHAR(255) NOT NULL,
    `user_id` VARCHAR(36) NOT NULL,
    `generated_reply` TEXT NOT NULL,
    `final_reply` TEXT NOT NULL,
    `insertions` INTEGER NOT NULL DEFAULT 0,
    `deletions` INTEGER NOT NULL DEFAULT 0,
    `modifications` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `reply_feedback_user_id_idx`(`user_id`),
    INDEX `reply_feedback_email_id_idx`(`email_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `reply_feedback` ADD CONSTRAINT `reply_feedback_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
