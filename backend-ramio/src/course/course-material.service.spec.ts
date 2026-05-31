import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CourseMaterialService, inferType } from './course-material.service';
import { CourseService } from './course.service';

describe('inferType', () => {
  it('application/pdf → PDF', () => {
    expect(inferType({ mimeType: 'application/pdf' })).toBe('PDF');
  });

  it('.pdf extension → PDF', () => {
    expect(inferType({ name: 'notes.pdf' })).toBe('PDF');
  });

  it('video/* → VIDEO', () => {
    expect(inferType({ mimeType: 'video/mp4' })).toBe('VIDEO');
  });

  it('.mp4 extension → VIDEO', () => {
    expect(inferType({ name: 'lecture.mp4' })).toBe('VIDEO');
  });

  it('.webm .mov .m4v .ogg extensions → VIDEO', () => {
    expect(inferType({ name: 'a.webm' })).toBe('VIDEO');
    expect(inferType({ name: 'b.mov' })).toBe('VIDEO');
    expect(inferType({ name: 'c.m4v' })).toBe('VIDEO');
    expect(inferType({ name: 'd.ogg' })).toBe('VIDEO');
  });

  it('mime takes priority over extension', () => {
    expect(inferType({ mimeType: 'application/pdf', name: 'clip.mp4' })).toBe(
      'PDF',
    );
  });

  it('anything else → FILE', () => {
    expect(inferType({ mimeType: 'text/plain', name: 'readme.txt' })).toBe(
      'FILE',
    );
  });
});

describe('CourseMaterialService access control', () => {
  let service: CourseMaterialService;
  let prisma: {
    course: { findUnique: jest.Mock };
    enrollment: { findUnique: jest.Mock };
    courseMaterial: { findMany: jest.Mock };
  };

  const courseId = 10n;
  const teacherId = 1n;
  const studentId = 2n;
  const otherTeacherId = 3n;

  beforeEach(() => {
    prisma = {
      course: { findUnique: jest.fn() },
      enrollment: { findUnique: jest.fn() },
      courseMaterial: { findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new CourseMaterialService(
      prisma as never,
      { uploadFile: jest.fn(), deleteFile: jest.fn() } as never,
      { get: jest.fn().mockReturnValue('bucket') } as unknown as ConfigService,
    );
  });

  it('student not enrolled → ForbiddenException on list', async () => {
    prisma.course.findUnique.mockResolvedValue({
      id: courseId,
      userId: teacherId,
    });
    prisma.enrollment.findUnique.mockResolvedValue(null);

    await expect(service.list(courseId, studentId)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(service.list(courseId, studentId)).rejects.toThrow(
      'You do not have access to this course',
    );
  });

  it('teacher who does not own the course → ForbiddenException on createLink', async () => {
    prisma.course.findUnique.mockResolvedValue({
      id: courseId,
      userId: teacherId,
    });

    await expect(
      service.createLink(courseId, otherTeacherId, {
        title: 'Link',
        url: 'https://example.com',
      }),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      service.createLink(courseId, otherTeacherId, {
        title: 'Link',
        url: 'https://example.com',
      }),
    ).rejects.toThrow('Only the course teacher can do that');
  });

  it('missing course → NotFoundException', async () => {
    prisma.course.findUnique.mockResolvedValue(null);

    await expect(service.list(courseId, studentId)).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.list(courseId, studentId)).rejects.toThrow(
      'Course not found',
    );
  });
});

describe('CourseService pending enrollment', () => {
  let courseService: CourseService;
  let prisma: {
    course: { findUnique: jest.Mock };
    pendingEnrollment: { findFirst: jest.Mock; delete: jest.Mock };
    $transaction: jest.Mock;
    enrollment: { create: jest.Mock };
  };

  const courseId = 5n;
  const teacherId = 1n;
  const pendingId = 99n;

  beforeEach(() => {
    prisma = {
      course: { findUnique: jest.fn() },
      pendingEnrollment: {
        findFirst: jest.fn().mockResolvedValue({
          id: pendingId,
          userId: 2n,
          courseId,
          user: { email: 'student@test.com' },
        }),
        delete: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
      enrollment: { create: jest.fn().mockResolvedValue({}) },
    };
    courseService = new CourseService(prisma as never);
  });

  it('pending → approved transition creates enrollment and removes pending', async () => {
    prisma.course.findUnique.mockResolvedValue({
      id: courseId,
      userId: teacherId,
    });

    const result = await courseService.acceptPendingEnrollment(
      courseId,
      pendingId,
      teacherId,
    );

    expect(result).toEqual({
      message: 'Student accepted and enrolled',
      userId: '2',
      courseId: '5',
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.enrollment.create).toHaveBeenCalledWith({
      data: { userId: 2n, courseId },
    });
  });
});
