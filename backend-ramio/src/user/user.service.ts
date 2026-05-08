import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async getPublicProfile(targetId: bigint) {
    const user = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: {
        id: true,
        username: true,
        role: true,
        aboutMe: true,
        createdAt: true,
        profilePicture: { select: { url: true } },
      },
    });
    if (!user) throw new NotFoundException('User not found');

    if (user.role === 'TEACHER') {
      const courses = await this.prisma.course.findMany({
        where: { userId: targetId },
        orderBy: { createdAt: 'desc' },
        select: { id: true, title: true, description: true, createdAt: true },
      });
      return {
        id: user.id.toString(),
        username: user.username,
        role: user.role,
        aboutMe: user.aboutMe,
        profilePictureUrl: user.profilePicture?.url ?? null,
        createdAt: user.createdAt,
        courseCount: courses.length,
        courses: courses.map((c) => ({
          id: c.id.toString(),
          title: c.title,
          description: c.description,
          createdAt: c.createdAt,
        })),
      };
    }

    // STUDENT
    const enrollments = await this.prisma.enrollment.findMany({
      where: { userId: targetId },
      orderBy: { enrolledAt: 'desc' },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            description: true,
            createdAt: true,
            user: { select: { username: true } },
          },
        },
      },
    });
    return {
      id: user.id.toString(),
      username: user.username,
      role: user.role,
      aboutMe: user.aboutMe,
      profilePictureUrl: user.profilePicture?.url ?? null,
      createdAt: user.createdAt,
      courseCount: enrollments.length,
      courses: enrollments.map((e) => ({
        id: e.course.id.toString(),
        title: e.course.title,
        description: e.course.description,
        createdAt: e.course.createdAt,
        teacherName: e.course.user.username,
      })),
    };
  }
}
