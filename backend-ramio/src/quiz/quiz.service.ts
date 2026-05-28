import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AssignmentLanguage,
  QuizCodingGradingMode,
  QuizCodingTestRunStatus,
  QuizQuestionType,
  QuizSubmissionStatus,
} from '@prisma/client';
import sharp from 'sharp';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { BedrockService } from '../bedrock/bedrock.service';
import { CodeTestService } from '../code-test/code-test.service';
import type { RunCodeResponseDto } from '../code-test/dto/run-code.dto';
import type { CreateQuizDto } from './dto/create-quiz.dto';
import type { UpdateQuizDto } from './dto/update-quiz.dto';
import type { SaveQuizAnswersDto } from './dto/save-quiz-answers.dto';
import type { AssessQuizSubmissionDto } from './dto/assess-quiz-submission.dto';
import type { GenerateQuizDto } from './dto/generate-quiz.dto';
import type { RunQuizCodingTaskDto } from './dto/run-quiz-coding-task.dto';

const QUIZ_IMAGES_BUCKET = 'ramio-images';
const QUIZ_STORE_LOG_MAX_CHARS = 12_000;
const MAX_IMAGE_DIMENSION = 1920;
const ALLOWED_IMAGE_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const FALLBACK_AI_CODING_PYTHON_TESTS = `import unittest
import solution

class TestQuiz(unittest.TestCase):
    def test_stub(self):
        self.assertIsNotNone(solution)
`;
const FALLBACK_AI_CODING_PYTHON_STARTER = `# solution.py — define symbols your tests import.\n`;

function fallbackGeneratedTeacherTests(
  lang: AssignmentLanguage,
): string {
  switch (lang) {
    case AssignmentLanguage.PYTHON:
      return FALLBACK_AI_CODING_PYTHON_TESTS;
    default:
      return '// Replace with teacher tests that match Ramio runners for this language.\n';
  }
}

function fallbackGeneratedStarterCode(lang: AssignmentLanguage): string {
  switch (lang) {
    case AssignmentLanguage.PYTHON:
      return FALLBACK_AI_CODING_PYTHON_STARTER;
    case AssignmentLanguage.NODE_JS:
      return '// solution.js — exports required by your tests.\n';
    case AssignmentLanguage.JAVA:
      return '// Solution.java — define the class your tests expect.\n';
    case AssignmentLanguage.DOTNET:
      return '// Solution.cs — define types your tests expect.\n';
    default:
      return '';
  }
}

const GENERATE_PYTHON_UNITTEST_HINT = `
Ramio executes Python coding tasks using stdlib unittest only (never pytest): student file solution.py beside test_solution.py, run via unittest discover. Tests MUST use:
  import unittest
  import solution (or from solution import Name)
and class(es) subclassing unittest.TestCase with methods named test_* at module top level. Do not nest TestCase classes under if __name__ == '__main__':
`.trim();

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
    codingTaskLanguage: z
      .preprocess(
        (v) =>
          v === undefined || v === null
            ? undefined
            : typeof v === 'string'
              ? v.toUpperCase()
              : v,
        z.nativeEnum(AssignmentLanguage).optional(),
      )
      .optional(),
    codingTaskStarterCode: z.string().max(100_000).optional(),
    codingTaskTeacherTests: z.string().max(100_000).optional(),
    codingTaskGradingMode: z
      .preprocess(
        (v) =>
          v === undefined || v === null
            ? undefined
            : typeof v === 'string'
              ? v.toUpperCase()
              : v,
        z.nativeEnum(QuizCodingGradingMode).optional(),
      )
      .optional(),
    codingTaskAiReviewEnabled: z.boolean().optional(),
    codingTaskAiReviewRubric: z.string().max(4000).optional(),
  })
  .strict()
  .superRefine((q, ctx) => {
    const hasCodingField =
      q.codingTaskLanguage !== undefined ||
      (q.codingTaskStarterCode !== undefined &&
        q.codingTaskStarterCode.trim().length > 0) ||
      (q.codingTaskTeacherTests !== undefined &&
        q.codingTaskTeacherTests.trim().length > 0) ||
      q.codingTaskGradingMode !== undefined ||
      q.codingTaskAiReviewEnabled !== undefined ||
      (q.codingTaskAiReviewRubric !== undefined &&
        q.codingTaskAiReviewRubric.trim().length > 0);
    if (
      q.type !== QuizQuestionType.CODING_TASK &&
      hasCodingField
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'codingTask* keys are only allowed when type is CODING_TASK',
        path: ['type'],
      });
    }
  });

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
    private readonly codeTestService: CodeTestService,
  ) {}


  async uploadImage(file: Express.Multer.File): Promise<{ url: string }> {
    if (!ALLOWED_IMAGE_MIMES.includes(file.mimetype)) {
      throw new BadRequestException(
        'Only JPG, PNG, and WebP images are allowed.',
      );
    }
    if (file.size > MAX_IMAGE_BYTES) {
      throw new BadRequestException('Image must be 10 MB or smaller.');
    }

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


  async create(teacherId: bigint, dto: CreateQuizDto) {
    await this.assertTeacherOwnsCourse(BigInt(dto.courseId), teacherId);

    for (const q of dto.questions ?? []) {
      if (q.type === QuizQuestionType.CODING_TASK) {
        if (!q.codingTaskLanguage) {
          throw new BadRequestException(
            'Coding task questions must include codingTaskLanguage',
          );
        }
        if (!q.codingTaskTeacherTests?.trim()) {
          throw new BadRequestException(
            'Coding task questions must include non-empty codingTaskTeacherTests',
          );
        }
      }
    }

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
            ...(q.type === QuizQuestionType.CODING_TASK
              ? {
                  codingTaskLanguage: q.codingTaskLanguage as AssignmentLanguage,
                  codingTaskStarterCode: q.codingTaskStarterCode ?? null,
                  codingTaskTeacherTests:
                    q.codingTaskTeacherTests?.trim() ?? null,
                  codingTaskGradingMode:
                    q.codingTaskGradingMode ??
                    QuizCodingGradingMode.MANUAL_ONLY,
                  codingTaskAiReviewEnabled: q.codingTaskAiReviewEnabled ?? false,
                  codingTaskAiReviewRubric: q.codingTaskAiReviewRubric ?? null,
                }
              : {}),
            answers:
              q.type !== QuizQuestionType.OPEN_ANSWER &&
              q.type !== QuizQuestionType.CODING_TASK &&
              q.answers?.length
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

    const aiPrompt = `You create quiz drafts from what an instructor wants. Follow their briefing loosely: infer topic, difficulty, languages, mix of factual vs reasoning vs coding, and point weights if they omit details.

"""Instructor briefing (plain language—they are NOT responsible for formatting your reply):"""
${prompt}
"""

Aim for about ${requestedCount} questions unless the briefing clearly implies a different number.

When the briefing mentions coding, labs, implementations, functions, programs, \"write code\", debugger-style tasks, or autograding, include one or more CODING_TASK questions with clear specs in plain language in \"text\". Otherwise use multiple choice / short answer types as fits.

Coding tasks: infer programming language from context (assume PYTHON when unclear). Supply starter scaffolding and runnable teacher-side tests—not just a vague description—together with sensible defaults for grading unless the briefing contradicts.

---

Your reply for the grading app (machine-readable):

Return a single parsed JSON object and nothing else: no preamble, apologies, headings, markdown fences, or trailing commentary.

Structure:
• title — string  
• description — string (can summarize the briefing)  
• questions — array; each element has:

  • type: ONE_ANSWER | MULTI_ANSWER | OPEN_ANSWER | CODING_TASK  
  • text — what the learner sees  
  • points — number ≥ 0 (weight coding heavier if appropriate)  
  • answers — for EVERY question: array. Use [] only for OPEN_ANSWER or CODING_TASK. For ONE_ANSWER and MULTI_ANSWER use 2–6 answers { text, isCorrect }; ONE_ANSWER has exactly one correct, MULTI_ANSWER at least one.

  For each CODING_TASK also include strings:
    • codingTaskLanguage — PYTHON | NODE_JS | JAVA | DOTNET  
    • codingTaskStarterCode — what appears in their editor initially (embed newlines inside the JSON string); may be stubs or hints  
    • codingTaskTeacherTests — full runnable test source in that language as one JSON string  

  Optionally for CODING_TASK: codingTaskGradingMode (MANUAL_ONLY | TESTS_ONLY only; default sensible), codingTaskAiReviewEnabled boolean, codingTaskAiReviewRubric short optional string.

Python tests must match this runtime (${GENERATE_PYTHON_UNITTEST_HINT}).

Prefer concise wording; classroom-appropriate. Escape characters so the whole response is valid JSON.`;

    const raw = await this.bedrock.invoke(aiPrompt, 10_000);
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

    const totalPoints = await this.applyAutoGradedScores(
      submission.id,
      quiz,
      savedAnswers,
    );

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

    const totalPoints = await this.applyAutoGradedScores(
      submission.id,
      quiz,
      savedAnswers,
    );

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

  async runCodingTaskTests(
    quizId: bigint,
    studentId: bigint,
    dto: RunQuizCodingTaskDto,
  ): Promise<RunCodeResponseDto> {
    const submission = await this.prisma.quizSubmission.findUnique({
      where: { quizId_userId: { quizId, userId: studentId } },
    });
    if (!submission) throw new NotFoundException('Quiz not started');
    if (submission.status !== QuizSubmissionStatus.IN_PROGRESS) {
      throw new BadRequestException('Quiz already submitted');
    }

    const question = await this.prisma.quizQuestion.findFirst({
      where: { quizId, id: BigInt(dto.questionId) },
    });
    if (!question || question.type !== QuizQuestionType.CODING_TASK) {
      throw new BadRequestException('Not a coding task on this quiz');
    }

    const tests = question.codingTaskTeacherTests?.trim();
    const lang = question.codingTaskLanguage;
    let run: RunCodeResponseDto;
    if (!lang || !tests) {
      run = {
        success: false,
        exitCode: -1,
        stdout: '',
        stderr: 'This question has no runnable tests configured.',
        timedOut: false,
      };
    } else {
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
          openText: dto.code,
          codingTestRunStatus: QuizCodingTestRunStatus.RUNNING,
        },
        update: {
          openText: dto.code,
          codingTestRunStatus: QuizCodingTestRunStatus.RUNNING,
        },
      });
      try {
        run = await this.codeTestService.runByAssignmentLanguage(
          lang,
          dto.code,
          tests,
        );
      } catch {
        run = {
          success: false,
          exitCode: -1,
          stdout: '',
          stderr: 'Test runner failed unexpectedly.',
          timedOut: false,
        };
      }
    }

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
        openText: dto.code,
        codingTestRunStatus: QuizCodingTestRunStatus.DONE,
        codingTestStdout: this.truncateForQuizStore(run.stdout),
        codingTestStderr: this.truncateForQuizStore(run.stderr),
        codingTestExitCode: run.exitCode,
        codingTestTimedOut: run.timedOut ?? false,
        codingTestSuccess: run.success,
      },
      update: {
        openText: dto.code,
        codingTestRunStatus: QuizCodingTestRunStatus.DONE,
        codingTestStdout: this.truncateForQuizStore(run.stdout),
        codingTestStderr: this.truncateForQuizStore(run.stderr),
        codingTestExitCode: run.exitCode,
        codingTestTimedOut: run.timedOut ?? false,
        codingTestSuccess: run.success,
      },
    });

    return run;
  }


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

    return submissions.map((sub) => {
      const manualGradingPending = sub.answers.some((a) => {
        const t = a.question.type;
        if (t === QuizQuestionType.OPEN_ANSWER) {
          return a.pointsEarned == null;
        }
        if (t === QuizQuestionType.CODING_TASK) {
          const mode =
            a.question.codingTaskGradingMode ??
            QuizCodingGradingMode.MANUAL_ONLY;
          if (mode === QuizCodingGradingMode.TESTS_ONLY) return false;
          return a.pointsEarned == null;
        }
        return false;
      });
      return {
        id: sub.id.toString(),
        userId: sub.userId.toString(),
        username: sub.user.username,
        email: sub.user.email,
        submittedAt: sub.submittedAt?.toISOString() ?? null,
        totalPoints: sub.totalPoints,
        totalMax,
        isFullyGraded: !manualGradingPending,
      };
    });
  }


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
        ...(q.type === QuizQuestionType.CODING_TASK
          ? {
              codingTaskLanguage: q.codingTaskLanguage ?? null,
              codingTaskStarterCode: q.codingTaskStarterCode ?? null,
              codingTaskTeacherTests: q.codingTaskTeacherTests ?? null,
              codingTaskGradingMode: q.codingTaskGradingMode ?? null,
              codingTaskAiReviewEnabled: q.codingTaskAiReviewEnabled ?? false,
              codingTaskAiReviewRubric: q.codingTaskAiReviewRubric ?? null,
              codingTestStdout: subAnswer?.codingTestStdout ?? null,
              codingTestStderr: subAnswer?.codingTestStderr ?? null,
              codingTestExitCode: subAnswer?.codingTestExitCode ?? null,
              codingTestTimedOut: subAnswer?.codingTestTimedOut ?? null,
              codingTestSuccess: subAnswer?.codingTestSuccess ?? null,
              codingAutoPointsEarned: subAnswer?.codingAutoPointsEarned ?? null,
              codingAiReviewText: subAnswer?.codingAiReviewText ?? null,
              codingAiReviewedAt:
                subAnswer?.codingAiReviewedAt?.toISOString() ?? null,
            }
          : {}),
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
      if (
        question.type !== QuizQuestionType.OPEN_ANSWER &&
        question.type !== QuizQuestionType.CODING_TASK
      ) {
        throw new BadRequestException(
          `Question ${item.questionId} cannot be manually assessed`,
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


  private truncateForQuizStore(raw: string): string {
    if (raw.length <= QUIZ_STORE_LOG_MAX_CHARS) return raw;
    return `${raw.slice(0, QUIZ_STORE_LOG_MAX_CHARS)}\n…(truncated)`;
  }

  private async applyAutoGradedScores(
    submissionId: bigint,
    quiz: {
      questions: Array<{
        id: bigint;
        type: QuizQuestionType;
        points: number;
        text: string;
        answers: Array<{ id: bigint; isCorrect: boolean }>;
        codingTaskLanguage: AssignmentLanguage | null;
        codingTaskTeacherTests: string | null;
        codingTaskStarterCode: string | null;
        codingTaskGradingMode: QuizCodingGradingMode | null;
        codingTaskAiReviewEnabled: boolean;
        codingTaskAiReviewRubric: string | null;
      }>;
    },
    savedAnswers: Array<{
      questionId: bigint;
      openText: string | null;
      selectedAnswers: { id: bigint }[];
    }>,
  ): Promise<number> {
    let totalPoints = 0;
    for (const question of quiz.questions) {
      if (question.type === QuizQuestionType.OPEN_ANSWER) {
        continue;
      }
      if (question.type === QuizQuestionType.CODING_TASK) {
        const subAnswer = savedAnswers.find(
          (a) => a.questionId === question.id,
        );
        const code = subAnswer?.openText ?? null;
        totalPoints += await this.scoreCodingSubmissionOnFinalize(
          submissionId,
          question,
          code,
        );
        continue;
      }
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
            submissionId,
            questionId: question.id,
          },
        },
        create: {
          submissionId,
          questionId: question.id,
          pointsEarned: earned,
        },
        update: { pointsEarned: earned },
      });
      totalPoints += earned;
    }
    return totalPoints;
  }

  private async scoreCodingSubmissionOnFinalize(
    submissionId: bigint,
    question: {
      id: bigint;
      points: number;
      text: string;
      codingTaskLanguage: AssignmentLanguage | null;
      codingTaskTeacherTests: string | null;
      codingTaskStarterCode: string | null;
      codingTaskGradingMode: QuizCodingGradingMode | null;
      codingTaskAiReviewEnabled: boolean;
      codingTaskAiReviewRubric: string | null;
    },
    code: string | null,
  ): Promise<number> {
    const tests = question.codingTaskTeacherTests?.trim() ?? '';
    const lang = question.codingTaskLanguage;
    const mode =
      question.codingTaskGradingMode ?? QuizCodingGradingMode.MANUAL_ONLY;

    let run: RunCodeResponseDto;
    if (lang && tests && code?.trim()) {
      try {
        run = await this.codeTestService.runByAssignmentLanguage(
          lang,
          code,
          tests,
        );
      } catch {
        run = {
          success: false,
          exitCode: -1,
          stdout: '',
          stderr: 'Test runner failed unexpectedly.',
          timedOut: false,
        };
      }
    } else {
      run = {
        success: false,
        exitCode: -1,
        stdout: '',
        stderr:
          !lang || !tests
            ? 'Question is missing runnable tests.'
            : 'No code submitted.',
        timedOut: false,
      };
    }

    const success = !!run.success;
    const autoPts = success ? question.points : 0;
    let pointsEarned: number | null = null;
    if (mode === QuizCodingGradingMode.TESTS_ONLY) {
      pointsEarned = autoPts;
    }

    await this.prisma.quizSubmissionAnswer.upsert({
      where: {
        submissionId_questionId: {
          submissionId,
          questionId: question.id,
        },
      },
      create: {
        submissionId,
        questionId: question.id,
        openText: code,
        pointsEarned,
        codingTestRunStatus: QuizCodingTestRunStatus.DONE,
        codingTestStdout: this.truncateForQuizStore(run.stdout),
        codingTestStderr: this.truncateForQuizStore(run.stderr),
        codingTestExitCode: run.exitCode,
        codingTestTimedOut: run.timedOut ?? false,
        codingTestSuccess: success,
        codingAutoPointsEarned: autoPts,
      },
      update: {
        openText: code ?? undefined,
        pointsEarned,
        codingTestRunStatus: QuizCodingTestRunStatus.DONE,
        codingTestStdout: this.truncateForQuizStore(run.stdout),
        codingTestStderr: this.truncateForQuizStore(run.stderr),
        codingTestExitCode: run.exitCode,
        codingTestTimedOut: run.timedOut ?? false,
        codingTestSuccess: success,
        codingAutoPointsEarned: autoPts,
      },
    });

    if (question.codingTaskAiReviewEnabled && code?.trim()) {
      void this.maybeWriteCodingAiReview(
        submissionId,
        question.id,
        question,
        code,
        run,
      ).catch(() => undefined);
    }

    return pointsEarned ?? 0;
  }

  private async maybeWriteCodingAiReview(
    submissionId: bigint,
    questionId: bigint,
    question: {
      text: string;
      codingTaskStarterCode: string | null;
      codingTaskAiReviewRubric: string | null;
    },
    studentCode: string,
    run: RunCodeResponseDto,
  ): Promise<void> {
    try {
      const rubricNote = question.codingTaskAiReviewRubric
        ? `\nTeacher focus: ${question.codingTaskAiReviewRubric}`
        : '';
      const hint = `${run.success ? 'Tests exited successfully.' : 'Tests reported failure or errors.'}\nExit code ${run.exitCode}\nStdout (excerpt):\n${run.stdout.slice(0, 3000)}\nStderr (excerpt):\n${run.stderr.slice(0, 3000)}`;

      const prompt = `Give concise Markdown feedback on the student's quiz code. Be constructive and classroom-appropriate.${rubricNote}\nDo not reproduce hidden teacher test sources verbatim.\n\nProblem statement:\n${question.text}\n\nStarter template (may be blank):\n${question.codingTaskStarterCode ?? '(none)'}\n\nSubmitted code:\n${studentCode}\n\nRunner summary:\n${hint}`;

      const text = (await this.bedrock.invoke(prompt, 2048)).trim();

      await this.prisma.quizSubmissionAnswer.update({
        where: {
          submissionId_questionId: {
            submissionId,
            questionId,
          },
        },
        data: {
          codingAiReviewText:
            text.length > 28_000
              ? `${text.slice(0, 28_000)}\n(truncated)`
              : text,
          codingAiReviewedAt: new Date(),
        },
      });
    } catch {
      await this.prisma.quizSubmissionAnswer.update({
        where: {
          submissionId_questionId: {
            submissionId,
            questionId,
          },
        },
        data: {
          codingAiReviewText:
            '*AI review unavailable. Your submission was recorded.*',
          codingAiReviewedAt: new Date(),
        },
      });
    }
  }

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
    if (
      !question ||
      question.type === QuizQuestionType.OPEN_ANSWER ||
      question.type === QuizQuestionType.CODING_TASK
    ) {
      return;
    }

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
    codingTaskLanguage?: AssignmentLanguage;
    codingTaskStarterCode?: string;
    codingTaskTeacherTests?: string;
    codingTaskGradingMode?: QuizCodingGradingMode;
    codingTaskAiReviewEnabled?: boolean;
    codingTaskAiReviewRubric?: string | null;
  } | null {
    const validType = source.type;
    const text = source.text.trim().slice(0, 2000);
    const points = Math.max(0, Math.round(source.points * 100) / 100);
    let answers = source.answers.map((a, i) => ({
      text: a.text.trim().slice(0, 1000),
      isCorrect: a.isCorrect,
      order: i,
    }));

    if (
      validType === QuizQuestionType.OPEN_ANSWER ||
      validType === QuizQuestionType.CODING_TASK
    ) {
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

    if (validType === QuizQuestionType.CODING_TASK) {
      const lang =
        source.codingTaskLanguage ?? AssignmentLanguage.PYTHON;
      return {
        type: validType,
        text,
        points,
        order: index,
        answers,
        codingTaskLanguage: lang,
        codingTaskStarterCode: (
          source.codingTaskStarterCode?.trim() ||
          fallbackGeneratedStarterCode(lang)
        ).slice(0, 100_000),
        codingTaskTeacherTests: (
          source.codingTaskTeacherTests?.trim() ||
          fallbackGeneratedTeacherTests(lang)
        ).slice(0, 100_000),
        codingTaskGradingMode:
          source.codingTaskGradingMode ??
          QuizCodingGradingMode.MANUAL_ONLY,
        codingTaskAiReviewEnabled:
          source.codingTaskAiReviewEnabled ?? false,
        codingTaskAiReviewRubric:
          source.codingTaskAiReviewRubric?.trim().slice(0, 4000) ?? null,
      };
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
        codingTaskLanguage?: AssignmentLanguage | null;
        codingTaskStarterCode?: string | null;
        codingTaskTeacherTests?: string | null;
        codingTaskGradingMode?: QuizCodingGradingMode | null;
        codingTaskAiReviewEnabled?: boolean;
        codingTaskAiReviewRubric?: string | null;
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
        ...(q.type === QuizQuestionType.CODING_TASK
          ? {
              codingTaskLanguage: q.codingTaskLanguage ?? null,
              codingTaskStarterCode: q.codingTaskStarterCode ?? null,
              codingTaskGradingMode: q.codingTaskGradingMode ?? null,
              codingTaskAiReviewEnabled: q.codingTaskAiReviewEnabled ?? false,
              ...(includeCorrectAnswers
                ? {
                    codingTaskTeacherTests: q.codingTaskTeacherTests ?? null,
                    codingTaskAiReviewRubric: q.codingTaskAiReviewRubric ?? null,
                  }
                : {}),
            }
          : {}),
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
        codingTestStdout?: string | null;
        codingTestStderr?: string | null;
        codingTestExitCode?: number | null;
        codingTestTimedOut?: boolean | null;
        codingTestSuccess?: boolean | null;
        codingAutoPointsEarned?: number | null;
        codingAiReviewText?: string | null;
        codingAiReviewedAt?: Date | null;
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
        ...(q.type === QuizQuestionType.CODING_TASK
          ? {
              codingTestStdout: subAnswer?.codingTestStdout ?? null,
              codingTestStderr: subAnswer?.codingTestStderr ?? null,
              codingTestExitCode: subAnswer?.codingTestExitCode ?? null,
              codingTestTimedOut: subAnswer?.codingTestTimedOut ?? null,
              codingTestSuccess: subAnswer?.codingTestSuccess ?? null,
              codingAutoPointsEarned: subAnswer?.codingAutoPointsEarned ?? null,
              codingAiReviewText: subAnswer?.codingAiReviewText ?? null,
              codingAiReviewedAt:
                subAnswer?.codingAiReviewedAt?.toISOString() ?? null,
            }
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
