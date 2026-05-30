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
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { AssignmentLanguage, UserRole } from '@prisma/client';
import { User } from '../auth/decorators/user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { User as PrismaUser } from '@prisma/client';
import { AssignmentService } from './assignment.service';
import { AssessSubmissionDto } from './dto/assess-submission.dto';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { RunAssignmentDto } from './dto/run-assignment.dto';
import { UpdateAssignmentDto } from './dto/update-assignment.dto';
import { SubmissionChatDto } from './dto/submission-chat.dto';


export function parseLanguage(raw: string | undefined): AssignmentLanguage | undefined {
  if (!raw) return undefined;
  const upper = raw.toUpperCase() as AssignmentLanguage;
  if (!Object.values(AssignmentLanguage).includes(upper)) {
    throw new BadRequestException(`Invalid language: ${raw}`);
  }
  return upper;
}

@Controller('assignment')
export class AssignmentController {
  constructor(private readonly assignmentService: AssignmentService) {}

  @Post()
  @Roles(UserRole.TEACHER)
  create(@User() user: PrismaUser, @Body() dto: CreateAssignmentDto) {
    return this.assignmentService.create(user.id, dto);
  }

  @Get(':id/submissions')
  @Roles(UserRole.TEACHER)
  getSubmissionsByAssignment(
    @Param('id', ParseIntPipe) id: number,
    @User() user: PrismaUser,
  ) {
    return this.assignmentService.getSubmissionsByAssignment(
      BigInt(id),
      user.id,
    );
  }

  @Get('submission/:submissionId')
  @Roles(UserRole.TEACHER)
  getSubmissionById(
    @Param('submissionId', ParseIntPipe) submissionId: number,
    @User() user: PrismaUser,
  ) {
    return this.assignmentService.getSubmissionById(
      BigInt(submissionId),
      user.id,
    );
  }

  @Post('submission/:submissionId/run')
  @Roles(UserRole.TEACHER)
  runSubmissionTests(
    @Param('submissionId', ParseIntPipe) submissionId: number,
    @User() user: PrismaUser,
  ) {
    return this.assignmentService.runSubmissionTests(
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
    return this.assignmentService.assessSubmission(
      BigInt(submissionId),
      user.id,
      dto,
    );
  }

  @Get('course/:courseId')
  findByCourse(
    @Param('courseId', ParseIntPipe) courseId: number,
    @User() user: PrismaUser,
  ) {
    return this.assignmentService.findByCourse(BigInt(courseId), user.id);
  }


  @Get(':id/test-files')
  @Roles(UserRole.TEACHER)
  getTestFilesOverview(
    @Param('id', ParseIntPipe) id: number,
    @User() user: PrismaUser,
  ) {
    return this.assignmentService.getTestFilesOverview(BigInt(id), user.id);
  }

  @Get(':id/test-file/:language')
  @Roles(UserRole.TEACHER)
  getTestFileContent(
    @Param('id', ParseIntPipe) id: number,
    @Param('language') language: string,
    @User() user: PrismaUser,
  ) {
    const lang = parseLanguage(language);
    if (!lang) throw new BadRequestException('language is required');
    return this.assignmentService.getTestFileContentForLanguage(
      BigInt(id),
      user.id,
      lang,
    );
  }

  @Post(':id/test-file/:language')
  @Roles(UserRole.TEACHER)
  @UseInterceptors(FileInterceptor('file'))
  uploadTestFile(
    @Param('id', ParseIntPipe) id: number,
    @Param('language') language: string,
    @User() user: PrismaUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('File is required');
    const lang = parseLanguage(language);
    if (!lang) throw new BadRequestException('language is required');
    return this.assignmentService.uploadTestFileForLanguage(
      BigInt(id),
      user.id,
      lang,
      file,
    );
  }

  @Delete(':id/test-file/:language')
  @Roles(UserRole.TEACHER)
  deleteTestFile(
    @Param('id', ParseIntPipe) id: number,
    @Param('language') language: string,
    @User() user: PrismaUser,
  ) {
    const lang = parseLanguage(language);
    if (!lang) throw new BadRequestException('language is required');
    return this.assignmentService.deleteTestFileForLanguage(
      BigInt(id),
      user.id,
      lang,
    );
  }

  @Post(':id/test-file/:language/generate')
  @Roles(UserRole.TEACHER)
  generateTestFile(
    @Param('id', ParseIntPipe) id: number,
    @Param('language') language: string,
    @User() user: PrismaUser,
  ) {
    const lang = parseLanguage(language);
    if (!lang) throw new BadRequestException('language is required');
    return this.assignmentService.generateTestFileForLanguage(
      BigInt(id),
      user.id,
      lang,
    );
  }


  @Get(':id/submission')
  getSubmission(
    @Param('id', ParseIntPipe) id: number,
    @User() user: PrismaUser,
  ) {
    return this.assignmentService.getSubmission(BigInt(id), user.id);
  }

  @Post(':id/submission/chat')
  @Roles(UserRole.STUDENT)
  studentSubmissionChat(
    @Param('id', ParseIntPipe) id: number,
    @User() user: PrismaUser,
    @Body() dto: SubmissionChatDto,
  ) {
    return this.assignmentService.studentGradedSubmissionChat(
      BigInt(id),
      user.id,
      dto,
    );
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @User() user: PrismaUser) {
    return this.assignmentService.findOne(BigInt(id), user.id);
  }

  @Post(':id/run')
  run(
    @Param('id', ParseIntPipe) id: number,
    @User() user: PrismaUser,
    @Body() dto: RunAssignmentDto,
  ) {
    const lang = parseLanguage(dto.language);
    return this.assignmentService.runAssignment(
      BigInt(id),
      user.id,
      dto.code,
      lang,
    );
  }

  @Patch(':id')
  @Roles(UserRole.TEACHER)
  update(
    @Param('id', ParseIntPipe) id: number,
    @User() user: PrismaUser,
    @Body() dto: UpdateAssignmentDto,
  ) {
    return this.assignmentService.update(BigInt(id), user.id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.TEACHER)
  remove(@Param('id', ParseIntPipe) id: number, @User() user: PrismaUser) {
    return this.assignmentService.remove(BigInt(id), user.id);
  }

  @Post(':id/submission')
  @Roles(UserRole.STUDENT, UserRole.TEACHER)
  @UseInterceptors(FilesInterceptor('files', 11))
  createSubmission(
    @Param('id', ParseIntPipe) id: number,
    @User() user: PrismaUser,
    @UploadedFiles() files?: Express.Multer.File[],
    @Body('language') languageRaw?: string,
  ) {
    const lang = parseLanguage(languageRaw);
    return this.assignmentService.createSubmission(
      BigInt(id),
      user.id,
      files && files.length > 0 ? files : undefined,
      lang,
    );
  }

  @Patch(':id/submission')
  @Roles(UserRole.STUDENT, UserRole.TEACHER)
  @UseInterceptors(FilesInterceptor('files', 11))
  updateSubmission(
    @Param('id', ParseIntPipe) id: number,
    @User() user: PrismaUser,
    @UploadedFiles() files?: Express.Multer.File[],
    @Body('language') languageRaw?: string,
  ) {
    if (!files?.length) {
      throw new BadRequestException('At least one file is required');
    }
    const lang = parseLanguage(languageRaw);
    return this.assignmentService.updateSubmission(
      BigInt(id),
      user.id,
      files,
      lang,
    );
  }

  @Post(':id/submission/:submissionId/ai-feedback')
  @Roles(UserRole.TEACHER)
  getAiFeedbackForSubmission(
    @Param('id', ParseIntPipe) id: number,
    @Param('submissionId', ParseIntPipe) submissionId: number,
    @User() user: PrismaUser,
  ) {
    return this.assignmentService.getAiFeedbackForSubmission(
      BigInt(id),
      BigInt(submissionId),
      user.id,
    );
  }
}
