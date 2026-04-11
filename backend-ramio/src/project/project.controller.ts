import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@prisma/client';
import { User } from '../auth/decorators/user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { User as PrismaUser } from '@prisma/client';
import { AssessSubmissionDto } from '../assignment/dto/assess-submission.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectService } from './project.service';

@Controller('project')
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @Post()
  @Roles(UserRole.TEACHER)
  create(@User() user: PrismaUser, @Body() dto: CreateProjectDto) {
    return this.projectService.create(user.id, dto);
  }

  @Get('course/:courseId')
  findByCourse(
    @Param('courseId', ParseIntPipe) courseId: number,
    @User() user: PrismaUser,
  ) {
    return this.projectService.findByCourse(BigInt(courseId), user.id);
  }

  @Get('submission/:submissionId')
  @Roles(UserRole.TEACHER)
  getSubmissionById(
    @Param('submissionId', ParseIntPipe) submissionId: number,
    @User() user: PrismaUser,
  ) {
    return this.projectService.getSubmissionById(
      BigInt(submissionId),
      user.id,
    );
  }

  @Patch('submission/:submissionId')
  @Roles(UserRole.TEACHER)
  assessSubmission(
    @Param('submissionId', ParseIntPipe) submissionId: number,
    @User() user: PrismaUser,
    @Body() dto: AssessSubmissionDto,
  ) {
    return this.projectService.assessSubmission(
      BigInt(submissionId),
      user.id,
      dto,
    );
  }

  @Get(':id/submissions')
  @Roles(UserRole.TEACHER)
  getSubmissionsByProject(
    @Param('id', ParseIntPipe) id: number,
    @User() user: PrismaUser,
    @Query('syncCodeBuild') syncCodeBuild?: string,
  ) {
    return this.projectService.getSubmissionsByProject(BigInt(id), user.id, {
      syncCodeBuild: syncCodeBuild === '1' || syncCodeBuild === 'true',
    });
  }

  @Get(':id/submission/:submissionId/codebuild-status')
  @Roles(UserRole.TEACHER)
  getCodeBuildStatusForSubmission(
    @Param('id', ParseIntPipe) id: number,
    @Param('submissionId', ParseIntPipe) submissionId: number,
    @User() user: PrismaUser,
  ) {
    return this.projectService.refreshCodeBuildStatusForSubmission(
      BigInt(id),
      BigInt(submissionId),
      user.id,
    );
  }

  @Get(':id/submission')
  getSubmission(
    @Param('id', ParseIntPipe) id: number,
    @User() user: PrismaUser,
  ) {
    return this.projectService.getSubmission(BigInt(id), user.id);
  }

  @Post(':id/submission')
  @Roles(UserRole.STUDENT)
  @UseInterceptors(FilesInterceptor('files', 1))
  createSubmission(
    @Param('id', ParseIntPipe) id: number,
    @User() user: PrismaUser,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    return this.projectService.createSubmission(
      BigInt(id),
      user.id,
      files && files.length > 0 ? files : undefined,
    );
  }

  @Patch(':id/submission')
  @Roles(UserRole.STUDENT)
  @UseInterceptors(FilesInterceptor('files', 1))
  updateSubmission(
    @Param('id', ParseIntPipe) id: number,
    @User() user: PrismaUser,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    if (!files?.length) {
      throw new BadRequestException('Upload one project archive');
    }
    return this.projectService.updateSubmission(BigInt(id), user.id, files);
  }

  @Post(':id/submission/:submissionId/ai-feedback')
  @Roles(UserRole.TEACHER)
  getAiFeedbackForProjectSubmission(
    @Param('id', ParseIntPipe) id: number,
    @Param('submissionId', ParseIntPipe) submissionId: number,
    @User() user: PrismaUser,
  ) {
    return this.projectService.getAiFeedbackForProjectSubmission(
      BigInt(id),
      BigInt(submissionId),
      user.id,
    );
  }

  @Post(':id/submission/:submissionId/codebuild-run')
  @Roles(UserRole.TEACHER)
  runCodeBuildForSubmission(
    @Param('id', ParseIntPipe) id: number,
    @Param('submissionId', ParseIntPipe) submissionId: number,
    @User() user: PrismaUser,
  ) {
    return this.projectService.startCodeBuildForSubmission(
      BigInt(id),
      BigInt(submissionId),
      user.id,
    );
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @User() user: PrismaUser) {
    return this.projectService.findOne(BigInt(id), user.id);
  }

  @Patch(':id')
  @Roles(UserRole.TEACHER)
  update(
    @Param('id', ParseIntPipe) id: number,
    @User() user: PrismaUser,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projectService.update(BigInt(id), user.id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.TEACHER)
  remove(@Param('id', ParseIntPipe) id: number, @User() user: PrismaUser) {
    return this.projectService.remove(BigInt(id), user.id);
  }
}
