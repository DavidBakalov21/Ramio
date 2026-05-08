-- CreateTable: Quiz feature (test tasks)

CREATE TABLE `Quiz` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `courseId` BIGINT NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `timeLimit` INTEGER NULL,
    `deadline` DATETIME(3) NULL,
    `allowReview` BOOLEAN NOT NULL DEFAULT true,
    `showCorrectAnswers` BOOLEAN NOT NULL DEFAULT true,
    `showPointsPerQuestion` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Quiz_courseId_fkey`(`courseId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `QuizQuestion` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `quizId` BIGINT NOT NULL,
    `type` ENUM('ONE_ANSWER', 'MULTI_ANSWER', 'OPEN_ANSWER') NOT NULL,
    `text` TEXT NOT NULL,
    `points` DOUBLE NOT NULL,
    `order` INTEGER NOT NULL,

    INDEX `QuizQuestion_quizId_fkey`(`quizId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `QuizAnswer` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `questionId` BIGINT NOT NULL,
    `text` TEXT NOT NULL,
    `isCorrect` BOOLEAN NOT NULL,
    `order` INTEGER NOT NULL,

    INDEX `QuizAnswer_questionId_fkey`(`questionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `quiz_submission` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `quizId` BIGINT NOT NULL,
    `userId` BIGINT NOT NULL,
    `status` ENUM('IN_PROGRESS', 'SUBMITTED') NOT NULL DEFAULT 'IN_PROGRESS',
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `submittedAt` DATETIME(3) NULL,
    `totalPoints` DOUBLE NULL,

    INDEX `quiz_submission_quizId_fkey`(`quizId`),
    INDEX `quiz_submission_userId_fkey`(`userId`),
    UNIQUE INDEX `quiz_submission_quizId_userId_key`(`quizId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `quiz_submission_answer` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `submissionId` BIGINT NOT NULL,
    `questionId` BIGINT NOT NULL,
    `openText` TEXT NULL,
    `pointsEarned` DOUBLE NULL,

    INDEX `quiz_submission_answer_submissionId_fkey`(`submissionId`),
    INDEX `quiz_submission_answer_questionId_fkey`(`questionId`),
    UNIQUE INDEX `quiz_submission_answer_submissionId_questionId_key`(`submissionId`, `questionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- M2M join table for selected answers
CREATE TABLE `_SelectedQuizAnswers` (
    `A` BIGINT NOT NULL,
    `B` BIGINT NOT NULL,

    UNIQUE INDEX `_SelectedQuizAnswers_AB_unique`(`A`, `B`),
    INDEX `_SelectedQuizAnswers_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Quiz` ADD CONSTRAINT `Quiz_courseId_fkey` FOREIGN KEY (`courseId`) REFERENCES `Course`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuizQuestion` ADD CONSTRAINT `QuizQuestion_quizId_fkey` FOREIGN KEY (`quizId`) REFERENCES `Quiz`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuizAnswer` ADD CONSTRAINT `QuizAnswer_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `QuizQuestion`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quiz_submission` ADD CONSTRAINT `quiz_submission_quizId_fkey` FOREIGN KEY (`quizId`) REFERENCES `Quiz`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quiz_submission` ADD CONSTRAINT `quiz_submission_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quiz_submission_answer` ADD CONSTRAINT `quiz_submission_answer_submissionId_fkey` FOREIGN KEY (`submissionId`) REFERENCES `quiz_submission`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quiz_submission_answer` ADD CONSTRAINT `quiz_submission_answer_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `QuizQuestion`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_SelectedQuizAnswers` ADD CONSTRAINT `_SelectedQuizAnswers_A_fkey` FOREIGN KEY (`A`) REFERENCES `QuizAnswer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_SelectedQuizAnswers` ADD CONSTRAINT `_SelectedQuizAnswers_B_fkey` FOREIGN KEY (`B`) REFERENCES `quiz_submission_answer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddColumn: image support for questions and answers
ALTER TABLE `QuizQuestion` ADD COLUMN `imageUrl` TEXT NULL;
ALTER TABLE `QuizAnswer` ADD COLUMN `imageUrl` TEXT NULL;
