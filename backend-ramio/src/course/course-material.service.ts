import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CourseMaterialType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

const MATERIALS_BUCKET_KEY = 'S3_BUCKET_MATERIALS';
const DEFAULT_BUCKET_KEY = 'S3_BUCKET';

function inferType(input: {
  mimeType?: string | null;
  name?: string | null;
}): CourseMaterialType {
  const mt = (input.mimeType ?? '').toLowerCase();
  const name = (input.name ?? '').toLowerCase();
  if (mt === 'application/pdf' || name.endsWith('.pdf')) return 'PDF';
  if (mt.startsWith('video/') || name.match(/\.(mp4|webm|ogg|mov|m4v)$/)) {
    return 'VIDEO';
  }
  return 'FILE';
}

@Injectable()
export class CourseMaterialService {
  private readonly bucket: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
  ) {
    this.bucket =
      this.config.get<string>(MATERIALS_BUCKET_KEY) ??
      this.config.get<string>(DEFAULT_BUCKET_KEY) ??
      'ramio-file-storage';
  }

  async list(courseId: bigint, userId: bigint) {
    await this.assertCanAccessCourse(courseId, userId);
    const items = await this.prisma.courseMaterial.findMany({
      where: { courseId },
      orderBy: { createdAt: 'desc' },
    });
    return items.map((m) => this.toResponse(m));
  }

  async getOne(courseId: bigint, materialId: bigint, userId: bigint) {
    await this.assertCanAccessCourse(courseId, userId);
    const m = await this.prisma.courseMaterial.findFirst({
      where: { id: materialId, courseId },
    });
    if (!m) throw new NotFoundException('Material not found');
    return this.toResponse(m);
  }

  async createLink(
    courseId: bigint,
    teacherId: bigint,
    input: { title: string; url: string },
  ) {
    await this.assertTeacherOwnsCourse(courseId, teacherId);
    const created = await this.prisma.courseMaterial.create({
      data: {
        courseId,
        type: CourseMaterialType.LINK,
        title: input.title.trim(),
        url: input.url.trim(),
        key: null,
        name: null,
        mimeType: null,
      },
    });
    return this.toResponse(created);
  }

  async createFile(
    courseId: bigint,
    teacherId: bigint,
    file: Express.Multer.File | undefined,
    input?: { title?: string; type?: 'PDF' | 'VIDEO' | 'FILE' },
  ) {
    await this.assertTeacherOwnsCourse(courseId, teacherId);
    if (!file) throw new BadRequestException('Missing file');

    const name = file.originalname ?? 'file';
    const prefix = `course-materials/${courseId.toString()}/`;
    const { url, key } = await this.storage.uploadFile(file, this.bucket, prefix);

    const type: CourseMaterialType =
      input?.type ? (input.type as CourseMaterialType) : inferType({ mimeType: file.mimetype, name });
    const title =
      (input?.title ?? '').trim() || name.replace(/\.[^.]+$/, '').slice(0, 120);

    const created = await this.prisma.courseMaterial.create({
      data: {
        courseId,
        type,
        title,
        url,
        key,
        name,
        mimeType: file.mimetype ?? null,
      },
    });
    return this.toResponse(created);
  }

  async remove(courseId: bigint, materialId: bigint, teacherId: bigint) {
    await this.assertTeacherOwnsCourse(courseId, teacherId);
    const m = await this.prisma.courseMaterial.findFirst({
      where: { id: materialId, courseId },
    });
    if (!m) throw new NotFoundException('Material not found');
    if (m.key) {
      await this.storage.deleteFile(m.key, this.bucket).catch(() => undefined);
    }
    await this.prisma.courseMaterial.delete({ where: { id: materialId } });
    return { success: true };
  }

  private async assertTeacherOwnsCourse(courseId: bigint, teacherId: bigint) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });
    if (!course) throw new NotFoundException('Course not found');
    if (course.userId !== teacherId) {
      throw new ForbiddenException('Only the course teacher can do that');
    }
  }

  private async assertCanAccessCourse(courseId: bigint, userId: bigint) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });
    if (!course) throw new NotFoundException('Course not found');
    if (course.userId === userId) return;
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });
    if (!enrollment) {
      throw new ForbiddenException('You do not have access to this course');
    }
  }

  private toResponse(m: {
    id: bigint;
    courseId: bigint;
    type: CourseMaterialType;
    title: string;
    url: string;
    key: string | null;
    name: string | null;
    mimeType: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: m.id.toString(),
      courseId: m.courseId.toString(),
      type: m.type,
      title: m.title,
      url: m.url,
      key: m.key,
      name: m.name,
      mimeType: m.mimeType,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    };
  }
}

