-- CreateTable
CREATE TABLE `imap_accounts` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `email_address` VARCHAR(191) NOT NULL,
    `encrypted_password` TEXT NOT NULL,
    `imap_host` VARCHAR(191) NOT NULL DEFAULT 'outlook.office365.com',
    `imap_port` INTEGER NOT NULL DEFAULT 993,
    `smtp_host` VARCHAR(191) NOT NULL DEFAULT 'smtp.office365.com',
    `smtp_port` INTEGER NOT NULL DEFAULT 587,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `imap_accounts_user_id_key`(`user_id`),
    UNIQUE INDEX `imap_accounts_email_address_key`(`email_address`),
    INDEX `imap_accounts_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `imap_accounts` ADD CONSTRAINT `imap_accounts_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
