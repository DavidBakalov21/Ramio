-- Quiz CODING_TASK: question type enum and coding metadata + submission answer test/AI fields

ALTER TABLE `QuizQuestion` MODIFY COLUMN `type`
  ENUM('ONE_ANSWER', 'MULTI_ANSWER', 'OPEN_ANSWER', 'CODING_TASK') NOT NULL;

ALTER TABLE `QuizQuestion`
  ADD COLUMN `codingTaskLanguage` ENUM('PYTHON', 'NODE_JS', 'JAVA', 'DOTNET') NULL,
  ADD COLUMN `codingTaskStarterCode` LONGTEXT NULL,
  ADD COLUMN `codingTaskTeacherTests` LONGTEXT NULL,
  ADD COLUMN `codingTaskGradingMode` ENUM('MANUAL_ONLY', 'TESTS_ONLY', 'TESTS_THEN_MANUAL') NULL,
  ADD COLUMN `codingTaskAiReviewEnabled` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `codingTaskAiReviewRubric` TEXT NULL;

ALTER TABLE `quiz_submission_answer`
  ADD COLUMN `codingTestRunStatus` ENUM('PENDING', 'RUNNING', 'DONE', 'ERROR') NULL,
  ADD COLUMN `codingTestStdout` TEXT NULL,
  ADD COLUMN `codingTestStderr` TEXT NULL,
  ADD COLUMN `codingTestExitCode` INTEGER NULL,
  ADD COLUMN `codingTestTimedOut` BOOLEAN NULL,
  ADD COLUMN `codingTestSuccess` BOOLEAN NULL,
  ADD COLUMN `codingAutoPointsEarned` DOUBLE NULL,
  ADD COLUMN `codingAiReviewText` LONGTEXT NULL,
  ADD COLUMN `codingAiReviewedAt` DATETIME(3) NULL;
