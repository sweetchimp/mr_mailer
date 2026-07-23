/*
  Warnings:

  - You are about to drop the `imap_accounts` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `imap_accounts` DROP FOREIGN KEY `imap_accounts_user_id_fkey`;

-- DropTable
DROP TABLE `imap_accounts`;
