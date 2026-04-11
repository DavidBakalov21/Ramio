-- AlterTable
ALTER TABLE `project_submission` ADD COLUMN `codeBuildId` VARCHAR(512) NULL,
    ADD COLUMN `codeBuildStatus` VARCHAR(64) NULL,
    ADD COLUMN `codeBuildPhase` VARCHAR(128) NULL,
    ADD COLUMN `codeBuildLogsUrl` VARCHAR(1024) NULL,
    ADD COLUMN `codeBuildStartedAt` DATETIME(3) NULL,
    ADD COLUMN `codeBuildUpdatedAt` DATETIME(3) NULL;
