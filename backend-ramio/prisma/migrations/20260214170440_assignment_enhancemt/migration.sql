/*
  Warnings:

  - Added the required column `teacherFeedback` to the `AssignmentSubmission` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `Assignment` ADD COLUMN `language` ENUM('PYTHON', 'NODE_JS') NOT NULL DEFAULT 'PYTHON',
    ADD COLUMN `points` INTEGER NOT NULL DEFAULT 100;

-- AlterTable
ALTER TABLE `AssignmentSubmission` ADD COLUMN `points` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `teacherFeedback` LONGTEXT NOT NULL;
