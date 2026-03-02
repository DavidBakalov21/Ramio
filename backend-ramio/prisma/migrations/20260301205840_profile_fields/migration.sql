/*
  Warnings:

  - You are about to drop the column `profilePictureUrl` on the `user` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `user` DROP COLUMN `profilePictureUrl`,
    ADD COLUMN `aboutMe` LONGTEXT NULL,
    ADD COLUMN `birthdate` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `ProfilePicture` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `url` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `userId` BIGINT NOT NULL,

    UNIQUE INDEX `ProfilePicture_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ProfilePicture` ADD CONSTRAINT `ProfilePicture_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
