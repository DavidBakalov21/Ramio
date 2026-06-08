-- AlterTable
ALTER TABLE `Assignment` MODIFY `language` ENUM('PYTHON', 'NODE_JS', 'JAVA', 'DOTNET', 'CPP') NOT NULL DEFAULT 'PYTHON';

-- AlterTable
ALTER TABLE `TestFile` MODIFY `language` ENUM('PYTHON', 'NODE_JS', 'JAVA', 'DOTNET', 'CPP') NOT NULL DEFAULT 'PYTHON';

-- AlterTable
ALTER TABLE `AssignmentSubmission` MODIFY `language` ENUM('PYTHON', 'NODE_JS', 'JAVA', 'DOTNET', 'CPP') NULL;

-- AlterTable
ALTER TABLE `QuizQuestion` MODIFY `codingTaskLanguage` ENUM('PYTHON', 'NODE_JS', 'JAVA', 'DOTNET', 'CPP') NULL;
