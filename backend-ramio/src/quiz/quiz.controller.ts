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
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@prisma/client';
import { User } from '../auth/decorators/user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { User as PrismaUser } from '@prisma/client';
import { QuizService } from './quiz.service';
import { CreateQuizDto } from './dto/create-quiz.dto';
import { UpdateQuizDto } from './dto/update-quiz.dto';
import { SaveQuizAnswersDto } from './dto/save-quiz-answers.dto';
import { AssessQuizSubmissionDto } from './dto/assess-quiz-submission.dto';
import { GenerateQuizDto } from './dto/generate-quiz.dto';
import { RunQuizCodingTaskDto } from './dto/run-quiz-coding-task.dto';

@Controller('quiz')
export class QuizController {
  constructor(private readonly quizService: QuizService) {}

  @Post('upload-image')
  @Roles(UserRole.TEACHER)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  uploadImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('File is required');
    return this.quizService.uploadImage(file);
  }

  @Post()
  @Roles(UserRole.TEACHER)
  create(@User() user: PrismaUser, @Body() dto: CreateQuizDto) {
    return this.quizService.create(user.id, dto);
  }

  @Post('generate')
  @Roles(UserRole.TEACHER)
  generate(@User() user: PrismaUser, @Body() dto: GenerateQuizDto) {
    return this.quizService.generateDraft(user.id, dto);
  }

  @Get('course/:courseId')
  findByCourse(
    @Param('courseId', ParseIntPipe) courseId: number,
    @User() user: PrismaUser,
  ) {
    return this.quizService.findByCourse(BigInt(courseId), user.id);
  }

  @Get('submission/:submissionId')
  @Roles(UserRole.TEACHER)
  getSubmissionById(
    @Param('submissionId', ParseIntPipe) submissionId: number,
    @User() user: PrismaUser,
  ) {
    return this.quizService.getSubmissionById(BigInt(submissionId), user.id);
  }

  @Delete('submission/:submissionId')
  @Roles(UserRole.TEACHER)
  deleteSubmission(
    @Param('submissionId', ParseIntPipe) submissionId: number,
    @User() user: PrismaUser,
  ) {
    return this.quizService.deleteSubmission(BigInt(submissionId), user.id);
  }

  @Patch('submission/:submissionId/assess')
  @Roles(UserRole.TEACHER)
  assessSubmission(
    @Param('submissionId', ParseIntPipe) submissionId: number,
    @User() user: PrismaUser,
    @Body() dto: AssessQuizSubmissionDto,
  ) {
    return this.quizService.assessSubmission(
      BigInt(submissionId),
      user.id,
      dto,
    );
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @User() user: PrismaUser) {
    return this.quizService.findOne(BigInt(id), user.id);
  }

  @Patch(':id')
  @Roles(UserRole.TEACHER)
  update(
    @Param('id', ParseIntPipe) id: number,
    @User() user: PrismaUser,
    @Body() dto: UpdateQuizDto,
  ) {
    return this.quizService.update(BigInt(id), user.id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.TEACHER)
  remove(@Param('id', ParseIntPipe) id: number, @User() user: PrismaUser) {
    return this.quizService.remove(BigInt(id), user.id);
  }

  @Get(':id/submissions')
  @Roles(UserRole.TEACHER)
  getSubmissionsByQuiz(
    @Param('id', ParseIntPipe) id: number,
    @User() user: PrismaUser,
  ) {
    return this.quizService.getSubmissionsByQuiz(BigInt(id), user.id);
  }

  @Post(':id/start')
  @Roles(UserRole.STUDENT)
  startQuiz(@Param('id', ParseIntPipe) id: number, @User() user: PrismaUser) {
    return this.quizService.startQuiz(BigInt(id), user.id);
  }

  @Post(':id/coding-task/run')
  @Roles(UserRole.STUDENT)
  runCodingTaskTests(
    @Param('id', ParseIntPipe) id: number,
    @User() user: PrismaUser,
    @Body() dto: RunQuizCodingTaskDto,
  ) {
    return this.quizService.runCodingTaskTests(BigInt(id), user.id, dto);
  }

  @Patch(':id/submission')
  @Roles(UserRole.STUDENT)
  saveAnswers(
    @Param('id', ParseIntPipe) id: number,
    @User() user: PrismaUser,
    @Body() dto: SaveQuizAnswersDto,
  ) {
    return this.quizService.saveAnswers(BigInt(id), user.id, dto);
  }

  @Post(':id/submit')
  @Roles(UserRole.STUDENT)
  submitQuiz(
    @Param('id', ParseIntPipe) id: number,
    @User() user: PrismaUser,
    @Body() dto: SaveQuizAnswersDto,
  ) {
    return this.quizService.submitQuiz(BigInt(id), user.id, dto);
  }

  @Post(':id/confirm-submit')
  @Roles(UserRole.STUDENT)
  confirmSubmit(
    @Param('id', ParseIntPipe) id: number,
    @User() user: PrismaUser,
  ) {
    return this.quizService.confirmSubmit(BigInt(id), user.id);
  }

  @Get(':id/submission')
  getOwnSubmission(
    @Param('id', ParseIntPipe) id: number,
    @User() user: PrismaUser,
  ) {
    return this.quizService.getOwnSubmission(BigInt(id), user.id);
  }
}
