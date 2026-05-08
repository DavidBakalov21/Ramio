import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { QuizQuestionType, QuizSubmissionStatus } from '@prisma/client';
import sharp from 'sharp';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { BedrockService } from '../bedrock/bedrock.service';
import type { CreateQuizDto } from './dto/create-quiz.dto';
import type { UpdateQuizDto } from './dto/update-quiz.dto';
import type { SaveQuizAnswersDto } from './dto/save-quiz-answers.dto';
import type { AssessQuizSubmissionDto } from './dto/assess-quiz-submission.dto';
import type { GenerateQuizDto } from './dto/generate-quiz.dto';

const QUIZ_IMAGES_BUCKET = 'ramio-images';
const MAX_IMAGE_DIMENSION = 1920;
const ALLOWED_IMAGE_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const GeneratedQuizAnswerSchema = z
  .object({
    text: z.string().trim().min(1).max(1000),
    isCorrect: z.boolean(),
  })
  .strict();

const GeneratedQuizQuestionSchema = z
  .object({
    type: z.preprocess(
      (value) => (typeof value === 'string' ? value.toUpperCase() : value),
      z.nativeEnum(QuizQuestionType),
    ),
    text: z.string().trim().min(1).max(2000),
    points: z.coerce.number().finite().min(0),
    answers: z.array(GeneratedQuizAnswerSchema).max(6).default([]),
  })
  .strict();

const GeneratedQuizSchema = z
  .object({
    title: z.string().trim().min(1).max(255),
    description: z.string().trim().max(4000).default(''),
    questions: z.array(GeneratedQuizQuestionSchema).min(1),
  })
  .strict();

type GeneratedQuizQuestion = z.infer<typeof GeneratedQuizQuestionSchema>;

@Injectable()
export class QuizService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly bedrock: BedrockService,
  ) {}

  // ─── Upload image ────────────────────────────────────────────────────────

  async uploadImage(file: Express.Multer.File): Promise<{ url: string }> {
    if (!ALLOWED_IMAGE_MIMES.includes(file.mimetype)) {
      throw new BadRequestException(
        'Only JPG, PNG, and WebP images are allowed.',
      );
    }
    if (file.size > MAX_IMAGE_BYTES) {
      throw new BadRequestException('Image must be 10 MB or smaller.');
    }

    // GIFs are uploaded as-is to preserve animation; all other formats get resized
    let uploadBuffer = file.buffer;
    if (file.mimetype !== 'image/gif') {
      uploadBuffer = await sharp(file.buffer)
        .resize(MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .toBuffer();
    }

    const resizedFile: Express.Multer.File = {
      ...file,
      buffer: uploadBuffer,
      size: uploadBuffer.length,
    };

    const { url } = await this.storage.uploadFile(
      resizedFile,
      QUIZ_IMAGES_BUCKET,
      'quiz-images/',
    );
    return { url };
  }

  // ─── Create ───────────────────────────────────────────────────────────────

  async create(teacherId: bigint, dto: CreateQuizDto) {
    await this.assertTeacherOwnsCourse(BigInt(dto.courseId), teacherId);

    const deadline =
      dto.deadline != null ? new Date(dto.deadline * 1000) : null;

    const quiz = await this.prisma.quiz.create({
      data: {
        title: dto.title,
        description: dto.description ?? null,
        courseId: BigInt(dto.courseId),
        timeLimit: dto.timeLimit ?? null,
        deadline,
        allowReview: dto.allowReview ?? true,
        showCorrectAnswers: dto.showCorrectAnswers ?? true,
        showPointsPerQuestion: dto.showPointsPerQuestion ?? true,
        questions: {
          create: (dto.questions ?? []).map((q) => ({
            type: q.type,
            text: q.text,
            points: q.points,
            order: q.order,
            imageUrl: q.imageUrl ?? null,
            answers:
              q.type !== QuizQuestionType.OPEN_ANSWER && q.answers?.length
                ? {
                    create: q.answers.map((a) => ({
                      text: a.text,
                      isCorrect: a.isCorrect,
                      order: a.order,
                      imageUrl: a.imageUrl ?? null,
                    })),
                  }
                : undefined,
          })),
        },
      },
      include: {
        questions: {
          orderBy: { order: 'asc' },
          include: { answers: { orderBy: { order: 'asc' } } },
        },
      },
    });

    return this.toQuizResponse(quiz, true);
  }

  async generateDraft(teacherId: bigint, dto: GenerateQuizDto) {
    await this.assertTeacherOwnsCourse(BigInt(dto.courseId), teacherId);
    const requestedCount = Math.max(1, Math.min(20, dto.questionCount ?? 5));
    const prompt = dto.prompt.trim();
    if (!prompt) {
      throw new BadRequestException('Prompt is required');
    }

    const aiPrompt = `Generate a quiz draft as strict JSON only.

Teacher request:
${prompt}

Requirements:
- Return exactly one JSON object.
- Object keys: title (string), description (string), questions (array).
- Create exactly ${requestedCount} questions.
- Each question: type ("ONE_ANSWER" | "MULTI_ANSWER" | "OPEN_ANSWER"), text (string), points (number >= 0), answers (array).
- For OPEN_ANSWER, answers must be [].
- For ONE_ANSWER and MULTI_ANSWER, answers must have 2-6 items.
- Each answer: text (string), isCorrect (boolean).
- ONE_ANSWER must have exactly one correct answer.
- MULTI_ANSWER must have at least one correct answer.
- Keep question text concise and classroom-appropriate.
- Do not include markdown code fences.
- Do not include any additional keys.`;

    const raw = await this.bedrock.invoke(aiPrompt, 4096);
    const parsed = this.parseGeneratedQuiz(raw);
    const validated = this.validateGeneratedQuiz(parsed);

    const sanitized = validated.questions
      .slice(0, requestedCount)
      .map((q, index) => this.normalizeGeneratedQuestion(q, index))
      .filter((q): q is NonNullable<typeof q> => !!q);

    if (sanitized.length === 0) {
      throw new BadRequestException('AI did not return valid quiz questions');
    }

    return {
      title: validated.title,
      description: validated.description,
      questions: sanitized,
    };
  }

  // ─── Find by course ───────────────────────────────────────────────────────

  async findByCourse(courseId: bigint, userId: bigint) {
    await this.assertCanAccessCourse(courseId, userId);

    const quizzes = await this.prisma.quiz.findMany({
      where: { courseId },
      include: {
        questions: { select: { id: true, points: true, type: true } },
        submissions: {
          where: { userId },
          select: { id: true, status: true, totalPoints: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return quizzes.map((q) => {
      const totalPoints = q.questions.reduce((sum, qn) => sum + qn.points, 0);
      const sub = q.submissions[0] ?? null;
      return {
        id: q.id.toString(),
        title: q.title,
        description: q.description,
        timeLimit: q.timeLimit,
        deadline: q.deadline?.toISOString() ?? null,
        allowReview: q.allowReview,
        questionCount: q.questions.length,
        totalPoints,
        submission: sub
          ? {
              id: sub.id.toString(),
              status: sub.status,
              totalPoints: sub.totalPoints,
            }
          : null,
      };
    });
  }

  // ─── Find one ─────────────────────────────────────────────────────────────

  async findOne(quizId: bigint, userId: bigint) {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id: quizId },
      include: {
        course: true,
        questions: {
          orderBy: { order: 'asc' },
          include: { answers: { orderBy: { order: 'asc' } } },
        },
      },
    });
    if (!quiz) throw new NotFoundException('Quiz not found');

    const isTeacher = quiz.course.userId === userId;
    if (!isTeacher) {
      await this.assertCanAccessCourse(quiz.courseId, userId);
    }

    return this.toQuizResponse(quiz, isTeacher);
  }

  // ─── Start quiz (student) ─────────────────────────────────────────────────

  async startQuiz(quizId: bigint, studentId: bigint) {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id: quizId },
      include: { course: true },
    });
    if (!quiz) throw new NotFoundException('Quiz not found');

    const enrollment = await this.prisma.enrollment.findUnique({
      where: {
        userId_courseId: { userId: studentId, courseId: quiz.courseId },
      },
    });
    if (!enrollment) {
      throw new ForbiddenException(
        'You must be enrolled in this course to take this quiz',
      );
    }

    if (quiz.deadline && new Date() > quiz.deadline) {
      throw new BadRequestException(
        'This quiz is closed — the deadline has passed',
      );
    }

    const existing = await this.prisma.quizSubmission.findUnique({
      where: { quizId_userId: { quizId, userId: studentId } },
    });
    if (existing) {
      if (existing.status === QuizSubmissionStatus.SUBMITTED) {
        throw new ConflictException('You have already submitted this quiz');
      }
      return {
        id: existing.id.toString(),
        quizId: quizId.toString(),
        status: existing.status,
        startedAt: existing.startedAt.toISOString(),
        timeLimit: quiz.timeLimit,
      };
    }

    const submission = await this.prisma.quizSubmission.create({
      data: { quizId, userId: studentId },
    });

    return {
      id: submission.id.toString(),
      quizId: quizId.toString(),
      status: submission.status,
      startedAt: submission.startedAt.toISOString(),
      timeLimit: quiz.timeLimit,
    };
  }

  // ─── Auto-save answers (student, IN_PROGRESS) ────────────────────────────

  async saveAnswers(
    quizId: bigint,
    studentId: bigint,
    dto: SaveQuizAnswersDto,
  ) {
    const submission = await this.prisma.quizSubmission.findUnique({
      where: { quizId_userId: { quizId, userId: studentId } },
    });
    if (!submission) throw new NotFoundException('Quiz not started');
    if (submission.status !== QuizSubmissionStatus.IN_PROGRESS) {
      throw new BadRequestException('Quiz already submitted');
    }

    await this.upsertAnswers(submission.id, dto);
    return { success: true };
  }

  // ─── Submit quiz (student) ────────────────────────────────────────────────

  async submitQuiz(quizId: bigint, studentId: bigint, dto: SaveQuizAnswersDto) {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id: quizId },
      include: {
        questions: {
          include: { answers: true },
        },
      },
    });
    if (!quiz) throw new NotFoundException('Quiz not found');

    const submission = await this.prisma.quizSubmission.findUnique({
      where: { quizId_userId: { quizId, userId: studentId } },
    });
    if (!submission) throw new NotFoundException('Quiz not started');
    if (submission.status !== QuizSubmissionStatus.IN_PROGRESS) {
      throw new ConflictException('Quiz already submitted');
    }

    await this.upsertAnswers(submission.id, dto);

    const savedAnswers = await this.prisma.quizSubmissionAnswer.findMany({
      where: { submissionId: submission.id },
      include: { selectedAnswers: true },
    });

    let totalPoints = 0;
    for (const question of quiz.questions) {
      const subAnswer = savedAnswers.find((a) => a.questionId === question.id);
      if (question.type === QuizQuestionType.OPEN_ANSWER) continue;

      const selectedIds = subAnswer?.selectedAnswers.map((a) => a.id) ?? [];
      const earned = this.calculatePoints(
        question,
        question.answers,
        selectedIds,
      );

      await this.prisma.quizSubmissionAnswer.upsert({
        where: {
          submissionId_questionId: {
            submissionId: submission.id,
            questionId: question.id,
          },
        },
        create: {
          submissionId: submission.id,
          questionId: question.id,
          pointsEarned: earned,
        },
        update: { pointsEarned: earned },
      });

      totalPoints += earned;
    }

    const updated = await this.prisma.quizSubmission.update({
      where: { id: submission.id },
      data: {
        status: QuizSubmissionStatus.SUBMITTED,
        submittedAt: new Date(),
        totalPoints,
      },
    });

    return {
      id: updated.id.toString(),
      status: updated.status,
      totalPoints: updated.totalPoints,
      submittedAt: updated.submittedAt?.toISOString() ?? null,
    };
  }

  // ─── Confirm submit (student, grades from already-saved answers) ─────────

  async confirmSubmit(quizId: bigint, studentId: bigint) {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id: quizId },
      include: { questions: { include: { answers: true } } },
    });
    if (!quiz) throw new NotFoundException('Quiz not found');

    const submission = await this.prisma.quizSubmission.findUnique({
      where: { quizId_userId: { quizId, userId: studentId } },
    });
    if (!submission) throw new NotFoundException('Quiz not started');
    if (submission.status !== QuizSubmissionStatus.IN_PROGRESS) {
      throw new ConflictException('Quiz already submitted');
    }

    const savedAnswers = await this.prisma.quizSubmissionAnswer.findMany({
      where: { submissionId: submission.id },
      include: { selectedAnswers: true },
    });

    let totalPoints = 0;
    for (const question of quiz.questions) {
      if (question.type === QuizQuestionType.OPEN_ANSWER) continue;
      const subAnswer = savedAnswers.find((a) => a.questionId === question.id);
      const selectedIds = subAnswer?.selectedAnswers.map((a) => a.id) ?? [];
      const earned = this.calculatePoints(
        question,
        question.answers,
        selectedIds,
      );
      await this.prisma.quizSubmissionAnswer.upsert({
        where: {
          submissionId_questionId: {
            submissionId: submission.id,
            questionId: question.id,
          },
        },
        create: {
          submissionId: submission.id,
          questionId: question.id,
          pointsEarned: earned,
        },
        update: { pointsEarned: earned },
      });
      totalPoints += earned;
    }

    const updated = await this.prisma.quizSubmission.update({
      where: { id: submission.id },
      data: {
        status: QuizSubmissionStatus.SUBMITTED,
        submittedAt: new Date(),
        totalPoints,
      },
    });

    return {
      id: updated.id.toString(),
      status: updated.status,
      totalPoints: updated.totalPoints,
      submittedAt: updated.submittedAt?.toISOString() ?? null,
    };
  }

  // ─── Get own submission (student) ─────────────────────────────────────────

  async getOwnSubmission(quizId: bigint, userId: bigint) {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id: quizId },
      include: {
        questions: {
          orderBy: { order: 'asc' },
          include: { answers: { orderBy: { order: 'asc' } } },
        },
      },
    });
    if (!quiz) throw new NotFoundException('Quiz not found');

    await this.assertCanAccessCourse(quiz.courseId, userId);

    const submission = await this.prisma.quizSubmission.findUnique({
      where: { quizId_userId: { quizId, userId } },
      include: {
        answers: {
          include: { selectedAnswers: true },
        },
      },
    });
    if (!submission) throw new NotFoundException('No submission found');

    return this.toStudentSubmissionResponse(quiz, submission);
  }

  // ─── Get all submissions (teacher) ────────────────────────────────────────

  async getSubmissionsByQuiz(quizId: bigint, teacherId: bigint) {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id: quizId },
      include: { course: true, questions: true },
    });
    if (!quiz) throw new NotFoundException('Quiz not found');
    if (quiz.course.userId !== teacherId) {
      throw new ForbiddenException(
        'Only the course teacher can view submissions',
      );
    }

    const submissions = await this.prisma.quizSubmission.findMany({
      where: { quizId, status: QuizSubmissionStatus.SUBMITTED },
      include: {
        user: { select: { id: true, username: true, email: true } },
        answers: { include: { question: true } },
      },
      orderBy: { submittedAt: 'desc' },
    });

    const totalMax = quiz.questions.reduce((s, q) => s + q.points, 0);
    const hasOpenAnswers = quiz.questions.some(
      (q) => q.type === QuizQuestionType.OPEN_ANSWER,
    );

    return submissions.map((sub) => {
      const openPending = hasOpenAnswers
        ? sub.answers.some(
            (a) =>
              a.question.type === QuizQuestionType.OPEN_ANSWER &&
              a.pointsEarned == null,
          )
        : false;
      return {
        id: sub.id.toString(),
        userId: sub.userId.toString(),
        username: sub.user.username,
        email: sub.user.email,
        submittedAt: sub.submittedAt?.toISOString() ?? null,
        totalPoints: sub.totalPoints,
        totalMax,
        isFullyGraded: !openPending,
      };
    });
  }

  // ─── Get submission by ID (teacher) ───────────────────────────────────────

  async getSubmissionById(submissionId: bigint, teacherId: bigint) {
    const submission = await this.prisma.quizSubmission.findUnique({
      where: { id: submissionId },
      include: {
        quiz: {
          include: {
            course: true,
            questions: {
              orderBy: { order: 'asc' },
              include: { answers: { orderBy: { order: 'asc' } } },
            },
          },
        },
        user: { select: { id: true, username: true, email: true } },
        answers: { include: { selectedAnswers: true } },
      },
    });
    if (!submission) throw new NotFoundException('Submission not found');
    if (submission.quiz.course.userId !== teacherId) {
      throw new ForbiddenException(
        'Only the course teacher can view this submission',
      );
    }

    const questions = submission.quiz.questions.map((q) => {
      const subAnswer = submission.answers.find((a) => a.questionId === q.id);
      return {
        id: q.id.toString(),
        type: q.type,
        text: q.text,
        points: q.points,
        order: q.order,
        answers: q.answers.map((a) => ({
          id: a.id.toString(),
          text: a.text,
          isCorrect: a.isCorrect,
          order: a.order,
          imageUrl: a.imageUrl,
          isSelected:
            subAnswer?.selectedAnswers.some((s) => s.id === a.id) ?? false,
        })),
        imageUrl: q.imageUrl,
        openText: subAnswer?.openText ?? null,
        pointsEarned: subAnswer?.pointsEarned ?? null,
      };
    });

    const totalMax = submission.quiz.questions.reduce(
      (s, q) => s + q.points,
      0,
    );

    return {
      id: submission.id.toString(),
      quizId: submission.quizId.toString(),
      quizTitle: submission.quiz.title,
      userId: submission.userId.toString(),
      username: submission.user.username,
      email: submission.user.email,
      submittedAt: submission.submittedAt?.toISOString() ?? null,
      totalPoints: submission.totalPoints,
      totalMax,
      questions,
    };
  }

  // ─── Assess open answers (teacher) ────────────────────────────────────────

  async assessSubmission(
    submissionId: bigint,
    teacherId: bigint,
    dto: AssessQuizSubmissionDto,
  ) {
    const submission = await this.prisma.quizSubmission.findUnique({
      where: { id: submissionId },
      include: {
        quiz: { include: { course: true, questions: true } },
        answers: true,
      },
    });
    if (!submission) throw new NotFoundException('Submission not found');
    if (submission.quiz.course.userId !== teacherId) {
      throw new ForbiddenException(
        'Only the course teacher can assess this submission',
      );
    }

    for (const item of dto.answers) {
      const question = submission.quiz.questions.find(
        (q) => q.id === BigInt(item.questionId),
      );
      if (!question)
        throw new BadRequestException(
          `Question ${item.questionId} not found in this quiz`,
        );
      if (question.type !== QuizQuestionType.OPEN_ANSWER) {
        throw new BadRequestException(
          `Question ${item.questionId} is not an open-answer question`,
        );
      }
      const clamped = Math.min(Math.max(item.pointsEarned, 0), question.points);

      await this.prisma.quizSubmissionAnswer.upsert({
        where: {
          submissionId_questionId: { submissionId, questionId: question.id },
        },
        create: {
          submissionId,
          questionId: question.id,
          pointsEarned: clamped,
        },
        update: { pointsEarned: clamped },
      });
    }

    const allAnswers = await this.prisma.quizSubmissionAnswer.findMany({
      where: { submissionId },
    });
    const totalPoints = allAnswers.reduce(
      (s, a) => s + (a.pointsEarned ?? 0),
      0,
    );

    const updated = await this.prisma.quizSubmission.update({
      where: { id: submissionId },
      data: { totalPoints: Math.round(totalPoints * 100) / 100 },
    });

    return { id: updated.id.toString(), totalPoints: updated.totalPoints };
  }

  // ─── Update quiz (teacher, restricted fields) ─────────────────────────────

  async update(quizId: bigint, teacherId: bigint, dto: UpdateQuizDto) {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id: quizId },
      include: { course: true, questions: { include: { answers: true } } },
    });
    if (!quiz) throw new NotFoundException('Quiz not found');
    if (quiz.course.userId !== teacherId) {
      throw new ForbiddenException('You can only edit your own quizzes');
    }

    const data: Record<string, unknown> = {};
    if (dto.deadline !== undefined) {
      data.deadline =
        dto.deadline != null ? new Date(dto.deadline * 1000) : null;
    }
    if (dto.timeLimit !== undefined) {
      data.timeLimit = dto.timeLimit ?? null;
    }

    if (Object.keys(data).length) {
      await this.prisma.quiz.update({ where: { id: quizId }, data });
    }

    if (dto.questions?.length) {
      for (const qUpdate of dto.questions) {
        const question = quiz.questions.find(
          (q) => q.id === BigInt(qUpdate.id),
        );
        if (!question) continue;

        const pointsChanged =
          qUpdate.points !== undefined && qUpdate.points !== question.points;
        const newPoints = qUpdate.points ?? question.points;

        const questionData: Record<string, unknown> = {};
        if (pointsChanged) questionData.points = newPoints;
        if (qUpdate.imageUrl !== undefined)
          questionData.imageUrl = qUpdate.imageUrl;
        if (Object.keys(questionData).length) {
          await this.prisma.quizQuestion.update({
            where: { id: question.id },
            data: questionData,
          });
        }

        if (qUpdate.answers?.length) {
          for (const aUpdate of qUpdate.answers) {
            const answer = question.answers.find(
              (a) => a.id === BigInt(aUpdate.id),
            );
            if (!answer) continue;
            const answerData: Record<string, unknown> = {};
            if (
              aUpdate.isCorrect !== undefined &&
              aUpdate.isCorrect !== answer.isCorrect
            ) {
              answerData.isCorrect = aUpdate.isCorrect;
            }
            if (aUpdate.imageUrl !== undefined)
              answerData.imageUrl = aUpdate.imageUrl;
            if (Object.keys(answerData).length) {
              await this.prisma.quizAnswer.update({
                where: { id: answer.id },
                data: answerData,
              });
            }
          }
        }

        const correctnessChanged =
          qUpdate.answers?.some((a) => {
            const orig = question.answers.find((oa) => oa.id === BigInt(a.id));
            return (
              orig &&
              a.isCorrect !== undefined &&
              a.isCorrect !== orig.isCorrect
            );
          }) ?? false;

        if (pointsChanged || correctnessChanged) {
          await this.recalculateSubmissionsForQuestion(question.id);
        }
      }
    }

    const updated = await this.prisma.quiz.findUnique({
      where: { id: quizId },
      include: {
        questions: {
          orderBy: { order: 'asc' },
          include: { answers: { orderBy: { order: 'asc' } } },
        },
      },
    });
    if (!updated) throw new NotFoundException('Quiz not found');
    return this.toQuizResponse(updated, true);
  }

  // ─── Delete quiz ──────────────────────────────────────────────────────────

  async remove(quizId: bigint, teacherId: bigint) {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id: quizId },
      include: { course: true },
    });
    if (!quiz) throw new NotFoundException('Quiz not found');
    if (quiz.course.userId !== teacherId) {
      throw new ForbiddenException('You can only delete your own quizzes');
    }
    await this.prisma.quiz.delete({ where: { id: quizId } });
    return { success: true };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private calculatePoints(
    question: { type: QuizQuestionType; points: number },
    answers: { id: bigint; isCorrect: boolean }[],
    selectedIds: bigint[],
  ): number {
    if (question.type === QuizQuestionType.ONE_ANSWER) {
      const selected = answers.find((a) => selectedIds.includes(a.id));
      return selected?.isCorrect ? question.points : 0;
    }
    if (question.type === QuizQuestionType.MULTI_ANSWER) {
      const correctCount = answers.filter((a) => a.isCorrect).length;
      if (correctCount === 0) return 0;
      const pointPerAnswer = question.points / correctCount;
      let score = 0;
      for (const answer of answers) {
        const isSelected = selectedIds.includes(answer.id);
        if (isSelected && answer.isCorrect) score += pointPerAnswer;
        else if (isSelected && !answer.isCorrect) score -= pointPerAnswer;
      }
      return Math.max(0, Math.round(score * 100) / 100);
    }
    return 0;
  }

  private async recalculateSubmissionsForQuestion(questionId: bigint) {
    const question = await this.prisma.quizQuestion.findUnique({
      where: { id: questionId },
      include: { answers: true },
    });
    if (!question || question.type === QuizQuestionType.OPEN_ANSWER) return;

    const subAnswers = await this.prisma.quizSubmissionAnswer.findMany({
      where: { questionId },
      include: { selectedAnswers: true },
    });

    const affectedSubmissionIds = new Set<bigint>();

    for (const subAnswer of subAnswers) {
      const selectedIds = subAnswer.selectedAnswers.map((a) => a.id);
      const earned = this.calculatePoints(
        question,
        question.answers,
        selectedIds,
      );
      await this.prisma.quizSubmissionAnswer.update({
        where: { id: subAnswer.id },
        data: { pointsEarned: earned },
      });
      affectedSubmissionIds.add(subAnswer.submissionId);
    }

    for (const submissionId of affectedSubmissionIds) {
      const allAnswers = await this.prisma.quizSubmissionAnswer.findMany({
        where: { submissionId },
      });
      const total = allAnswers.reduce((s, a) => s + (a.pointsEarned ?? 0), 0);
      await this.prisma.quizSubmission.update({
        where: { id: submissionId },
        data: { totalPoints: Math.round(total * 100) / 100 },
      });
    }
  }

  private async upsertAnswers(submissionId: bigint, dto: SaveQuizAnswersDto) {
    for (const item of dto.answers) {
      const questionId = BigInt(item.questionId);
      const selectedIds = (item.selectedAnswerIds ?? []).map((id) => ({
        id: BigInt(id),
      }));

      await this.prisma.quizSubmissionAnswer.upsert({
        where: { submissionId_questionId: { submissionId, questionId } },
        create: {
          submissionId,
          questionId,
          openText: item.openText ?? null,
          selectedAnswers: selectedIds.length
            ? { connect: selectedIds }
            : undefined,
        },
        update: {
          openText: item.openText ?? null,
          selectedAnswers: { set: selectedIds },
        },
      });
    }
  }

  private parseGeneratedQuiz(raw: string): unknown {
    const trimmed = raw.trim();
    const direct = this.tryParseJsonObject(trimmed);
    if (direct) return direct;

    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      const maybeJson = trimmed.slice(firstBrace, lastBrace + 1);
      const parsed = this.tryParseJsonObject(maybeJson);
      if (parsed) return parsed;
    }
    throw new BadRequestException('AI response was not valid JSON');
  }

  private tryParseJsonObject(value: string): Record<string, unknown> | null {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return null;
    } catch {
      return null;
    }
  }

  private validateGeneratedQuiz(source: unknown) {
    const result = GeneratedQuizSchema.safeParse(source);
    if (!result.success) {
      throw new BadRequestException(
        `AI returned invalid quiz schema: ${result.error.issues[0]?.message ?? 'unknown error'}`,
      );
    }
    return result.data;
  }

  private normalizeGeneratedQuestion(
    source: GeneratedQuizQuestion,
    index: number,
  ): {
    type: QuizQuestionType;
    text: string;
    points: number;
    order: number;
    answers: { text: string; isCorrect: boolean; order: number }[];
  } | null {
    const validType = source.type;
    const text = source.text.trim().slice(0, 2000);
    const points = Math.max(0, Math.round(source.points * 100) / 100);
    let answers = source.answers.map((a, i) => ({
      text: a.text.trim().slice(0, 1000),
      isCorrect: a.isCorrect,
      order: i,
    }));

    if (validType === QuizQuestionType.OPEN_ANSWER) {
      answers = [];
    } else {
      answers = answers.slice(0, 6);
      if (answers.length < 2) return null;
      const correctCount = answers.filter((a) => a.isCorrect).length;
      if (validType === QuizQuestionType.ONE_ANSWER) {
        if (correctCount === 0) answers[0].isCorrect = true;
        if (correctCount > 1) {
          let seen = false;
          answers = answers.map((a) => {
            if (!a.isCorrect || seen) return { ...a, isCorrect: false };
            seen = true;
            return a;
          });
        }
      } else if (correctCount === 0) {
        answers[0].isCorrect = true;
      }
    }

    return {
      type: validType,
      text,
      points,
      order: index,
      answers,
    };
  }

  private toQuizResponse(
    quiz: {
      id: bigint;
      title: string;
      description: string | null;
      courseId: bigint;
      timeLimit: number | null;
      deadline: Date | null;
      allowReview: boolean;
      showCorrectAnswers: boolean;
      showPointsPerQuestion: boolean;
      createdAt: Date;
      updatedAt: Date;
      questions: {
        id: bigint;
        type: QuizQuestionType;
        text: string;
        points: number;
        order: number;
        imageUrl: string | null;
        answers: {
          id: bigint;
          text: string;
          isCorrect: boolean;
          order: number;
          imageUrl: string | null;
        }[];
      }[];
    },
    includeCorrectAnswers: boolean,
  ) {
    return {
      id: quiz.id.toString(),
      title: quiz.title,
      description: quiz.description,
      courseId: quiz.courseId.toString(),
      timeLimit: quiz.timeLimit,
      deadline: quiz.deadline?.toISOString() ?? null,
      allowReview: quiz.allowReview,
      showCorrectAnswers: quiz.showCorrectAnswers,
      showPointsPerQuestion: quiz.showPointsPerQuestion,
      createdAt: quiz.createdAt.toISOString(),
      updatedAt: quiz.updatedAt.toISOString(),
      questions: quiz.questions.map((q) => ({
        id: q.id.toString(),
        type: q.type,
        text: q.text,
        points: q.points,
        order: q.order,
        imageUrl: q.imageUrl,
        answers: q.answers.map((a) => ({
          id: a.id.toString(),
          text: a.text,
          order: a.order,
          imageUrl: a.imageUrl,
          ...(includeCorrectAnswers ? { isCorrect: a.isCorrect } : {}),
        })),
      })),
    };
  }

  private toStudentSubmissionResponse(
    quiz: {
      allowReview: boolean;
      showCorrectAnswers: boolean;
      showPointsPerQuestion: boolean;
      questions: {
        id: bigint;
        type: QuizQuestionType;
        text: string;
        points: number;
        order: number;
        imageUrl: string | null;
        answers: {
          id: bigint;
          text: string;
          isCorrect: boolean;
          order: number;
          imageUrl: string | null;
        }[];
      }[];
    },
    submission: {
      id: bigint;
      quizId: bigint;
      userId: bigint;
      status: QuizSubmissionStatus;
      startedAt: Date;
      submittedAt: Date | null;
      totalPoints: number | null;
      answers: {
        questionId: bigint;
        openText: string | null;
        pointsEarned: number | null;
        selectedAnswers: { id: bigint }[];
      }[];
    },
  ) {
    const questions = quiz.questions.map((q) => {
      const subAnswer = submission.answers.find((a) => a.questionId === q.id);
      const selectedIds = new Set(
        subAnswer?.selectedAnswers.map((a) => a.id.toString()) ?? [],
      );

      return {
        id: q.id.toString(),
        type: q.type,
        text: q.text,
        points: q.points,
        order: q.order,
        imageUrl: q.imageUrl,
        answers: q.answers.map((a) => ({
          id: a.id.toString(),
          text: a.text,
          order: a.order,
          imageUrl: a.imageUrl,
          isSelected: selectedIds.has(a.id.toString()),
          ...(quiz.showCorrectAnswers ? { isCorrect: a.isCorrect } : {}),
        })),
        openText: subAnswer?.openText ?? null,
        ...(quiz.showPointsPerQuestion
          ? { pointsEarned: subAnswer?.pointsEarned ?? null }
          : {}),
      };
    });

    return {
      id: submission.id.toString(),
      quizId: submission.quizId.toString(),
      status: submission.status,
      startedAt: submission.startedAt.toISOString(),
      submittedAt: submission.submittedAt?.toISOString() ?? null,
      totalPoints: submission.totalPoints,
      allowReview: quiz.allowReview,
      showCorrectAnswers: quiz.showCorrectAnswers,
      showPointsPerQuestion: quiz.showPointsPerQuestion,
      questions,
    };
  }

  // ─── Delete submission (teacher resets a student's attempt) ─────────────

  async deleteSubmission(submissionId: bigint, teacherId: bigint) {
    const submission = await this.prisma.quizSubmission.findUnique({
      where: { id: submissionId },
      include: { quiz: { select: { courseId: true } } },
    });
    if (!submission) throw new NotFoundException('Submission not found');
    await this.assertTeacherOwnsCourse(submission.quiz.courseId, teacherId);
    await this.prisma.quizSubmission.delete({ where: { id: submissionId } });
    return { message: 'Submission deleted' };
  }

  private async assertTeacherOwnsCourse(courseId: bigint, teacherId: bigint) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });
    if (!course) throw new NotFoundException('Course not found');
    if (course.userId !== teacherId) {
      throw new ForbiddenException(
        'You can only create quizzes in your own courses',
      );
    }
  }

  private async assertCanAccessCourse(courseId: bigint, userId: bigint) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });
    if (!course) throw new NotFoundException('Course not found');
    const isTeacher = course.userId === userId;
    if (isTeacher) return;
    const isEnrolled = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });
    if (!isEnrolled)
      throw new ForbiddenException('You do not have access to this course');
  }
}
