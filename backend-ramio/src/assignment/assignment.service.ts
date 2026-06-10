import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { AssignmentLanguage } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { CodeTestService } from '../code-test/code-test.service';
import { BedrockService } from '../bedrock/bedrock.service';
import { PrismaService } from '../prisma/prisma.service';
import { CourseAccessService } from '../course/course-access.service';
import { StorageService } from '../storage/storage.service';
import type { CreateAssignmentDto } from './dto/create-assignment.dto';
import type { UpdateAssignmentDto } from './dto/update-assignment.dto';
import type { RunCodeResponseDto } from '../code-test/dto/run-code.dto';
import type { AssessSubmissionDto } from './dto/assess-submission.dto';
import type { SubmissionChatDto } from './dto/submission-chat.dto';

const ASSIGNMENT_BUCKET_KEY = 'S3_BUCKET_ASSIGNMENTS';
const DEFAULT_BUCKET_KEY = 'S3_BUCKET';

const LANGUAGE_TO_TEST_LANGUAGE: Record<
  AssignmentLanguage,
  'python' | 'javascript' | 'java' | 'csharp' | 'cpp'
> = {
  PYTHON: 'python',
  NODE_JS: 'javascript',
  JAVA: 'java',
  DOTNET: 'csharp',
  CPP: 'cpp',
};

@Injectable()
export class AssignmentService {
  private readonly assignmentBucket: string;
  private readonly gradedChatTestCache = new Map<
    string,
    { summary: string; at: number }
  >();
  private static readonly GRADED_CHAT_TEST_CACHE_TTL_MS = 30 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
    private readonly codeTestService: CodeTestService,
    private readonly bedrock: BedrockService,
    private readonly courseAccess: CourseAccessService,
  ) {
    this.assignmentBucket =
      this.config.get<string>(ASSIGNMENT_BUCKET_KEY) ??
      this.config.get<string>(DEFAULT_BUCKET_KEY) ??
      'ramio-file-storage';
  }

  async create(teacherId: bigint, dto: CreateAssignmentDto) {
    await this.assertTeacherOwnsCourse(BigInt(dto.courseId), teacherId);
    const dueDate = dto.dueDate != null ? new Date(dto.dueDate * 1000) : null;
    const assignment = await this.prisma.assignment.create({
      data: {
        title: dto.title,
        description: dto.description ?? null,
        points: dto.points ?? 100,
        language: dto.language ?? AssignmentLanguage.PYTHON,
        dueDate,
        courseId: BigInt(dto.courseId),
      },
    });
    return this.toAssignmentResponse(assignment);
  }

  async findByCourse(courseId: bigint, userId: bigint) {
    await this.assertCanAccessCourse(courseId, userId);
    const assignments = await this.prisma.assignment.findMany({
      where: { courseId },
      include: { tests: true },
      orderBy: { createdAt: 'desc' },
    });
    const assignmentIds = assignments.map((a) => a.id);
    const submissions = await this.prisma.assignmentSubmission.findMany({
      where: { userId, assignmentId: { in: assignmentIds } },
      select: { assignmentId: true, isChecked: true },
    });
    const submissionStatusByAssignment = new Map<
      string,
      { submitted: boolean; isChecked: boolean }
    >();
    for (const s of submissions) {
      const key = s.assignmentId.toString();
      submissionStatusByAssignment.set(key, {
        submitted: true,
        isChecked: !!s.isChecked,
      });
    }
    return assignments.map((a) => ({
      ...this.toAssignmentResponse(a),
      submitted:
        submissionStatusByAssignment.get(a.id.toString())?.submitted ?? false,
      isChecked:
        submissionStatusByAssignment.get(a.id.toString())?.isChecked ?? false,
    }));
  }

  async findOne(assignmentId: bigint, userId: bigint) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: { course: true, tests: true },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');
    await this.assertCanAccessCourse(assignment.courseId, userId);
    const submission = await this.prisma.assignmentSubmission.findUnique({
      where: {
        assignmentId_userId: { assignmentId, userId },
      },
    });
    return {
      ...this.toAssignmentResponse(assignment),
      submitted: !!submission,
      isChecked: !!submission?.isChecked,
    };
  }

  async update(
    assignmentId: bigint,
    teacherId: bigint,
    dto: UpdateAssignmentDto,
  ) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: { course: true },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');
    await this.courseAccess.assertCanManageLoadedCourse(assignment.course, teacherId);
    const dueDate =
      dto.dueDate !== undefined
        ? dto.dueDate != null
          ? new Date(dto.dueDate * 1000)
          : null
        : undefined;
    const updated = await this.prisma.assignment.update({
      where: { id: assignmentId },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.points !== undefined && { points: dto.points }),
        ...(dto.language !== undefined && { language: dto.language }),
        ...(dueDate !== undefined && { dueDate }),
      },
    });
    return this.toAssignmentResponse(updated);
  }

  async remove(assignmentId: bigint, teacherId: bigint) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: { course: true, tests: true },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');
    await this.courseAccess.assertCanManageLoadedCourse(assignment.course, teacherId);
    for (const t of assignment.tests) {
      await this.storage.deleteFile(t.key, this.assignmentBucket);
    }
    await this.prisma.assignment.delete({ where: { id: assignmentId } });
    return { success: true };
  }

  async getTestFilesOverview(assignmentId: bigint, teacherId: bigint) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: { course: true, tests: true },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');
    await this.courseAccess.assertCanManageLoadedCourse(assignment.course, teacherId);
    return assignment.tests.map((t) => this.toTestFileResponse(t));
  }

  async getTestFileContentForLanguage(
    assignmentId: bigint,
    teacherId: bigint,
    language: AssignmentLanguage,
  ): Promise<string> {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: { course: true },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');
    await this.courseAccess.assertCanManageLoadedCourse(assignment.course, teacherId);
    const testFile = await this.prisma.testFile.findUnique({
      where: { assignmentId_language: { assignmentId, language } },
    });
    if (!testFile) {
      throw new NotFoundException(`No test file for language ${language}`);
    }
    return this.storage.getFileContentAsText(
      testFile.key,
      this.assignmentBucket,
    );
  }

  async uploadTestFileForLanguage(
    assignmentId: bigint,
    teacherId: bigint,
    language: AssignmentLanguage,
    file: Express.Multer.File,
  ) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: { course: true },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');
    await this.courseAccess.assertCanManageLoadedCourse(assignment.course, teacherId);
    const filename = file.originalname?.split(/[/\\]/).pop() ?? 'test-file';
    const key = `tests/${assignmentId}/${language}/${filename}`;
    const { url } = await this.storage.overwriteFile(
      file,
      this.assignmentBucket,
      key,
    );
    const name = file.originalname ?? 'test-file';

    const existing = await this.prisma.testFile.findUnique({
      where: { assignmentId_language: { assignmentId, language } },
    });

    if (existing) {
      if (existing.key !== key) {
        await this.storage.deleteFile(existing.key, this.assignmentBucket);
      }
      const updated = await this.prisma.testFile.update({
        where: { id: existing.id },
        data: { url, key, name },
      });
      return this.toTestFileResponse(updated);
    }

    const testFile = await this.prisma.testFile.create({
      data: { url, key, name, language, assignmentId },
    });
    return this.toTestFileResponse(testFile);
  }

  async deleteTestFileForLanguage(
    assignmentId: bigint,
    teacherId: bigint,
    language: AssignmentLanguage,
  ) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: { course: true },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');
    await this.courseAccess.assertCanManageLoadedCourse(assignment.course, teacherId);
    const testFile = await this.prisma.testFile.findUnique({
      where: { assignmentId_language: { assignmentId, language } },
    });
    if (!testFile) {
      throw new NotFoundException(`No test file for language ${language}`);
    }
    await this.storage.deleteFile(testFile.key, this.assignmentBucket);
    await this.prisma.testFile.delete({ where: { id: testFile.id } });
    return { success: true };
  }

  async generateTestFileForLanguage(
    assignmentId: bigint,
    teacherId: bigint,
    language: AssignmentLanguage,
  ): Promise<{ code: string }> {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: { course: true },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');
    await this.courseAccess.assertCanManageLoadedCourse(assignment.course, teacherId);
    const description =
      `${assignment.title}\n\n${assignment.description ?? ''}`.trim();
    const testLanguage = LANGUAGE_TO_TEST_LANGUAGE[language];
    const code = await this.codeTestService.generateUnitTestsFromDescription(
      description,
      testLanguage,
    );
    return { code };
  }

  async runAssignment(
    assignmentId: bigint,
    userId: bigint,
    code: string,
    language?: AssignmentLanguage,
  ): Promise<RunCodeResponseDto> {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: { course: true, tests: true },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');
    await this.assertCanAccessCourse(assignment.courseId, userId);

    const lang = language ?? assignment.language;
    const testFile = assignment.tests.find((t) => t.language === lang);
    if (!testFile) {
      throw new BadRequestException(
        `This assignment has no test configured for ${lang}`,
      );
    }
    const testContent = await this.storage.getFileContentAsText(
      testFile.key,
      this.assignmentBucket,
    );
    return this.runByLanguage(lang, code, testContent);
  }

  async createSubmission(
    assignmentId: bigint,
    userId: bigint,
    files?: Express.Multer.File[],
    language?: AssignmentLanguage,
  ) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: { course: true },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');
    const isTeacher = await this.courseAccess.isManagerOfLoadedCourse(assignment.course, userId);
    if (!isTeacher) {
      const enrollment = await this.prisma.enrollment.findUnique({
        where: {
          userId_courseId: { userId, courseId: assignment.courseId },
        },
      });
      if (!enrollment) {
        throw new ForbiddenException(
          'You must be enrolled in this course to submit',
        );
      }
    }

    const existing = await this.prisma.assignmentSubmission.findUnique({
      where: {
        assignmentId_userId: { assignmentId, userId },
      },
    });
    if (existing) {
      throw new ConflictException('You have already submitted this assignment');
    }

    const submission = await this.prisma.assignmentSubmission.create({
      data: {
        assignmentId,
        userId,
        teacherFeedback: '',
        language: language ?? null,
      },
      include: { assignment: true },
    });

    if (files?.length) {
      const solutionPrefix = `solutions/${assignmentId}/${userId}/`;
      for (const file of files) {
        const { url, key } = await this.storage.uploadFile(
          file,
          this.assignmentBucket,
          solutionPrefix,
        );
        const name = file.originalname ?? 'file';
        await this.prisma.submissionFile.create({
          data: { url, key, name, submissionId: submission.id },
        });
      }
    }

    const withFiles = await this.prisma.assignmentSubmission.findUnique({
      where: { id: submission.id },
      include: { solutionFiles: true, assignment: true },
    });
    return this.toSubmissionResponse(withFiles!);
  }

  async updateSubmission(
    assignmentId: bigint,
    userId: bigint,
    files: Express.Multer.File[],
    language?: AssignmentLanguage,
  ) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: { course: true },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');
    const isTeacher = await this.courseAccess.isManagerOfLoadedCourse(assignment.course, userId);
    if (!isTeacher) {
      const enrollment = await this.prisma.enrollment.findUnique({
        where: {
          userId_courseId: { userId, courseId: assignment.courseId },
        },
      });
      if (!enrollment) {
        throw new ForbiddenException(
          'You must be enrolled in this course to submit',
        );
      }
    }

    const submission = await this.prisma.assignmentSubmission.findUnique({
      where: {
        assignmentId_userId: { assignmentId, userId },
      },
      include: { solutionFiles: true, assignment: true },
    });
    if (!submission) {
      throw new NotFoundException('You have not submitted this assignment yet');
    }

    for (const f of submission.solutionFiles) {
      await this.storage.deleteFile(f.key, this.assignmentBucket);
    }
    await this.prisma.submissionFile.deleteMany({
      where: { submissionId: submission.id },
    });

    const data: Record<string, unknown> = {};
    if (language !== undefined) data.language = language;

    if (Object.keys(data).length) {
      await this.prisma.assignmentSubmission.update({
        where: { id: submission.id },
        data,
      });
    }

    if (files?.length) {
      const solutionPrefix = `solutions/${assignmentId}/${userId}/`;
      for (const file of files) {
        const { url, key } = await this.storage.uploadFile(
          file,
          this.assignmentBucket,
          solutionPrefix,
        );
        const name = file.originalname ?? 'file';
        await this.prisma.submissionFile.create({
          data: { url, key, name, submissionId: submission.id },
        });
      }
    }

    const updated = await this.prisma.assignmentSubmission.findUnique({
      where: { id: submission.id },
      include: { solutionFiles: true, assignment: true },
    });
    return this.toSubmissionResponse(updated!);
  }

  async getSubmission(assignmentId: bigint, userId: bigint) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: { course: true },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');
    await this.assertCanAccessCourse(assignment.courseId, userId);

    const submission = await this.prisma.assignmentSubmission.findUnique({
      where: {
        assignmentId_userId: { assignmentId, userId },
      },
      include: { solutionFiles: true, assignment: true },
    });
    if (!submission) throw new NotFoundException('No submission found');

    let solutionContent: string | null = null;
    const firstFile = submission.solutionFiles[0];
    if (firstFile) {
      try {
        solutionContent = await this.storage.getFileContentAsText(
          firstFile.key,
          this.assignmentBucket,
        );
      } catch {
        solutionContent = null;
      }
    }

    return {
      ...this.toSubmissionResponse(submission),
      teacherFeedback: submission.teacherFeedback,
      points: submission.points,
      isChecked: submission.isChecked,
      checkedAt: submission.checkedAt?.toISOString() ?? null,
      language: submission.language ?? null,
      solutionContent,
    };
  }

  async getSubmissionsByAssignment(assignmentId: bigint, teacherId: bigint) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: { course: true },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');
    await this.courseAccess.assertCanManageLoadedCourse(assignment.course, teacherId);
    const submissions = await this.prisma.assignmentSubmission.findMany({
      where: { assignmentId },
      include: { user: true, solutionFiles: true, assignment: true },
      orderBy: { completedAt: 'desc' },
    });
    return submissions.map((s) => ({
      ...this.toSubmissionResponse(s),
      teacherFeedback: s.teacherFeedback,
      points: s.points,
      isChecked: s.isChecked,
      checkedAt: s.checkedAt?.toISOString() ?? null,
      language: s.language ?? null,
      user: {
        id: s.user.id.toString(),
        username: s.user.username,
        email: s.user.email,
      },
    }));
  }

  async getSubmissionById(submissionId: bigint, teacherId: bigint) {
    const submission = await this.prisma.assignmentSubmission.findUnique({
      where: { id: submissionId },
      include: {
        solutionFiles: true,
        assignment: { include: { course: true } },
        user: true,
      },
    });
    if (!submission) throw new NotFoundException('Submission not found');
    await this.courseAccess.assertCanManageLoadedCourse(submission.assignment.course, teacherId);
    let solutionContent: string | null = null;
    const firstFile = submission.solutionFiles[0];
    if (firstFile) {
      try {
        solutionContent = await this.storage.getFileContentAsText(
          firstFile.key,
          this.assignmentBucket,
        );
      } catch {
        solutionContent = null;
      }
    }
    return {
      ...this.toSubmissionResponse(submission),
      teacherFeedback: submission.teacherFeedback,
      points: submission.points,
      isChecked: submission.isChecked,
      checkedAt: submission.checkedAt?.toISOString() ?? null,
      language: submission.language ?? null,
      user: {
        id: submission.user.id.toString(),
        username: submission.user.username,
        email: submission.user.email,
      },
      assignment: {
        id: submission.assignment.id.toString(),
        title: submission.assignment.title,
        points: submission.assignment.points,
        language: submission.assignment.language,
      },
      solutionContent,
    };
  }

  async runSubmissionTests(
    submissionId: bigint,
    teacherId: bigint,
  ): Promise<RunCodeResponseDto> {
    const submission = await this.prisma.assignmentSubmission.findUnique({
      where: { id: submissionId },
      include: {
        solutionFiles: true,
        assignment: { include: { course: true, tests: true } },
      },
    });
    if (!submission) throw new NotFoundException('Submission not found');
    await this.courseAccess.assertCanManageLoadedCourse(submission.assignment.course, teacherId);

    const lang = submission.language ?? submission.assignment.language;
    const testFile = submission.assignment.tests.find(
      (t) => t.language === lang,
    );
    if (!testFile) {
      throw new BadRequestException(
        `No test configured for language ${lang} on this assignment`,
      );
    }

    let code = '';
    const firstFile = submission.solutionFiles[0];
    if (firstFile) {
      try {
        code = await this.storage.getFileContentAsText(
          firstFile.key,
          this.assignmentBucket,
        );
      } catch {
        throw new BadRequestException('Could not read submission file');
      }
    }
    if (!code.trim()) {
      throw new BadRequestException('Submission has no code');
    }
    const testContent = await this.storage.getFileContentAsText(
      testFile.key,
      this.assignmentBucket,
    );
    return this.runByLanguage(lang, code, testContent);
  }

  async assessSubmission(
    submissionId: bigint,
    teacherId: bigint,
    dto: AssessSubmissionDto,
  ) {
    const submission = await this.prisma.assignmentSubmission.findUnique({
      where: { id: submissionId },
      include: { assignment: { include: { course: true } } },
    });
    if (!submission) throw new NotFoundException('Submission not found');
    await this.courseAccess.assertCanManageLoadedCourse(submission.assignment.course, teacherId);
    const data: Record<string, unknown> = {};
    if (dto.teacherFeedback !== undefined)
      data.teacherFeedback = dto.teacherFeedback;
    if (dto.points !== undefined) data.points = dto.points;
    if (dto.isChecked !== undefined) {
      data.isChecked = dto.isChecked;
      if (dto.isChecked) data.checkedAt = new Date();
    }
    const updated = await this.prisma.assignmentSubmission.update({
      where: { id: submissionId },
      data,
      include: { solutionFiles: true, assignment: true },
    });
    return {
      ...this.toSubmissionResponse(updated),
      teacherFeedback: updated.teacherFeedback,
      points: updated.points,
      isChecked: updated.isChecked,
      checkedAt: updated.checkedAt?.toISOString() ?? null,
    };
  }

  async getAiFeedbackForSubmission(
    assignmentId: bigint,
    submissionId: bigint,
    teacherId: bigint,
  ) {
    const submission = await this.prisma.assignmentSubmission.findUnique({
      where: { id: submissionId },
      include: {
        solutionFiles: true,
        assignment: { include: { course: true } },
      },
    });
    if (!submission) {
      throw new NotFoundException('Submission not found');
    }
    if (submission.assignment.id !== assignmentId) {
      throw new BadRequestException(
        'Submission does not belong to this assignment',
      );
    }
    await this.courseAccess.assertCanManageLoadedCourse(submission.assignment.course, teacherId);

    let code = '';
    const firstFile = submission.solutionFiles[0];
    if (firstFile) {
      try {
        code = await this.storage.getFileContentAsText(
          firstFile.key,
          this.assignmentBucket,
        );
      } catch {
        throw new BadRequestException('Could not read submission file');
      }
    }
    if (!code.trim()) {
      throw new BadRequestException('Submission has no code');
    }

    const effectiveLanguage =
      submission.language ?? submission.assignment.language;
    const { feedback, suggestedPoints } =
      await this.bedrock.generateSubmissionFeedback({
        language: effectiveLanguage,
        assignmentTitle: submission.assignment.title,
        assignmentDescription: submission.assignment.description,
        maxPoints: submission.assignment.points,
        code,
      });

    return { feedback, suggestedPoints };
  }

  async studentGradedSubmissionChat(
    assignmentId: bigint,
    studentId: bigint,
    dto: SubmissionChatDto,
  ): Promise<{ reply: string }> {
    const messages = dto.messages ?? [];
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new BadRequestException(
        'messages is required and must not be empty',
      );
    }
    if (messages.length > 40) {
      throw new BadRequestException('Too many messages in one request');
    }
    const last = messages[messages.length - 1];
    if (last.role !== 'user' || !last.content?.trim()) {
      throw new BadRequestException(
        'Last message must be a non-empty user message',
      );
    }
    for (const m of messages) {
      if (m.content && m.content.length > 12000) {
        throw new BadRequestException('Message too long');
      }
      if (m.role !== 'user' && m.role !== 'assistant') {
        throw new BadRequestException('Invalid message role');
      }
    }

    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: { course: true, tests: true },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');
    await this.assertCanAccessCourse(assignment.courseId, studentId);

    const submission = await this.prisma.assignmentSubmission.findUnique({
      where: {
        assignmentId_userId: { assignmentId, userId: studentId },
      },
      include: { solutionFiles: true, assignment: true },
    });
    if (!submission) {
      throw new NotFoundException('No submission found for this assignment');
    }
    if (!submission.isChecked) {
      throw new ForbiddenException(
        'AI chat is only available after your submission has been graded',
      );
    }

    let code = '';
    const firstFile = submission.solutionFiles[0];
    if (firstFile) {
      try {
        code = await this.storage.getFileContentAsText(
          firstFile.key,
          this.assignmentBucket,
        );
      } catch {
        throw new BadRequestException('Could not read submission file');
      }
    }

    const effectiveLang = submission.language ?? assignment.language;

    const cacheKey = `${submission.id.toString()}:${studentId.toString()}`;
    const cached = this.gradedChatTestCache.get(cacheKey);
    const cacheValid =
      cached &&
      Date.now() - cached.at < AssignmentService.GRADED_CHAT_TEST_CACHE_TTL_MS;

    let testSummary: string;
    if (cacheValid) {
      testSummary = cached!.summary;
    } else {
      testSummary =
        'Tests were not run (no test file or unsupported language).';
      const testFile = assignment.tests.find(
        (t) => t.language === effectiveLang,
      );
      if (effectiveLang === AssignmentLanguage.PYTHON && testFile) {
        try {
          const testContent = await this.storage.getFileContentAsText(
            testFile.key,
            this.assignmentBucket,
          );
          const run = await this.codeTestService.runPythonTests(
            code,
            testContent,
          );
          testSummary = [
            `Success: ${run.success}`,
            `Exit code: ${run.exitCode}`,
            run.timedOut ? 'Timed out: yes' : 'Timed out: no',
            run.stdout ? `Stdout:\n${run.stdout}` : '',
            run.stderr ? `Stderr:\n${run.stderr}` : '',
          ]
            .filter(Boolean)
            .join('\n');
        } catch {
          testSummary = 'Automated test run failed to execute.';
        }
      } else if (effectiveLang === AssignmentLanguage.NODE_JS) {
        testSummary =
          'Node.js sandbox tests are not run server-side in this environment; rely on assignment description and teacher feedback.';
      }
      this.gradedChatTestCache.set(cacheKey, {
        summary: testSummary,
        at: Date.now(),
      });
    }

    const langLabel =
      {
        PYTHON: 'Python',
        NODE_JS: 'JavaScript / Node.js',
        JAVA: 'Java',
        DOTNET: 'C# / .NET',
        CPP: 'C++',
      }[effectiveLang] ?? effectiveLang;

    const system = `You are a supportive programming tutor helping a student reflect on their graded assignment.

Context (use this to answer; do not invent facts not supported below):

Assignment:
- Title: ${assignment.title}
- Description: ${assignment.description ?? '(none)'}
- Language: ${langLabel}
- Max points: ${assignment.points}

Student's grade:
- Points: ${submission.points} / ${assignment.points}
- Teacher feedback (may be empty):
"""
${submission.teacherFeedback ?? '(none)'}
"""

Student's submitted code:
"""
${code || '(no code on file)'}
"""

Automated test run (same runner as in the course sandbox):
"""
${testSummary}
"""

Rules:
- Be clear, encouraging, and educational.
- Help the student understand mistakes and how to improve; do not just repeat the teacher's words.
- If something is unknown from the context, say so.
- Do not reveal hidden test source code verbatim; you may discuss behavior and outcomes shown in the test output.
- Keep answers focused and not excessively long.`;

    const reply = await this.bedrock.chatWithSystem(system, messages, 4096);
    return { reply: reply.trim() };
  }

  private runByLanguage(
    language: AssignmentLanguage,
    code: string,
    testContent: string,
  ): Promise<RunCodeResponseDto> {
    return this.codeTestService.runByAssignmentLanguage(
      language,
      code,
      testContent,
    );
  }

  private async assertTeacherOwnsCourse(courseId: bigint, teacherId: bigint) {
    await this.courseAccess.assertCanManageCourse(courseId, teacherId);
  }

  private async assertCanAccessCourse(courseId: bigint, userId: bigint) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });
    if (!course) throw new NotFoundException('Course not found');
    if (await this.courseAccess.isCourseManager(courseId, userId)) return;
    const isEnrolled = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });
    if (!isEnrolled) {
      throw new ForbiddenException('You do not have access to this course');
    }
  }

  private toAssignmentResponse(a: {
    id: bigint;
    title: string;
    description: string | null;
    points: number;
    language: AssignmentLanguage;
    dueDate: Date | null;
    createdAt: Date;
    updatedAt: Date;
    courseId: bigint;
    tests?: {
      id: bigint;
      url: string;
      key: string;
      name: string;
      language: AssignmentLanguage;
    }[];
  }) {
    return {
      id: a.id.toString(),
      title: a.title,
      description: a.description,
      points: a.points,
      language: a.language,
      dueDate: a.dueDate?.toISOString() ?? null,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
      courseId: a.courseId.toString(),
      tests: (a.tests ?? []).map((t) => this.toTestFileResponse(t)),
    };
  }

  private toTestFileResponse(t: {
    id: bigint;
    url: string;
    key: string;
    name: string;
    language: AssignmentLanguage;
  }) {
    return {
      id: t.id.toString(),
      url: t.url,
      key: t.key,
      name: t.name,
      language: t.language,
    };
  }

  private toSubmissionResponse(s: {
    id: bigint;
    assignmentId: bigint;
    userId: bigint;
    completedAt: Date;
    language?: AssignmentLanguage | null;
    solutionFiles: { id: bigint; url: string; key: string; name: string }[];
    assignment: { id: bigint; title: string };
  }) {
    return {
      id: s.id.toString(),
      assignmentId: s.assignmentId.toString(),
      userId: s.userId.toString(),
      completedAt: s.completedAt,
      language: s.language ?? null,
      solutionFiles: s.solutionFiles.map((f) => ({
        id: f.id.toString(),
        url: f.url,
        key: f.key,
        name: f.name,
      })),
      assignment: {
        id: s.assignment.id.toString(),
        title: s.assignment.title,
      },
    };
  }
}
