import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CourseAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async isCourseOwner(courseId: bigint, userId: bigint): Promise<boolean> {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { userId: true },
    });
    return course?.userId === userId;
  }

  async isCourseAssistant(courseId: bigint, userId: bigint): Promise<boolean> {
    const assistant = await this.prisma.courseAssistant.findUnique({
      where: { userId_courseId: { userId, courseId } },
      select: { id: true },
    });
    return !!assistant;
  }

  async isCourseManager(courseId: bigint, userId: bigint): Promise<boolean> {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { userId: true },
    });
    if (!course) return false;
    if (course.userId === userId) return true;
    return this.isCourseAssistant(courseId, userId);
  }

  async isManagerOfLoadedCourse(
    course: { id: bigint; userId: bigint },
    userId: bigint,
  ): Promise<boolean> {
    if (course.userId === userId) return true;
    return this.isCourseAssistant(course.id, userId);
  }

  async assertCourseOwner(courseId: bigint, userId: bigint): Promise<void> {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { userId: true },
    });
    if (!course) throw new NotFoundException('Course not found');
    if (course.userId !== userId) {
      throw new ForbiddenException('Only the course owner can do that');
    }
  }

  async assertCanManageCourse(courseId: bigint, userId: bigint): Promise<void> {
    const canManage = await this.isCourseManager(courseId, userId);
    if (!canManage) {
      const course = await this.prisma.course.findUnique({
        where: { id: courseId },
        select: { id: true },
      });
      if (!course) throw new NotFoundException('Course not found');
      throw new ForbiddenException('You do not have permission to manage this course');
    }
  }

  async assertCanManageLoadedCourse(
    course: { id: bigint; userId: bigint },
    userId: bigint,
  ): Promise<void> {
    if (course.userId === userId) return;
    const isAssistant = await this.isCourseAssistant(course.id, userId);
    if (!isAssistant) {
      throw new ForbiddenException('You do not have permission to manage this course');
    }
  }
}
