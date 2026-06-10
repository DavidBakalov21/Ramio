import { Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { ImportStudentRowDto } from './dto/import-students.dto';

export const ROSTER_IMPORT_COGNITO_PREFIX = 'roster-import:';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  private rosterCognitoSub(email: string): string {
    return `${ROSTER_IMPORT_COGNITO_PREFIX}${email}`;
  }

  private resolveUsername(row: ImportStudentRowDto, email: string): string {
    const github = row.github_username?.trim();
    if (github) return github;

    const name = row.name?.trim();
    if (name) {
      return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    }

    return email.split('@')[0] ?? email;
  }

  async importStudents(rows: ImportStudentRowDto[]) {
    let created = 0;
    let updated = 0;
    let skipped = 0;
    const results: Array<{
      email: string;
      status: 'created' | 'updated' | 'skipped';
      id: string;
      username: string | null;
    }> = [];

    for (const row of rows) {
      const email = row.identifier.trim().toLowerCase();
      const username = this.resolveUsername(row, email);

      const existing = await this.prisma.user.findUnique({
        where: { email },
      });

      if (existing) {
        const needsUsername = !existing.username && username;
        const needsRole = !existing.role;

        if (needsUsername || needsRole) {
          const updatedUser = await this.prisma.user.update({
            where: { email },
            data: {
              ...(needsUsername ? { username } : {}),
              ...(needsRole ? { role: UserRole.STUDENT } : {}),
            },
          });
          updated++;
          results.push({
            email,
            status: 'updated',
            id: updatedUser.id.toString(),
            username: updatedUser.username,
          });
        } else {
          skipped++;
          results.push({
            email,
            status: 'skipped',
            id: existing.id.toString(),
            username: existing.username,
          });
        }
        continue;
      }

      const createdUser = await this.prisma.user.create({
        data: {
          email,
          cognitoSub: this.rosterCognitoSub(email),
          role: UserRole.STUDENT,
          username,
        },
      });
      created++;
      results.push({
        email,
        status: 'created',
        id: createdUser.id.toString(),
        username: createdUser.username,
      });
    }

    return { created, updated, skipped, total: rows.length, results };
  }

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
