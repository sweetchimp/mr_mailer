/*
  Warnings:

  - The primary key for the `reply_feedback` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `email_id` on the `reply_feedback` table. The data in that column could be lost. The data in that column will be cast from `VarChar(255)` to `VarChar(191)`.

*/
-- DropForeignKey
ALTER TABLE `reply_feedback` DROP FOREIGN KEY `reply_feedback_user_id_fkey`;

-- AlterTable
ALTER TABLE `email_summaries` ADD COLUMN `snoozed_until` DATETIME(3) NULL,
    MODIFY `status` ENUM('PENDING', 'SENT', 'DISMISSED', 'SNOOZED') NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE `reply_feedback` DROP PRIMARY KEY,
    MODIFY `id` VARCHAR(191) NOT NULL,
    MODIFY `email_id` VARCHAR(191) NOT NULL,
    MODIFY `user_id` VARCHAR(191) NOT NULL,
    ADD PRIMARY KEY (`id`);

-- CreateTable
CREATE TABLE `meeting_reminders` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `calendar_event_id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `meeting_time` DATETIME(3) NOT NULL,
    `reminded_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `meeting_reminders_user_id_idx`(`user_id`),
    UNIQUE INDEX `meeting_reminders_user_id_calendar_event_id_meeting_time_key`(`user_id`, `calendar_event_id`, `meeting_time`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `meeting_reminders` ADD CONSTRAINT `meeting_reminders_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reply_feedback` ADD CONSTRAINT `reply_feedback_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
