-- AlterTable
ALTER TABLE `AssignmentSubmission` ADD COLUMN `checkedAt` DATETIME(3) NULL,
    ADD COLUMN `isChecked` BOOLEAN NOT NULL DEFAULT false;
