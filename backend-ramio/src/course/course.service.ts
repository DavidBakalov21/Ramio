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
          pendingEnrollments: { where: { userId }, select: { id: true } },
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
      hasPendingRequest: c.pendingEnrollments.length > 0,
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
          pendingEnrollments: { where: { userId }, select: { id: true } },
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
      hasPendingRequest: c.pendingEnrollments.length > 0,
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
        _count: {
          select: {
            enrollments: true,
            assignments: true,
            pendingEnrollments: true,
          },
        },
        enrollments: { where: { userId }, select: { id: true } },
        pendingEnrollments: { where: { userId }, select: { id: true } },
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
      hasPendingRequest: course.pendingEnrollments.length > 0,
      pendingRequestCount: isTeacher ? course._count.pendingEnrollments : 0,
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

  /** Student requests to enroll; teacher must accept before student is added to course. */
  async requestEnroll(courseId: bigint, studentId: bigint) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });
    if (!course) {
      throw new NotFoundException('Course not found');
    }
    const existingEnrollment = await this.prisma.enrollment.findUnique({
      where: {
        userId_courseId: { userId: studentId, courseId },
      },
    });
    if (existingEnrollment) {
      throw new ConflictException('You are already enrolled in this course');
    }
    const existingPending = await this.prisma.pendingEnrollment.findUnique({
      where: {
        userId_courseId: { userId: studentId, courseId },
      },
    });
    if (existingPending) {
      throw new ConflictException('You already have a pending request for this course');
    }
    const pending = await this.prisma.pendingEnrollment.create({
      data: {
        userId: studentId,
        courseId,
      },
      include: { course: true },
    });
    return {
      id: pending.id.toString(),
      courseId: pending.courseId.toString(),
      requestedAt: pending.createdAt,
      course: this.toResponse(pending.course),
    };
  }

  async getPendingEnrollments(courseId: bigint, teacherId: bigint) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });
    if (!course) throw new NotFoundException('Course not found');
    if (course.userId !== teacherId) {
      throw new ForbiddenException('Only the course teacher can view pending requests');
    }
    const list = await this.prisma.pendingEnrollment.findMany({
      where: { courseId },
      include: {
        user: { select: { id: true, username: true, email: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return list.map((p) => ({
      id: p.id.toString(),
      courseId: p.courseId.toString(),
      userId: p.userId.toString(),
      requestedAt: p.createdAt,
      username: p.user.username ?? null,
      email: p.user.email,
    }));
  }

  async acceptPendingEnrollment(
    courseId: bigint,
    pendingId: bigint,
    teacherId: bigint,
  ) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });
    if (!course) throw new NotFoundException('Course not found');
    if (course.userId !== teacherId) {
      throw new ForbiddenException('Only the course teacher can accept requests');
    }
    const pending = await this.prisma.pendingEnrollment.findFirst({
      where: { id: pendingId, courseId },
      include: { user: true },
    });
    if (!pending) {
      throw new NotFoundException('Pending enrollment request not found');
    }
    await this.prisma.$transaction([
      this.prisma.enrollment.create({
        data: {
          userId: pending.userId,
          courseId,
        },
      }),
      this.prisma.pendingEnrollment.delete({
        where: { id: pendingId },
      }),
    ]);
    return {
      message: 'Student accepted and enrolled',
      userId: pending.userId.toString(),
      courseId: courseId.toString(),
    };
  }

  async declinePendingEnrollment(
    courseId: bigint,
    pendingId: bigint,
    teacherId: bigint,
  ) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });
    if (!course) throw new NotFoundException('Course not found');
    if (course.userId !== teacherId) {
      throw new ForbiddenException('Only the course teacher can decline requests');
    }
    const pending = await this.prisma.pendingEnrollment.findFirst({
      where: { id: pendingId, courseId },
    });
    if (!pending) {
      throw new NotFoundException('Pending enrollment request not found');
    }
    await this.prisma.pendingEnrollment.delete({
      where: { id: pendingId },
    });
    return {
      message: 'Request declined',
      courseId: courseId.toString(),
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
