-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NULL,
    `google_id` VARCHAR(191) NULL,
    `microsoft_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `preferred_morning_time` VARCHAR(191) NOT NULL DEFAULT '07:00',
    `token_revoked_at` DATETIME(3) NULL,
    `weekly_digest_email` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `users_email_key`(`email`),
    UNIQUE INDEX `users_google_id_key`(`google_id`),
    UNIQUE INDEX `users_microsoft_id_key`(`microsoft_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `oauth_tokens` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `access_token` TEXT NOT NULL,
    `refresh_token` TEXT NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `scope` TEXT NOT NULL,
    `provider` ENUM('GOOGLE', 'MICROSOFT') NOT NULL DEFAULT 'GOOGLE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `oauth_tokens_user_id_idx`(`user_id`),
    INDEX `oauth_tokens_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `email_summaries` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `gmail_message_id` VARCHAR(191) NOT NULL,
    `sender` VARCHAR(191) NOT NULL,
    `sender_address` VARCHAR(191) NULL,
    `subject` VARCHAR(191) NOT NULL,
    `priority` ENUM('HIGH', 'MEDIUM', 'LOW') NOT NULL,
    `summary_text` TEXT NOT NULL,
    `suggested_reply` TEXT NULL,
    `status` ENUM('PENDING', 'SENT', 'DISMISSED', 'SNOOZED') NOT NULL DEFAULT 'PENDING',
    `snoozed_until` DATETIME(3) NULL,
    `sent_at` DATETIME(3) NULL,
    `dismissed_at` DATETIME(3) NULL,
    `body_text` LONGTEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `email_summaries_gmail_message_id_key`(`gmail_message_id`),
    INDEX `email_summaries_user_id_idx`(`user_id`),
    INDEX `email_summaries_created_at_idx`(`created_at`),
    INDEX `email_summaries_user_id_sent_at_idx`(`user_id`, `sent_at`),
    INDEX `email_summaries_user_id_dismissed_at_idx`(`user_id`, `dismissed_at`),
    INDEX `email_summaries_user_id_sender_address_idx`(`user_id`, `sender_address`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sender_preferences` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `sender_address` VARCHAR(191) NOT NULL,
    `sender_name` VARCHAR(191) NULL,
    `low_dismissals` INTEGER NOT NULL DEFAULT 0,
    `suggestion_dismissed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `sender_preferences_user_id_idx`(`user_id`),
    UNIQUE INDEX `sender_preferences_user_id_sender_address_key`(`user_id`, `sender_address`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

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

-- CreateTable
CREATE TABLE `subscriptions` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `stripe_customer_id` VARCHAR(191) NOT NULL,
    `plan` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `subscriptions_user_id_key`(`user_id`),
    UNIQUE INDEX `subscriptions_stripe_customer_id_key`(`stripe_customer_id`),
    INDEX `subscriptions_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

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

-- CreateTable
CREATE TABLE `schedule_blocks` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `start_time` DATETIME(3) NOT NULL,
    `end_time` DATETIME(3) NOT NULL,
    `status` ENUM('PENDING', 'IN_PROGRESS', 'DONE', 'MISSED') NOT NULL DEFAULT 'PENDING',
    `date` DATE NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `schedule_blocks_user_id_idx`(`user_id`),
    INDEX `schedule_blocks_date_idx`(`date`),
    INDEX `schedule_blocks_user_id_date_idx`(`user_id`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reply_feedback` (
    `id` VARCHAR(191) NOT NULL,
    `email_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `generated_reply` TEXT NOT NULL,
    `final_reply` TEXT NOT NULL,
    `accepted` BOOLEAN NOT NULL DEFAULT false,
    `insertions` INTEGER NOT NULL DEFAULT 0,
    `deletions` INTEGER NOT NULL DEFAULT 0,
    `modifications` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `reply_feedback_user_id_idx`(`user_id`),
    INDEX `reply_feedback_email_id_idx`(`email_id`),
    INDEX `reply_feedback_user_id_created_at_idx`(`user_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reply_style_profiles` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `style_note` LONGTEXT NOT NULL,
    `sample_count` INTEGER NOT NULL DEFAULT 0,
    `accepted_count` INTEGER NOT NULL DEFAULT 0,
    `rewrite_count` INTEGER NOT NULL DEFAULT 0,
    `analyzed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `reply_style_profiles_user_id_key`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `oauth_tokens` ADD CONSTRAINT `oauth_tokens_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `email_summaries` ADD CONSTRAINT `email_summaries_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sender_preferences` ADD CONSTRAINT `sender_preferences_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `job_failures` ADD CONSTRAINT `job_failures_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `meeting_reminders` ADD CONSTRAINT `meeting_reminders_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `meeting_minutes` ADD CONSTRAINT `meeting_minutes_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `schedule_blocks` ADD CONSTRAINT `schedule_blocks_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reply_feedback` ADD CONSTRAINT `reply_feedback_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reply_style_profiles` ADD CONSTRAINT `reply_style_profiles_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
