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
import { UserRole } from '@prisma/client';
import { User } from '../auth/decorators/user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { User as PrismaUser } from '@prisma/client';
import { AssignmentService } from './assignment.service';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { RunAssignmentDto } from './dto/run-assignment.dto';
import { UpdateAssignmentDto } from './dto/update-assignment.dto';

@Controller('assignment')
export class AssignmentController {
  constructor(private readonly assignmentService: AssignmentService) {}

  @Post()
  @Roles(UserRole.TEACHER)
  create(@User() user: PrismaUser, @Body() dto: CreateAssignmentDto) {
    return this.assignmentService.create(user.id, dto);
  }

  @Get('course/:courseId')
  findByCourse(
    @Param('courseId', ParseIntPipe) courseId: number,
    @User() user: PrismaUser,
  ) {
    return this.assignmentService.findByCourse(BigInt(courseId), user.id);
  }

  @Get(':id/test-file')
  @Roles(UserRole.TEACHER)
  getTestFileContent(
    @Param('id', ParseIntPipe) id: number,
    @User() user: PrismaUser,
  ) {
    return this.assignmentService.getTestFileContent(BigInt(id), user.id);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @User() user: PrismaUser,
  ) {
    return this.assignmentService.findOne(BigInt(id), user.id);
  }

  @Post(':id/run')
  run(
    @Param('id', ParseIntPipe) id: number,
    @User() user: PrismaUser,
    @Body() dto: RunAssignmentDto,
  ) {
    return this.assignmentService.runAssignment(BigInt(id), user.id, dto.code);
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
  remove(
    @Param('id', ParseIntPipe) id: number,
    @User() user: PrismaUser,
  ) {
    return this.assignmentService.remove(BigInt(id), user.id);
  }

  @Post(':id/test-file')
  @Roles(UserRole.TEACHER)
  @UseInterceptors(FileInterceptor('file'))
  uploadTestFile(
    @Param('id', ParseIntPipe) id: number,
    @User() user: PrismaUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    return this.assignmentService.uploadTestFile(BigInt(id), user.id, file);
  }

  @Post(':id/submission')
  @Roles(UserRole.STUDENT)
  @UseInterceptors(FilesInterceptor('files', 11))
  createSubmission(
    @Param('id', ParseIntPipe) id: number,
    @User() user: PrismaUser,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    return this.assignmentService.createSubmission(
      BigInt(id),
      user.id,
      files && files.length > 0 ? files : undefined,
    );
  }
}
