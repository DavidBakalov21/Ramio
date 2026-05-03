import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProjectLanguage } from '@prisma/client';
import { BedrockService } from '../bedrock/bedrock.service';
import {
  CodeBuildService,
  isTerminalCodeBuildStatus,
} from '../codebuild/codebuild.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ProjectZipToPromptService } from './project-zip-to-prompt.service';
import type { CreateProjectDto } from './dto/create-project.dto';
import type { UpdateProjectDto } from './dto/update-project.dto';
import type { AssessSubmissionDto } from '../assignment/dto/assess-submission.dto';

const ASSIGNMENT_BUCKET_KEY = 'S3_BUCKET_ASSIGNMENTS';
const DEFAULT_BUCKET_KEY = 'S3_BUCKET';

/** Space out CloudWatch reads when parsing never yields counts (avoids hammering Logs). */
const CODEBUILD_METRICS_RETRY_MS = 30_000;

function assertArchiveUpload(file: Express.Multer.File): void {
  const raw = file.originalname ?? '';
  const name = raw.split(/[/\\]/).pop() ?? '';
  const lower = name.toLowerCase();
  const allowed =
    lower.endsWith('.zip') ||
    lower.endsWith('.tar.gz') ||
    lower.endsWith('.tgz') ||
    lower.endsWith('.tar.bz2') ||
    lower.endsWith('.tbz2') ||
    lower.endsWith('.rar') ||
    lower.endsWith('.7z') ||
    lower.endsWith('.tar');
  if (!allowed) {
    throw new BadRequestException(
      'Upload a single archive (.zip, .tar.gz, .tgz, .tar, .rar, or .7z)',
    );
  }
}

@Injectable()
export class ProjectService {
  private readonly logger = new Logger(ProjectService.name);
  private readonly fileBucket: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
    private readonly bedrock: BedrockService,
    private readonly codeBuild: CodeBuildService,
    private readonly projectZipToPrompt: ProjectZipToPromptService,
  ) {
    this.fileBucket =
      this.config.get<string>(ASSIGNMENT_BUCKET_KEY) ??
      this.config.get<string>(DEFAULT_BUCKET_KEY) ??
      'ramio-file-storage';
  }

  async create(teacherId: bigint, dto: CreateProjectDto) {
    await this.assertTeacherOwnsCourse(BigInt(dto.courseId), teacherId);
    const dueDate = dto.dueDate != null ? new Date(dto.dueDate * 1000) : null;
    const project = await this.prisma.project.create({
      data: {
        title: dto.title,
        description: dto.description ?? null,
        points: dto.points ?? 100,
        language: dto.language ?? ProjectLanguage.PYTHON,
        dueDate,
        assessmentPrompt: dto.assessmentPrompt ?? null,
        courseId: BigInt(dto.courseId),
      },
    });
    return this.toProjectResponse(project);
  }

  async findByCourse(courseId: bigint, userId: bigint) {
    await this.assertCanAccessCourse(courseId, userId);
    const projects = await this.prisma.project.findMany({
      where: { courseId },
      orderBy: { createdAt: 'desc' },
    });
    const projectIds = projects.map((p) => p.id);
    const submissions = await this.prisma.projectSubmission.findMany({
      where: { userId, projectId: { in: projectIds } },
      select: { projectId: true, isChecked: true },
    });
    const statusByProject = new Map<
      string,
      { submitted: boolean; isChecked: boolean }
    >();
    for (const s of submissions) {
      statusByProject.set(s.projectId.toString(), {
        submitted: true,
        isChecked: !!s.isChecked,
      });
    }
    return projects.map((p) => ({
      ...this.toProjectResponse(p),
      submitted: statusByProject.get(p.id.toString())?.submitted ?? false,
      isChecked: statusByProject.get(p.id.toString())?.isChecked ?? false,
    }));
  }

  async findOne(projectId: bigint, userId: bigint) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { course: true },
    });
    if (!project) throw new NotFoundException('Project not found');
    await this.assertCanAccessCourse(project.courseId, userId);
    const submission = await this.prisma.projectSubmission.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    return {
      ...this.toProjectResponse(project),
      submitted: !!submission,
      isChecked: !!submission?.isChecked,
    };
  }

  async update(projectId: bigint, teacherId: bigint, dto: UpdateProjectDto) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { course: true },
    });
    if (!project) throw new NotFoundException('Project not found');
    if (project.course.userId !== teacherId) {
      throw new ForbiddenException(
        'You can only edit projects in your own courses',
      );
    }
    const dueDate =
      dto.dueDate !== undefined
        ? dto.dueDate != null
          ? new Date(dto.dueDate * 1000)
          : null
        : undefined;
    const updated = await this.prisma.project.update({
      where: { id: projectId },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.points !== undefined && { points: dto.points }),
        ...(dto.language !== undefined && { language: dto.language }),
        ...(dueDate !== undefined && { dueDate }),
        ...(dto.assessmentPrompt !== undefined && {
          assessmentPrompt: dto.assessmentPrompt,
        }),
      },
    });
    return this.toProjectResponse(updated);
  }

  async remove(projectId: bigint, teacherId: bigint) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { course: true, submissions: true },
    });
    if (!project) throw new NotFoundException('Project not found');
    if (project.course.userId !== teacherId) {
      throw new ForbiddenException(
        'You can only delete projects in your own courses',
      );
    }
    for (const s of project.submissions) {
      await this.storage.deleteFile(s.key, this.fileBucket);
    }
    await this.prisma.project.delete({ where: { id: projectId } });
    return { success: true };
  }

  async createSubmission(
    projectId: bigint,
    studentId: bigint,
    files?: Express.Multer.File[],
  ) {
    if (!files?.length) {
      throw new BadRequestException('Upload one project archive');
    }
    if (files.length !== 1) {
      throw new BadRequestException('Upload exactly one archive file');
    }
    assertArchiveUpload(files[0]);

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { course: true },
    });
    if (!project) throw new NotFoundException('Project not found');
    const enrollment = await this.prisma.enrollment.findUnique({
      where: {
        userId_courseId: { userId: studentId, courseId: project.courseId },
      },
    });
    if (!enrollment) {
      throw new ForbiddenException(
        'You must be enrolled in this course to submit',
      );
    }

    const existing = await this.prisma.projectSubmission.findUnique({
      where: { projectId_userId: { projectId, userId: studentId } },
    });
    if (existing) {
      throw new ConflictException('You have already submitted this project');
    }

    const file = files[0];
    const prefix = `project-submissions/${projectId}/${studentId}/`;
    const { url, key } = await this.storage.uploadFile(
      file,
      this.fileBucket,
      prefix,
    );
    const name = file.originalname ?? 'archive';

    const submission = await this.prisma.projectSubmission.create({
      data: {
        projectId,
        userId: studentId,
        url,
        key,
        name,
        teacherFeedback: '',
      },
      include: { project: true, user: true },
    });

    return this.toSubmissionResponse(submission);
  }

  async updateSubmission(
    projectId: bigint,
    studentId: bigint,
    files: Express.Multer.File[],
  ) {
    if (!files?.length) {
      throw new BadRequestException('Upload one project archive');
    }
    if (files.length !== 1) {
      throw new BadRequestException('Upload exactly one archive file');
    }
    assertArchiveUpload(files[0]);

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { course: true },
    });
    if (!project) throw new NotFoundException('Project not found');
    const enrollment = await this.prisma.enrollment.findUnique({
      where: {
        userId_courseId: { userId: studentId, courseId: project.courseId },
      },
    });
    if (!enrollment) {
      throw new ForbiddenException(
        'You must be enrolled in this course to submit',
      );
    }

    const submission = await this.prisma.projectSubmission.findUnique({
      where: { projectId_userId: { projectId, userId: studentId } },
      include: { project: true, user: true },
    });
    if (!submission) {
      throw new NotFoundException('You have not submitted this project yet');
    }

    await this.storage.deleteFile(submission.key, this.fileBucket);

    const file = files[0];
    const prefix = `project-submissions/${projectId}/${studentId}/`;
    const { url, key } = await this.storage.uploadFile(
      file,
      this.fileBucket,
      prefix,
    );
    const name = file.originalname ?? 'archive';

    const updated = await this.prisma.projectSubmission.update({
      where: { id: submission.id },
      data: { url, key, name, completedAt: new Date() },
      include: { project: true, user: true },
    });

    return this.toSubmissionResponse(updated);
  }

  async getSubmission(projectId: bigint, userId: bigint) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { course: true },
    });
    if (!project) throw new NotFoundException('Project not found');
    await this.assertCanAccessCourse(project.courseId, userId);

    const submission = await this.prisma.projectSubmission.findUnique({
      where: { projectId_userId: { projectId, userId } },
      include: { project: true, user: true },
    });
    if (!submission) throw new NotFoundException('No submission found');

    return {
      ...this.toSubmissionResponse(submission),
      teacherFeedback: submission.teacherFeedback,
      points: submission.points,
      isChecked: submission.isChecked,
      checkedAt: submission.checkedAt?.toISOString() ?? null,
    };
  }

  async getSubmissionsByProject(
    projectId: bigint,
    teacherId: bigint,
    options?: { syncCodeBuild?: boolean },
  ) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { course: true },
    });
    if (!project) throw new NotFoundException('Project not found');
    if (project.course.userId !== teacherId) {
      throw new ForbiddenException(
        'Only the course teacher can view submissions',
      );
    }
    let submissions = await this.prisma.projectSubmission.findMany({
      where: { projectId },
      include: { user: true, project: true },
      orderBy: { completedAt: 'desc' },
    });

    if (options?.syncCodeBuild) {
      const now = new Date();
      const nowMs = now.getTime();
      for (const s of submissions) {
        if (!s.codeBuildId) continue;
        const hasTestCounts =
          s.codeBuildTestsPassed != null ||
          s.codeBuildTestsFailed != null ||
          s.codeBuildTestsSkipped != null;
        const metricsRetryDue =
          !s.codeBuildTestMetricsAt ||
          nowMs - s.codeBuildTestMetricsAt.getTime() >=
            CODEBUILD_METRICS_RETRY_MS;
        if (isTerminalCodeBuildStatus(s.codeBuildStatus) && hasTestCounts) {
          continue;
        }
        if (
          isTerminalCodeBuildStatus(s.codeBuildStatus) &&
          !hasTestCounts &&
          !metricsRetryDue
        ) {
          continue;
        }
        try {
          const build = await this.codeBuild.getBuildRecord(s.codeBuildId);
          if (!build?.buildStatus) continue;
          const logsUrl =
            this.codeBuild.getConsoleUrlForBuild(build) ?? s.codeBuildLogsUrl;
          const data: {
            codeBuildStatus: string;
            codeBuildPhase: string | null;
            codeBuildLogsUrl: string | null;
            codeBuildUpdatedAt: Date;
            codeBuildTestsPassed?: number | null;
            codeBuildTestsFailed?: number | null;
            codeBuildTestsSkipped?: number | null;
            codeBuildTestMetricsAt?: Date | null;
          } = {
            codeBuildStatus: build.buildStatus,
            codeBuildPhase: build.currentPhase ?? null,
            codeBuildLogsUrl: logsUrl ?? null,
            codeBuildUpdatedAt: now,
          };
          if (
            isTerminalCodeBuildStatus(build.buildStatus) &&
            !hasTestCounts &&
            metricsRetryDue
          ) {
            const m = await this.codeBuild.tryExtractTestMetricsFromBuild(build);
            if (m) {
              data.codeBuildTestsPassed = m.passed;
              data.codeBuildTestsFailed = m.failed;
              data.codeBuildTestsSkipped = m.skipped;
            }
            data.codeBuildTestMetricsAt = now;
          }
          await this.prisma.projectSubmission.update({
            where: { id: s.id },
            data,
          });
        } catch {
          /* CodeBuild / CloudWatch unavailable or permission error */
        }
      }
      submissions = await this.prisma.projectSubmission.findMany({
        where: { projectId },
        include: { user: true, project: true },
        orderBy: { completedAt: 'desc' },
      });
    }

    return submissions.map((s) => ({
      ...this.toSubmissionResponse(s),
      teacherFeedback: s.teacherFeedback,
      points: s.points,
      isChecked: s.isChecked,
      checkedAt: s.checkedAt?.toISOString() ?? null,
      user: {
        id: s.user.id.toString(),
        username: s.user.username,
        email: s.user.email,
      },
    }));
  }

  async getSubmissionById(submissionId: bigint, teacherId: bigint) {
    const submission = await this.prisma.projectSubmission.findUnique({
      where: { id: submissionId },
      include: {
        project: { include: { course: true } },
        user: true,
      },
    });
    if (!submission) throw new NotFoundException('Submission not found');
    if (submission.project.course.userId !== teacherId) {
      throw new ForbiddenException(
        'Only the course teacher can view this submission',
      );
    }
    return {
      ...this.toSubmissionResponse(submission),
      teacherFeedback: submission.teacherFeedback,
      points: submission.points,
      isChecked: submission.isChecked,
      checkedAt: submission.checkedAt?.toISOString() ?? null,
      user: {
        id: submission.user.id.toString(),
        username: submission.user.username,
        email: submission.user.email,
      },
      project: {
        id: submission.project.id.toString(),
        title: submission.project.title,
        points: submission.project.points,
        assessmentPrompt: submission.project.assessmentPrompt,
      },
    };
  }

  async assessSubmission(
    submissionId: bigint,
    teacherId: bigint,
    dto: AssessSubmissionDto,
  ) {
    const submission = await this.prisma.projectSubmission.findUnique({
      where: { id: submissionId },
      include: { project: { include: { course: true } } },
    });
    if (!submission) throw new NotFoundException('Submission not found');
    if (submission.project.course.userId !== teacherId) {
      throw new ForbiddenException(
        'Only the course teacher can assess submissions',
      );
    }
    const data: Record<string, unknown> = {};
    if (dto.teacherFeedback !== undefined)
      data.teacherFeedback = dto.teacherFeedback;
    if (dto.points !== undefined) data.points = dto.points;
    if (dto.isChecked !== undefined) {
      data.isChecked = dto.isChecked;
      if (dto.isChecked) data.checkedAt = new Date();
    }
    const updated = await this.prisma.projectSubmission.update({
      where: { id: submissionId },
      data,
      include: { project: true, user: true },
    });
    return {
      ...this.toSubmissionResponse(updated),
      teacherFeedback: updated.teacherFeedback,
      points: updated.points,
      isChecked: updated.isChecked,
      checkedAt: updated.checkedAt?.toISOString() ?? null,
    };
  }

  async getAiFeedbackForProjectSubmission(
    projectId: bigint,
    submissionId: bigint,
    teacherId: bigint,
  ) {
    const submission = await this.prisma.projectSubmission.findUnique({
      where: { id: submissionId },
      include: { project: { include: { course: true } } },
    });
    if (!submission) {
      throw new NotFoundException('Submission not found');
    }
    if (submission.projectId !== projectId) {
      throw new BadRequestException('Submission does not belong to this project');
    }
    if (submission.project.course.userId !== teacherId) {
      throw new ForbiddenException(
        'Only the course teacher can request AI feedback for this submission',
      );
    }

    const name = submission.name.toLowerCase();
    if (!name.endsWith('.zip')) {
      throw new BadRequestException(
        'AI-assisted review only supports .zip archives. Ask the student to resubmit as a zip, or assess manually.',
      );
    }

    try {
      await this.refreshCodeBuildStatusForSubmission(
        projectId,
        submissionId,
        teacherId,
      );
    } catch (err) {
      this.logger.warn(
        `CodeBuild refresh before AI feedback failed (submission ${submissionId}): ${String(err)}`,
      );
    }

    const submissionWithMetrics = await this.prisma.projectSubmission.findUnique({
      where: { id: submissionId },
      select: {
        codeBuildId: true,
        codeBuildStatus: true,
        codeBuildTestsPassed: true,
        codeBuildTestsFailed: true,
        codeBuildTestsSkipped: true,
      },
    });

    const automatedTestSummary =
      submissionWithMetrics?.codeBuildId != null
        ? {
            buildStatus: submissionWithMetrics.codeBuildStatus ?? null,
            passed: submissionWithMetrics.codeBuildTestsPassed ?? null,
            failed: submissionWithMetrics.codeBuildTestsFailed ?? null,
            skipped: submissionWithMetrics.codeBuildTestsSkipped ?? null,
          }
        : null;

    const { projectFilesXml, warnings } =
      await this.projectZipToPrompt.buildProjectFilesXmlFromS3(
        this.fileBucket,
        submission.key,
      );

    const { feedback, suggestedPoints } =
      await this.bedrock.generateProjectArchiveFeedback({
        projectTitle: submission.project.title,
        projectDescription: submission.project.description,
        assessmentPrompt: submission.project.assessmentPrompt,
        maxPoints: submission.project.points,
        projectFilesXml:
          (warnings.length
            ? `Parser notes: ${warnings.join('; ')}\n\n`
            : '') + projectFilesXml,
        automatedTestSummary,
      });

    return {
      feedback,
      suggestedPoints,
      warnings,
    };
  }

  async startCodeBuildForSubmission(
    projectId: bigint,
    submissionId: bigint,
    teacherId: bigint,
  ) {
    const submission = await this.prisma.projectSubmission.findUnique({
      where: { id: submissionId },
      include: { project: { include: { course: true } } },
    });
    if (!submission) throw new NotFoundException('Submission not found');
    if (submission.projectId !== projectId) {
      throw new BadRequestException('Submission does not belong to this project');
    }
    if (submission.project.course.userId !== teacherId) {
      throw new ForbiddenException(
        'Only the course teacher can run CodeBuild for this submission',
      );
    }

    const name = submission.name.toLowerCase();
    if (!name.endsWith('.zip')) {
      throw new BadRequestException(
        'CodeBuild uses an S3 ZIP source. Only .zip submissions can run tests this way.',
      );
    }

    if (submission.codeBuildStatus === 'IN_PROGRESS') {
      throw new BadRequestException(
        'A CodeBuild run is already in progress for this submission.',
      );
    }

    const started = await this.codeBuild.startBuildWithS3ZipSource(
      this.fileBucket,
      submission.key,
      submission.project.language,
    );
    const now = new Date();
    await this.prisma.projectSubmission.update({
      where: { id: submissionId },
      data: {
        codeBuildId: started.buildId,
        codeBuildStatus: started.status,
        codeBuildPhase: started.phase ?? null,
        codeBuildLogsUrl: started.logsUrl ?? null,
        codeBuildStartedAt: now,
        codeBuildUpdatedAt: now,
        codeBuildTestsPassed: null,
        codeBuildTestsFailed: null,
        codeBuildTestsSkipped: null,
        codeBuildTestMetricsAt: null,
      },
    });

    return {
      codeBuildId: started.buildId,
      codeBuildStatus: started.status,
      codeBuildPhase: started.phase ?? null,
      codeBuildLogsUrl: started.logsUrl ?? null,
      codeBuildStartedAt: now.toISOString(),
      codeBuildUpdatedAt: now.toISOString(),
      codeBuildTestsPassed: null,
      codeBuildTestsFailed: null,
      codeBuildTestsSkipped: null,
      codeBuildTestMetricsAt: null,
    };
  }

  async refreshCodeBuildStatusForSubmission(
    projectId: bigint,
    submissionId: bigint,
    teacherId: bigint,
  ) {
    const submission = await this.prisma.projectSubmission.findUnique({
      where: { id: submissionId },
      include: { project: { include: { course: true } } },
    });
    if (!submission) throw new NotFoundException('Submission not found');
    if (submission.projectId !== projectId) {
      throw new BadRequestException('Submission does not belong to this project');
    }
    if (submission.project.course.userId !== teacherId) {
      throw new ForbiddenException(
        'Only the course teacher can view CodeBuild status for this submission',
      );
    }

    if (!submission.codeBuildId) {
      return {
        codeBuildId: null,
        codeBuildStatus: null,
        codeBuildPhase: null,
        codeBuildLogsUrl: null,
        codeBuildStartedAt: submission.codeBuildStartedAt?.toISOString() ?? null,
        codeBuildUpdatedAt: submission.codeBuildUpdatedAt?.toISOString() ?? null,
        codeBuildTestsPassed: submission.codeBuildTestsPassed ?? null,
        codeBuildTestsFailed: submission.codeBuildTestsFailed ?? null,
        codeBuildTestsSkipped: submission.codeBuildTestsSkipped ?? null,
        codeBuildTestMetricsAt:
          submission.codeBuildTestMetricsAt?.toISOString() ?? null,
      };
    }

    const build = await this.codeBuild.getBuildRecord(submission.codeBuildId);
    const now = new Date();
    if (!build?.buildStatus) {
      await this.prisma.projectSubmission.update({
        where: { id: submissionId },
        data: {
          codeBuildStatus: 'UNKNOWN',
          codeBuildPhase: null,
          codeBuildUpdatedAt: now,
        },
      });
      return {
        codeBuildId: submission.codeBuildId,
        codeBuildStatus: 'UNKNOWN',
        codeBuildPhase: null,
        codeBuildLogsUrl: submission.codeBuildLogsUrl,
        codeBuildStartedAt: submission.codeBuildStartedAt?.toISOString() ?? null,
        codeBuildUpdatedAt: now.toISOString(),
        codeBuildTestsPassed: submission.codeBuildTestsPassed ?? null,
        codeBuildTestsFailed: submission.codeBuildTestsFailed ?? null,
        codeBuildTestsSkipped: submission.codeBuildTestsSkipped ?? null,
        codeBuildTestMetricsAt:
          submission.codeBuildTestMetricsAt?.toISOString() ?? null,
      };
    }

    const logsUrl =
      this.codeBuild.getConsoleUrlForBuild(build) ??
      submission.codeBuildLogsUrl;
    const data: {
      codeBuildStatus: string;
      codeBuildPhase: string | null;
      codeBuildLogsUrl: string | null;
      codeBuildUpdatedAt: Date;
      codeBuildTestsPassed?: number | null;
      codeBuildTestsFailed?: number | null;
      codeBuildTestsSkipped?: number | null;
      codeBuildTestMetricsAt?: Date | null;
    } = {
      codeBuildStatus: build.buildStatus,
      codeBuildPhase: build.currentPhase ?? null,
      codeBuildLogsUrl: logsUrl ?? null,
      codeBuildUpdatedAt: now,
    };
    const hasTestCounts =
      submission.codeBuildTestsPassed != null ||
      submission.codeBuildTestsFailed != null ||
      submission.codeBuildTestsSkipped != null;
    if (isTerminalCodeBuildStatus(build.buildStatus) && !hasTestCounts) {
      const m = await this.codeBuild.tryExtractTestMetricsFromBuild(build);
      if (m) {
        data.codeBuildTestsPassed = m.passed;
        data.codeBuildTestsFailed = m.failed;
        data.codeBuildTestsSkipped = m.skipped;
      }
      data.codeBuildTestMetricsAt = now;
    }

    await this.prisma.projectSubmission.update({
      where: { id: submissionId },
      data,
    });

    const updated = await this.prisma.projectSubmission.findUnique({
      where: { id: submissionId },
    });

    return {
      codeBuildId: build.id ?? submission.codeBuildId,
      codeBuildStatus: build.buildStatus,
      codeBuildPhase: build.currentPhase ?? null,
      codeBuildLogsUrl: logsUrl ?? null,
      codeBuildStartedAt: submission.codeBuildStartedAt?.toISOString() ?? null,
      codeBuildUpdatedAt: now.toISOString(),
      codeBuildTestsPassed: updated?.codeBuildTestsPassed ?? null,
      codeBuildTestsFailed: updated?.codeBuildTestsFailed ?? null,
      codeBuildTestsSkipped: updated?.codeBuildTestsSkipped ?? null,
      codeBuildTestMetricsAt:
        updated?.codeBuildTestMetricsAt?.toISOString() ?? null,
    };
  }

  private async assertTeacherOwnsCourse(courseId: bigint, teacherId: bigint) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });
    if (!course) throw new NotFoundException('Course not found');
    if (course.userId !== teacherId) {
      throw new ForbiddenException(
        'You can only create projects in your own courses',
      );
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

  private toProjectResponse(p: {
    id: bigint;
    title: string;
    description: string | null;
    points: number;
    language: ProjectLanguage;
    dueDate: Date | null;
    assessmentPrompt: string | null;
    createdAt: Date;
    updatedAt: Date;
    courseId: bigint;
  }) {
    return {
      id: p.id.toString(),
      title: p.title,
      description: p.description,
      points: p.points,
      language: p.language,
      dueDate: p.dueDate?.toISOString() ?? null,
      assessmentPrompt: p.assessmentPrompt,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      courseId: p.courseId.toString(),
    };
  }

  private toSubmissionResponse(s: {
    id: bigint;
    projectId: bigint;
    userId: bigint;
    completedAt: Date;
    url: string;
    key: string;
    name: string;
    project: { id: bigint; title: string };
    codeBuildId?: string | null;
    codeBuildStatus?: string | null;
    codeBuildPhase?: string | null;
    codeBuildLogsUrl?: string | null;
    codeBuildStartedAt?: Date | null;
    codeBuildUpdatedAt?: Date | null;
    codeBuildTestsPassed?: number | null;
    codeBuildTestsFailed?: number | null;
    codeBuildTestsSkipped?: number | null;
    codeBuildTestMetricsAt?: Date | null;
  }) {
    return {
      id: s.id.toString(),
      projectId: s.projectId.toString(),
      userId: s.userId.toString(),
      completedAt: s.completedAt,
      url: s.url,
      key: s.key,
      name: s.name,
      project: {
        id: s.project.id.toString(),
        title: s.project.title,
      },
      codeBuildId: s.codeBuildId ?? null,
      codeBuildStatus: s.codeBuildStatus ?? null,
      codeBuildPhase: s.codeBuildPhase ?? null,
      codeBuildLogsUrl: s.codeBuildLogsUrl ?? null,
      codeBuildStartedAt: s.codeBuildStartedAt?.toISOString() ?? null,
      codeBuildUpdatedAt: s.codeBuildUpdatedAt?.toISOString() ?? null,
      codeBuildTestsPassed: s.codeBuildTestsPassed ?? null,
      codeBuildTestsFailed: s.codeBuildTestsFailed ?? null,
      codeBuildTestsSkipped: s.codeBuildTestsSkipped ?? null,
      codeBuildTestMetricsAt: s.codeBuildTestMetricsAt?.toISOString() ?? null,
    };
  }
}
