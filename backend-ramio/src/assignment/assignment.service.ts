import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { AssignmentLanguage } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import type { CreateAssignmentDto } from './dto/create-assignment.dto';
import type { UpdateAssignmentDto } from './dto/update-assignment.dto';

const ASSIGNMENT_BUCKET_KEY = 'S3_BUCKET_ASSIGNMENTS';

@Injectable()
export class AssignmentService {
  private readonly assignmentBucket: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
  ) {
    this.assignmentBucket =
      this.config.get<string>(ASSIGNMENT_BUCKET_KEY) ?? 'assignments';
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
    return assignments.map((a) => this.toAssignmentResponse(a));
  }

  async findOne(assignmentId: bigint, userId: bigint) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: { course: true, test: true },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');
    await this.assertCanAccessCourse(assignment.courseId, userId);
    return this.toAssignmentResponse(assignment);
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
    const { url, key } = await this.storage.uploadFile(file, this.assignmentBucket, 'tests/');
    const name = file.originalname ?? 'test-file';

    if (assignment.test) {
      await this.storage.deleteFile(assignment.test.key, this.assignmentBucket);
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
      },
      include: { assignment: true },
    });

    if (files?.length) {
      for (const file of files) {
        const { url, key } = await this.storage.uploadFile(file, this.assignmentBucket);
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
