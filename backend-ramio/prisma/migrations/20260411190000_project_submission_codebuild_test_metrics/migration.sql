-- AlterTable
ALTER TABLE `project_submission` ADD COLUMN `codeBuildTestsPassed` INTEGER NULL,
    ADD COLUMN `codeBuildTestsFailed` INTEGER NULL,
    ADD COLUMN `codeBuildTestsSkipped` INTEGER NULL,
    ADD COLUMN `codeBuildTestMetricsAt` DATETIME(3) NULL;
