import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateCourseDto } from './dto/create-course.dto';
import type { UpdateCourseDto } from './dto/update-course.dto';
import { CourseAccessService } from './course-access.service';

@Injectable()
export class CourseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly courseAccess: CourseAccessService,
  ) {}

  async findAll(
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
        ? {
            OR: [
              { userId },
              { assistants: { some: { userId } } },
            ],
          }
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
          _count: {
            select: { enrollments: true, assignments: true, projects: true },
          },
          enrollments: { where: { userId }, select: { id: true } },
          pendingEnrollments: { where: { userId }, select: { id: true } },
          assistants: { where: { userId }, select: { id: true } },
        },
      }),
    ]);

    const items = courses.map((c) => ({
      ...this.toResponse(c),
      teacherName: c.user.username ?? c.user.email,
      enrollmentCount: c._count.enrollments,
      assignmentCount: c._count.assignments,
      projectCount: c._count.projects,
      isTeacher: c.userId === userId || c.assistants.length > 0,
      isCourseOwner: c.userId === userId,
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
    search?: string,
  ) {
    const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
    const normalizedPageSize =
      Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : 10;
    const safePageSize = Math.min(Math.max(normalizedPageSize, 1), 50);

    const skip = (safePage - 1) * safePageSize;
    const titleFilter = this.buildTitleSearchFilter(search);

    const [total, courses] = await Promise.all([
      this.prisma.course.count({ where: titleFilter }),
      this.prisma.course.findMany({
        where: titleFilter,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: safePageSize,
        include: {
          user: { select: { username: true, email: true } },
          _count: {
            select: { enrollments: true, assignments: true, projects: true },
          },
          enrollments: { where: { userId }, select: { id: true } },
          pendingEnrollments: { where: { userId }, select: { id: true } },
          assistants: { where: { userId }, select: { id: true } },
        },
      }),
    ]);

    const items = courses.map((c) => ({
      ...this.toResponse(c),
      teacherName: c.user.username ?? c.user.email,
      enrollmentCount: c._count.enrollments,
      assignmentCount: c._count.assignments,
      projectCount: c._count.projects,
      isTeacher: c.userId === userId || c.assistants.length > 0,
      isCourseOwner: c.userId === userId,
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
            projects: true,
            pendingEnrollments: true,
          },
        },
        enrollments: { where: { userId }, select: { id: true } },
        pendingEnrollments: { where: { userId }, select: { id: true } },
        assistants: { where: { userId }, select: { id: true } },
      },
    });
    if (!course) throw new NotFoundException('Course not found');
    const isCourseOwner = course.userId === userId;
    const isAssistant = course.assistants.length > 0;
    const isTeacher = isCourseOwner || isAssistant;
    const isEnrolled = course.enrollments.length > 0;
    if (!isTeacher && !isEnrolled) {
      throw new ForbiddenException('You do not have access to this course');
    }
    return {
      ...this.toResponse(course),
      teacherName: course.user.username ?? course.user.email,
      enrollmentCount: course._count.enrollments,
      assignmentCount: course._count.assignments,
      projectCount: course._count.projects,
      isTeacher,
      isCourseOwner,
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
        isOpen: dto.isOpen ?? false,
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
    await this.courseAccess.assertCanManageCourse(courseId, teacherId);
    const updated = await this.prisma.course.update({
      where: { id: courseId },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.isOpen !== undefined && { isOpen: dto.isOpen }),
      },
    });
    return this.toResponse(updated);
  }

  async remove(courseId: bigint, teacherId: bigint) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });
    if (!course) {
      throw new NotFoundException('Course not found');
    }
    await this.courseAccess.assertCourseOwner(courseId, teacherId);

    await this.prisma.course.delete({ where: { id: courseId } });
    return { success: true };
  }

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

    if (course.isOpen) {
      const enrollment = await this.prisma.enrollment.create({
        data: { userId: studentId, courseId },
        include: { course: true },
      });
      return {
        enrolled: true,
        courseId: enrollment.courseId.toString(),
        course: this.toResponse(enrollment.course),
      };
    }

    const existingPending = await this.prisma.pendingEnrollment.findUnique({
      where: {
        userId_courseId: { userId: studentId, courseId },
      },
    });
    if (existingPending) {
      throw new ConflictException(
        'You already have a pending request for this course',
      );
    }
    const pending = await this.prisma.pendingEnrollment.create({
      data: {
        userId: studentId,
        courseId,
      },
      include: { course: true },
    });
    return {
      enrolled: false,
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
    await this.courseAccess.assertCanManageCourse(courseId, teacherId);
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
    await this.courseAccess.assertCanManageCourse(courseId, teacherId);
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
    await this.courseAccess.assertCanManageCourse(courseId, teacherId);
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

  async removeEnrollment(
    courseId: bigint,
    studentId: bigint,
    teacherId: bigint,
  ) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });
    if (!course) throw new NotFoundException('Course not found');
    await this.courseAccess.assertCanManageCourse(courseId, teacherId);
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId: studentId, courseId } },
    });
    if (!enrollment)
      throw new NotFoundException('Student is not enrolled in this course');
    await this.prisma.enrollment.delete({
      where: { userId_courseId: { userId: studentId, courseId } },
    });
    return { message: 'Student removed from course' };
  }

  async enrollStudents(
    courseId: bigint,
    managerId: bigint,
    emails: string[],
  ) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });
    if (!course) throw new NotFoundException('Course not found');
    await this.courseAccess.assertCanManageCourse(courseId, managerId);

    let enrolled = 0;
    let skipped = 0;
    let notFound = 0;
    const results: Array<{
      email: string;
      status: 'enrolled' | 'skipped' | 'not_found';
      userId?: string;
      reason?: string;
    }> = [];

    for (const rawEmail of emails) {
      const email = rawEmail.trim().toLowerCase();
      const user = await this.prisma.user.findUnique({
        where: { email },
        select: { id: true, role: true },
      });

      if (!user) {
        notFound++;
        results.push({ email, status: 'not_found' });
        continue;
      }

      if (user.role === UserRole.TEACHER) {
        skipped++;
        results.push({
          email,
          status: 'skipped',
          userId: user.id.toString(),
          reason: 'not_a_student',
        });
        continue;
      }

      const existingEnrollment = await this.prisma.enrollment.findUnique({
        where: {
          userId_courseId: { userId: user.id, courseId },
        },
      });
      if (existingEnrollment) {
        skipped++;
        results.push({
          email,
          status: 'skipped',
          userId: user.id.toString(),
          reason: 'already_enrolled',
        });
        continue;
      }

      await this.prisma.$transaction([
        this.prisma.enrollment.create({
          data: { userId: user.id, courseId },
        }),
        this.prisma.pendingEnrollment.deleteMany({
          where: { userId: user.id, courseId },
        }),
      ]);

      enrolled++;
      results.push({
        email,
        status: 'enrolled',
        userId: user.id.toString(),
      });
    }

    return { enrolled, skipped, notFound, total: emails.length, results };
  }

  async getStudentResults(courseId: bigint, teacherId: bigint) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      include: {
        assignments: {
          orderBy: { createdAt: 'asc' },
          select: { id: true, title: true, points: true },
        },
        projects: {
          orderBy: { createdAt: 'asc' },
          select: { id: true, title: true, points: true },
        },
        quizzes: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            title: true,
            questions: { select: { points: true, type: true } },
          },
        },
        enrollments: {
          include: {
            user: { select: { id: true, username: true, email: true } },
          },
        },
      },
    });
    if (!course) throw new NotFoundException('Course not found');
    await this.courseAccess.assertCanManageCourse(courseId, teacherId);

    const enrollmentUserIds = course.enrollments.map((e) => e.userId);

    const assignmentIds = course.assignments.map((a) => a.id);
    const submissions = await this.prisma.assignmentSubmission.findMany({
      where: {
        assignmentId: { in: assignmentIds },
        userId: { in: enrollmentUserIds },
      },
      select: {
        assignmentId: true,
        userId: true,
        points: true,
        isChecked: true,
      },
    });

    const submissionMap = new Map<
      string,
      { points: number; isChecked: boolean }
    >();
    for (const s of submissions) {
      submissionMap.set(`${s.userId}-${s.assignmentId}`, {
        points: s.points,
        isChecked: s.isChecked,
      });
    }

    const projectIds = course.projects.map((p) => p.id);
    const projectSubmissions = await this.prisma.projectSubmission.findMany({
      where: {
        projectId: { in: projectIds },
        userId: { in: enrollmentUserIds },
      },
      select: {
        projectId: true,
        userId: true,
        points: true,
        isChecked: true,
      },
    });

    const projectSubmissionMap = new Map<
      string,
      { points: number; isChecked: boolean }
    >();
    for (const s of projectSubmissions) {
      projectSubmissionMap.set(`${s.userId}-${s.projectId}`, {
        points: s.points,
        isChecked: s.isChecked,
      });
    }

    const quizIds = course.quizzes.map((q) => q.id);
    const quizSubmissions = await this.prisma.quizSubmission.findMany({
      where: {
        quizId: { in: quizIds },
        userId: { in: enrollmentUserIds },
        status: 'SUBMITTED',
      },
      include: {
        answers: {
          select: {
            pointsEarned: true,
            question: {
              select: { type: true, codingTaskGradingMode: true },
            },
          },
        },
      },
    });

    const quizSubMap = new Map<
      string,
      { points: number; isFullyGraded: boolean }
    >();
    for (const s of quizSubmissions) {
      const hasUngradedOpen = s.answers.some((a) => {
        const t = a.question.type;
        if (t === 'OPEN_ANSWER') return a.pointsEarned == null;
        if (t === 'CODING_TASK') {
          const mode = a.question.codingTaskGradingMode ?? 'MANUAL_ONLY';
          if (mode === 'TESTS_ONLY') return false;
          return a.pointsEarned == null;
        }
        return false;
      });
      quizSubMap.set(`${s.userId}-${s.quizId}`, {
        points: s.totalPoints ?? 0,
        isFullyGraded: !hasUngradedOpen,
      });
    }

    const totalMaxAssignments = course.assignments.reduce(
      (sum, a) => sum + a.points,
      0,
    );
    const totalMaxProjects = course.projects.reduce(
      (sum, p) => sum + p.points,
      0,
    );
    const totalMaxQuizzes = course.quizzes.reduce(
      (sum, q) => sum + q.questions.reduce((s, qn) => s + qn.points, 0),
      0,
    );
    const totalMax = totalMaxAssignments + totalMaxProjects + totalMaxQuizzes;

    const students = course.enrollments.map((e) => {
      const assignmentResults = course.assignments.map((a) => {
        const sub = submissionMap.get(`${e.userId}-${a.id}`);
        return sub
          ? {
              points: sub.points,
              maxPoints: a.points,
              isChecked: sub.isChecked,
            }
          : null;
      });
      const projectResults = course.projects.map((p) => {
        const sub = projectSubmissionMap.get(`${e.userId}-${p.id}`);
        return sub
          ? {
              points: sub.points,
              maxPoints: p.points,
              isChecked: sub.isChecked,
            }
          : null;
      });
      const quizResults = course.quizzes.map((q) => {
        const maxPoints = q.questions.reduce((s, qn) => s + qn.points, 0);
        const sub = quizSubMap.get(`${e.userId}-${q.id}`);
        return sub
          ? { points: sub.points, maxPoints, isChecked: sub.isFullyGraded }
          : null;
      });
      const totalEarned =
        assignmentResults.reduce((sum, r) => sum + (r?.points ?? 0), 0) +
        projectResults.reduce((sum, r) => sum + (r?.points ?? 0), 0) +
        quizResults.reduce((sum, r) => sum + (r?.points ?? 0), 0);
      return {
        userId: e.user.id.toString(),
        username: e.user.username ?? null,
        email: e.user.email,
        assignmentResults,
        projectResults,
        quizResults,
        totalEarned,
        totalMax,
      };
    });

    return {
      assignments: course.assignments.map((a) => ({
        id: a.id.toString(),
        title: a.title,
        maxPoints: a.points,
      })),
      projects: course.projects.map((p) => ({
        id: p.id.toString(),
        title: p.title,
        maxPoints: p.points,
      })),
      quizzes: course.quizzes.map((q) => ({
        id: q.id.toString(),
        title: q.title,
        maxPoints: q.questions.reduce((s, qn) => s + qn.points, 0),
      })),
      students: students.sort((a, b) =>
        (a.username ?? a.email).localeCompare(b.username ?? b.email),
      ),
    };
  }

  async getAssistants(courseId: bigint, ownerId: bigint) {
    await this.courseAccess.assertCourseOwner(courseId, ownerId);
    const [assistants, pendingInvites] = await Promise.all([
      this.prisma.courseAssistant.findMany({
        where: { courseId },
        include: {
          user: { select: { id: true, username: true, email: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.pendingCourseAssistantInvite.findMany({
        where: { courseId },
        include: {
          user: { select: { id: true, username: true, email: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    return {
      assistants: assistants.map((a) => ({
        userId: a.user.id.toString(),
        username: a.user.username ?? null,
        email: a.user.email,
        joinedAt: a.createdAt,
      })),
      pendingInvites: pendingInvites.map((p) => ({
        id: p.id.toString(),
        userId: p.user.id.toString(),
        username: p.user.username ?? null,
        email: p.user.email,
        invitedAt: p.createdAt,
      })),
    };
  }

  async inviteAssistant(courseId: bigint, ownerId: bigint, email: string) {
    await this.courseAccess.assertCourseOwner(courseId, ownerId);
    const normalizedEmail = email.trim().toLowerCase();
    const invitee = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (!invitee) {
      throw new NotFoundException('No user found with that email');
    }
    if (invitee.role !== UserRole.TEACHER) {
      throw new BadRequestException('Only teachers can be invited as assistants');
    }
    if (invitee.id === ownerId) {
      throw new BadRequestException('You cannot invite yourself');
    }
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { userId: true },
    });
    if (!course) throw new NotFoundException('Course not found');
    if (course.userId === invitee.id) {
      throw new BadRequestException('The course owner is already the teacher');
    }
    const existingAssistant = await this.prisma.courseAssistant.findUnique({
      where: {
        userId_courseId: { userId: invitee.id, courseId },
      },
    });
    if (existingAssistant) {
      throw new ConflictException('This teacher is already an assistant');
    }
    const existingInvite =
      await this.prisma.pendingCourseAssistantInvite.findUnique({
        where: {
          userId_courseId: { userId: invitee.id, courseId },
        },
      });
    if (existingInvite) {
      throw new ConflictException('An invite is already pending for this teacher');
    }
    const invite = await this.prisma.pendingCourseAssistantInvite.create({
      data: {
        userId: invitee.id,
        courseId,
        invitedBy: ownerId,
      },
      include: {
        user: { select: { username: true, email: true } },
        course: { select: { title: true } },
      },
    });
    return {
      id: invite.id.toString(),
      courseId: invite.courseId.toString(),
      courseTitle: invite.course.title,
      userId: invite.userId.toString(),
      email: invite.user.email,
      username: invite.user.username ?? null,
      invitedAt: invite.createdAt,
    };
  }

  async removeAssistant(
    courseId: bigint,
    assistantUserId: bigint,
    ownerId: bigint,
  ) {
    await this.courseAccess.assertCourseOwner(courseId, ownerId);
    const assistant = await this.prisma.courseAssistant.findUnique({
      where: {
        userId_courseId: { userId: assistantUserId, courseId },
      },
    });
    if (!assistant) {
      throw new NotFoundException('Assistant not found on this course');
    }
    await this.prisma.courseAssistant.delete({
      where: { id: assistant.id },
    });
    return { message: 'Assistant removed' };
  }

  async cancelAssistantInvite(
    courseId: bigint,
    inviteId: bigint,
    ownerId: bigint,
  ) {
    await this.courseAccess.assertCourseOwner(courseId, ownerId);
    const invite = await this.prisma.pendingCourseAssistantInvite.findFirst({
      where: { id: inviteId, courseId },
    });
    if (!invite) {
      throw new NotFoundException('Pending assistant invite not found');
    }
    await this.prisma.pendingCourseAssistantInvite.delete({
      where: { id: inviteId },
    });
    return { message: 'Invite cancelled' };
  }

  async getMyAssistantInvites(userId: bigint) {
    const invites = await this.prisma.pendingCourseAssistantInvite.findMany({
      where: { userId },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            user: { select: { username: true, email: true } },
          },
        },
        inviter: { select: { username: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return invites.map((invite) => ({
      id: invite.id.toString(),
      courseId: invite.course.id.toString(),
      courseTitle: invite.course.title,
      invitedAt: invite.createdAt,
      inviterName:
        invite.inviter.username ?? invite.inviter.email,
      ownerName: invite.course.user.username ?? invite.course.user.email,
    }));
  }

  async acceptAssistantInvite(inviteId: bigint, userId: bigint) {
    const invite = await this.prisma.pendingCourseAssistantInvite.findFirst({
      where: { id: inviteId, userId },
    });
    if (!invite) {
      throw new NotFoundException('Assistant invite not found');
    }
    await this.prisma.$transaction([
      this.prisma.courseAssistant.create({
        data: {
          userId,
          courseId: invite.courseId,
        },
      }),
      this.prisma.pendingCourseAssistantInvite.delete({
        where: { id: inviteId },
      }),
    ]);
    return {
      message: 'You are now a course assistant',
      courseId: invite.courseId.toString(),
    };
  }

  async declineAssistantInvite(inviteId: bigint, userId: bigint) {
    const invite = await this.prisma.pendingCourseAssistantInvite.findFirst({
      where: { id: inviteId, userId },
    });
    if (!invite) {
      throw new NotFoundException('Assistant invite not found');
    }
    await this.prisma.pendingCourseAssistantInvite.delete({
      where: { id: inviteId },
    });
    return { message: 'Invite declined' };
  }

  private buildTitleSearchFilter(search?: string) {
    const term = search?.trim().slice(0, 100);
    if (!term) return undefined;
    return { title: { contains: term } };
  }

  private toResponse(course: {
    id: bigint;
    title: string;
    description: string | null;
    isOpen: boolean;
    createdAt: Date;
    updatedAt: Date;
    userId: bigint;
  }) {
    return {
      id: course.id.toString(),
      title: course.title,
      description: course.description,
      isOpen: course.isOpen,
      createdAt: course.createdAt,
      updatedAt: course.updatedAt,
      teacherId: course.userId.toString(),
    };
  }
}
