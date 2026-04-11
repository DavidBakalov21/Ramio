-- AlterTable: ProjectLanguage enum on Project (DOTNET, PYTHON, JAVA, NODE_JS; default PYTHON)
ALTER TABLE `Project` ADD COLUMN `language` ENUM('DOTNET', 'PYTHON', 'JAVA', 'NODE_JS') NOT NULL DEFAULT 'PYTHON';
