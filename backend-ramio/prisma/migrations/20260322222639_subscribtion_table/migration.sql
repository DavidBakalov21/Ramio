-- AlterTable
ALTER TABLE `user` ADD COLUMN `stripeCustomerId` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `user_stripeCustomerId_key` ON `user`(`stripeCustomerId`);

-- CreateTable
CREATE TABLE `UserSubscription` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `userId` BIGINT NOT NULL,
    `stripeSubscriptionId` VARCHAR(191) NOT NULL,
    `stripeCustomerId` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `currentPeriodEnd` DATETIME(3) NOT NULL,
    `priceId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `UserSubscription_stripeSubscriptionId_key`(`stripeSubscriptionId`),
    INDEX `UserSubscription_userId_idx`(`userId`),
    INDEX `UserSubscription_stripeCustomerId_idx`(`stripeCustomerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `UserSubscription` ADD CONSTRAINT `UserSubscription_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
