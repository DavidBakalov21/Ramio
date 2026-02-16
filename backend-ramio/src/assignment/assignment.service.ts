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
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import type { CreateAssignmentDto } from './dto/create-assignment.dto';
import type { UpdateAssignmentDto } from './dto/update-assignment.dto';
import type { RunCodeResponseDto } from '../code-test/dto/run-code.dto';

const ASSIGNMENT_BUCKET_KEY = 'S3_BUCKET_ASSIGNMENTS';
const DEFAULT_BUCKET_KEY = 'S3_BUCKET';

@Injectable()
export class AssignmentService {
  private readonly assignmentBucket: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
    private readonly codeTestService: CodeTestService,
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
      include: { test: true },
      orderBy: { createdAt: 'desc' },
    });
    const assignmentIds = assignments.map((a) => a.id);
    const submissions = await this.prisma.assignmentSubmission.findMany({
      where: { userId, assignmentId: { in: assignmentIds } },
      select: { assignmentId: true },
    });
    const submittedIds = new Set(
      submissions.map((s) => s.assignmentId.toString()),
    );
    return assignments.map((a) => ({
      ...this.toAssignmentResponse(a),
      submitted: submittedIds.has(a.id.toString()),
    }));
  }

  async findOne(assignmentId: bigint, userId: bigint) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: { course: true, test: true },
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
    };
  }

  async update(assignmentId: bigint, teacherId: bigint, dto: UpdateAssignmentDto) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: { course: true },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');
    if (assignment.course.userId !== teacherId) {
      throw new ForbiddenException('You can only edit assignments in your own courses');
    }
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
      include: { course: true, test: true },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');
    if (assignment.course.userId !== teacherId) {
      throw new ForbiddenException('You can only delete assignments in your own courses');
    }
    if (assignment.test) {
      await this.storage.deleteFile(assignment.test.key, this.assignmentBucket);
    }
    await this.prisma.assignment.delete({ where: { id: assignmentId } });
    return { success: true };
  }

  async getTestFileContent(assignmentId: bigint, teacherId: bigint): Promise<string> {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: { course: true, test: true },
    });
    console.log(assignment);
    if (!assignment) throw new NotFoundException('Assignment not found');
    if (assignment.course.userId !== teacherId) {
      throw new ForbiddenException('You can only view test files for your own assignments');
    }
    if (!assignment.test) {
      throw new NotFoundException('No test file for this assignment');
    }
    return this.storage.getFileContentAsText(
      assignment.test.key,
      this.assignmentBucket,
    );
  }

  async getTestFileContentForRun(assignmentId: bigint, userId: bigint): Promise<string> {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: { course: true, test: true },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');
    await this.assertCanAccessCourse(assignment.courseId, userId);
    if (!assignment.test) {
      throw new NotFoundException('This assignment has no tests configured yet');
    }
    return this.storage.getFileContentAsText(
      assignment.test.key,
      this.assignmentBucket,
    );
  }

 
  async runAssignment(
    assignmentId: bigint,
    userId: bigint,
    code: string,
  ): Promise<RunCodeResponseDto> {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: { course: true, test: true },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');
    await this.assertCanAccessCourse(assignment.courseId, userId);
    if (!assignment.test) {
      throw new BadRequestException('This assignment has no tests configured');
    }
    const testContent = await this.storage.getFileContentAsText(
      assignment.test.key,
      this.assignmentBucket,
    );
    if (assignment.language === AssignmentLanguage.PYTHON) {
      return this.codeTestService.runPythonTests(code, testContent);
    }
    if (assignment.language === AssignmentLanguage.NODE_JS) {
      throw new BadRequestException('Running Node.js assignments in the sandbox is not supported yet');
    }
    throw new BadRequestException('Unsupported assignment language');
  }

  async uploadTestFile(
    assignmentId: bigint,
    teacherId: bigint,
    file: Express.Multer.File,
  ) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: { course: true, test: true },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');
    if (assignment.course.userId !== teacherId) {
      throw new ForbiddenException('You can only upload test files to your own assignments');
    }
    const filename =
      file.originalname?.split(/[/\\]/).pop() ?? 'test-file';
    const key = `tests/${assignmentId}/${filename}`;
    const { url } = await this.storage.overwriteFile(file, this.assignmentBucket, key);
    const name = file.originalname ?? 'test-file';

    if (assignment.test) {
      if (assignment.test.key !== key) {
        await this.storage.deleteFile(assignment.test.key, this.assignmentBucket);
      }
      const updated = await this.prisma.testFile.update({
        where: { id: assignment.test.id },
        data: { url, key, name },
      });
      return this.toTestFileResponse(updated);
    }

    const testFile = await this.prisma.testFile.create({
      data: {
        url,
        key,
        name,
        assignmentId,
      },
    });
    return this.toTestFileResponse(testFile);
  }

  async createSubmission(
    assignmentId: bigint,
    studentId: bigint,
    files?: Express.Multer.File[],
  ) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: { course: true },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');
    const enrollment = await this.prisma.enrollment.findUnique({
      where: {
        userId_courseId: { userId: studentId, courseId: assignment.courseId },
      },
    });
    if (!enrollment) {
      throw new ForbiddenException('You must be enrolled in this course to submit');
    }

    const existing = await this.prisma.assignmentSubmission.findUnique({
      where: {
        assignmentId_userId: { assignmentId, userId: studentId },
      },
    });
    if (existing) {
      throw new ConflictException('You have already submitted this assignment');
    }

    const submission = await this.prisma.assignmentSubmission.create({
      data: {
        assignmentId,
        userId: studentId,
        teacherFeedback: '',
      },
      include: { assignment: true },
    });

    if (files?.length) {
      const solutionPrefix = `solutions/${assignmentId}/${studentId}/`;
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
    studentId: bigint,
    files: Express.Multer.File[],
  ) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: { course: true },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');
    const enrollment = await this.prisma.enrollment.findUnique({
      where: {
        userId_courseId: { userId: studentId, courseId: assignment.courseId },
      },
    });
    if (!enrollment) {
      throw new ForbiddenException('You must be enrolled in this course to submit');
    }

    const submission = await this.prisma.assignmentSubmission.findUnique({
      where: {
        assignmentId_userId: { assignmentId, userId: studentId },
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

    if (files?.length) {
      const solutionPrefix = `solutions/${assignmentId}/${studentId}/`;
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
      solutionContent,
    };
  }

  private async assertTeacherOwnsCourse(courseId: bigint, teacherId: bigint) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });
    if (!course) throw new NotFoundException('Course not found');
    if (course.userId !== teacherId) {
      throw new ForbiddenException('You can only create assignments in your own courses');
    }
  }

  private async assertCanAccessCourse(courseId: bigint, userId: bigint) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });
    if (!course) throw new NotFoundException('Course not found');
    const isTeacher = course.userId === userId;
    const isEnrolled = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });
    if (!isTeacher && !isEnrolled) {
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
    test?: { id: bigint; url: string; key: string; name: string } | null;
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
      test: a.test ? this.toTestFileResponse(a.test) : null,
    };
  }

  private toTestFileResponse(t: { id: bigint; url: string; key: string; name: string }) {
    return {
      id: t.id.toString(),
      url: t.url,
      key: t.key,
      name: t.name,
    };
  }

  private toSubmissionResponse(s: {
    id: bigint;
    assignmentId: bigint;
    userId: bigint;
    completedAt: Date;
    solutionFiles: { id: bigint; url: string; key: string; name: string }[];
    assignment: { id: bigint; title: string };
  }) {
    return {
      id: s.id.toString(),
      assignmentId: s.assignmentId.toString(),
      userId: s.userId.toString(),
      completedAt: s.completedAt,
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
