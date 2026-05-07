-- CreateTable
CREATE TABLE `project_file_comment` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `submissionId` BIGINT NOT NULL,
    `filePath` VARCHAR(1024) NOT NULL,
    `lineStart` INT NOT NULL,
    `lineEnd` INT NULL,
    `body` LONGTEXT NOT NULL,
    `authorId` BIGINT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `project_file_comment_submissionId_idx`(`submissionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `project_file_comment` ADD CONSTRAINT `project_file_comment_submissionId_fkey` FOREIGN KEY (`submissionId`) REFERENCES `project_submission`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_file_comment` ADD CONSTRAINT `project_file_comment_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
