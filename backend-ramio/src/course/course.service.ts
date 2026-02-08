import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateCourseDto } from './dto/create-course.dto';
import type { UpdateCourseDto } from './dto/update-course.dto';

@Injectable()
export class CourseService {
  constructor(private readonly prisma: PrismaService) {}

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
