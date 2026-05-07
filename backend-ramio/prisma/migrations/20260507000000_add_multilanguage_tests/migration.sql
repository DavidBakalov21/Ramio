-- Add language column to TestFile (default PYTHON preserves existing rows)
ALTER TABLE `TestFile` ADD COLUMN `language` ENUM('PYTHON','NODE_JS','JAVA','DOTNET') NOT NULL DEFAULT 'PYTHON';

-- Add composite unique constraint first so the FK can use it while we drop the old one
ALTER TABLE `TestFile` ADD UNIQUE KEY `TestFile_assignmentId_language_key` (`assignmentId`, `language`);

-- Drop the old single-column unique constraint
ALTER TABLE `TestFile` DROP INDEX `TestFile_assignmentId_key`;

-- Add language choice to submissions (nullable — student picks at submit time)
ALTER TABLE `AssignmentSubmission` ADD COLUMN `language` ENUM('PYTHON','NODE_JS','JAVA','DOTNET') NULL;
