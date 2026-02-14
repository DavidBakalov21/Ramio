import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateCourseDto } from './dto/create-course.dto';
import type { UpdateCourseDto } from './dto/update-course.dto';

@Injectable()
export class CourseService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: bigint, role: UserRole | null, page: number, pageSize: number) {
    const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
    const normalizedPageSize =
      Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : 10;
    const safePageSize = Math.min(Math.max(normalizedPageSize, 1), 50);

    const skip = (safePage - 1) * safePageSize;

    if (role !== UserRole.TEACHER && role !== UserRole.STUDENT) {
      return {
        items: [],
        total: 0,
        page: safePage,
        pageSize: safePageSize,
        totalPages: 1,
      };
    }

    const where =
      role === UserRole.TEACHER
        ? { userId }
        : { enrollments: { some: { userId } } };

    const [total, courses] = await Promise.all([
      this.prisma.course.count({ where }),
      this.prisma.course.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: safePageSize,
        include: {
          user: { select: { username: true, email: true } },
          _count: { select: { enrollments: true, assignments: true } },
          enrollments: { where: { userId }, select: { id: true } },
        },
      }),
    ]);

    const items = courses.map((c) => ({
      ...this.toResponse(c),
      teacherName: c.user.username ?? c.user.email,
      enrollmentCount: c._count.enrollments,
      assignmentCount: c._count.assignments,
      isTeacher: c.userId === userId,
      isEnrolled: c.enrollments.length > 0,
    }));

    const totalPages =
      total === 0 ? 1 : Math.max(1, Math.ceil(total / safePageSize));

    return {
      items,
      total,
      page: safePage,
      pageSize: safePageSize,
      totalPages,
    };
  }

  async findAllUnfiltered(
    userId: bigint,
    role: UserRole | null,
    page: number,
    pageSize: number,
  ) {
    const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
    const normalizedPageSize =
      Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : 10;
    const safePageSize = Math.min(Math.max(normalizedPageSize, 1), 50);

    const skip = (safePage - 1) * safePageSize;

    const [total, courses] = await Promise.all([
      this.prisma.course.count(),
      this.prisma.course.findMany({
        orderBy: { updatedAt: 'desc' },
        skip,
        take: safePageSize,
        include: {
          user: { select: { username: true, email: true } },
          _count: { select: { enrollments: true, assignments: true } },
          enrollments: { where: { userId }, select: { id: true } },
        },
      }),
    ]);

    const items = courses.map((c) => ({
      ...this.toResponse(c),
      teacherName: c.user.username ?? c.user.email,
      enrollmentCount: c._count.enrollments,
      assignmentCount: c._count.assignments,
      isTeacher: c.userId === userId,
      isEnrolled: c.enrollments.length > 0,
    }));

    const totalPages =
      total === 0 ? 1 : Math.max(1, Math.ceil(total / safePageSize));

    return {
      items,
      total,
      page: safePage,
      pageSize: safePageSize,
      totalPages,
    };
  }

  async findOne(courseId: bigint, userId: bigint) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      include: {
        user: { select: { username: true, email: true } },
        _count: { select: { enrollments: true, assignments: true } },
        enrollments: { where: { userId }, select: { id: true } },
      },
    });
    if (!course) throw new NotFoundException('Course not found');
    const isTeacher = course.userId === userId;
    const isEnrolled = course.enrollments.length > 0;
    if (!isTeacher && !isEnrolled) {
      throw new ForbiddenException('You do not have access to this course');
    }
    return {
      ...this.toResponse(course),
      teacherName: course.user.username ?? course.user.email,
      enrollmentCount: course._count.enrollments,
      assignmentCount: course._count.assignments,
      isTeacher,
      isEnrolled,
    };
  }

  async create(teacherId: bigint, dto: CreateCourseDto) {
    const course = await this.prisma.course.create({
      data: {
        title: dto.title,
        description: dto.description ?? null,
        userId: teacherId,
      },
    });
    return this.toResponse(course);
  }

  async update(courseId: bigint, teacherId: bigint, dto: UpdateCourseDto) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });
    if (!course) {
      throw new NotFoundException('Course not found');
    }
    if (course.userId !== teacherId) {
      throw new ForbiddenException('You can only edit your own courses');
    }
    const updated = await this.prisma.course.update({
      where: { id: courseId },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
      },
    });
    return this.toResponse(updated);
  }

  async enroll(courseId: bigint, studentId: bigint) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });
    if (!course) {
      throw new NotFoundException('Course not found');
    }
    const existing = await this.prisma.enrollment.findUnique({
      where: {
        userId_courseId: { userId: studentId, courseId },
      },
    });
    if (existing) {
      throw new ConflictException('You are already enrolled in this course');
    }
    const enrollment = await this.prisma.enrollment.create({
      data: {
        userId: studentId,
        courseId,
      },
      include: { course: true },
    });
    return {
      id: enrollment.id.toString(),
      courseId: enrollment.courseId.toString(),
      enrolledAt: enrollment.enrolledAt,
      course: this.toResponse(enrollment.course),
    };
  }

  private toResponse(course: { id: bigint; title: string; description: string | null; createdAt: Date; updatedAt: Date; userId: bigint }) {
    return {
      id: course.id.toString(),
      title: course.title,
      description: course.description,
      createdAt: course.createdAt,
      updatedAt: course.updatedAt,
      teacherId: course.userId.toString(),
    };
  }
}
