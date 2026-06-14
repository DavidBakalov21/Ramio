-- AlterTable
ALTER TABLE `Project` ADD COLUMN `aiSummary` LONGTEXT NULL,
                      ADD COLUMN `aiSummaryGeneratedAt` DATETIME(3) NULL;
