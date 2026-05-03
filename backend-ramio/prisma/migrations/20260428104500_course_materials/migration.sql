-- CreateTable
CREATE TABLE `course_material` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `courseId` BIGINT NOT NULL,
    `type` ENUM('PDF', 'VIDEO', 'FILE', 'LINK') NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `url` VARCHAR(1024) NOT NULL,
    `key` VARCHAR(191) NULL,
    `name` VARCHAR(191) NULL,
    `mimeType` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `course_material_courseId_idx`(`courseId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `course_material` ADD CONSTRAINT `course_material_courseId_fkey` FOREIGN KEY (`courseId`) REFERENCES `Course`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

