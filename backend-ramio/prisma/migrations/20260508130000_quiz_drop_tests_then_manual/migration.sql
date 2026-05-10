-- Remove TESTS_THEN_MANUAL: normalize existing rows then shrink enum

UPDATE `QuizQuestion`
SET `codingTaskGradingMode` = 'MANUAL_ONLY'
WHERE `codingTaskGradingMode` = 'TESTS_THEN_MANUAL';

ALTER TABLE `QuizQuestion` MODIFY COLUMN `codingTaskGradingMode`
  ENUM('MANUAL_ONLY', 'TESTS_ONLY') NULL;
