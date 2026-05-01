import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@prisma/client';
import { User } from '../auth/decorators/user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { User as PrismaUser } from '@prisma/client';
import { CourseService } from './course.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { CourseMaterialService } from './course-material.service';
import { CreateCourseMaterialLinkDto } from './dto/create-course-material-link.dto';
import { CreateCourseMaterialFileDto } from './dto/create-course-material-file.dto';

@Controller('course')
export class CourseController {
  constructor(
    private readonly courseService: CourseService,
    private readonly materialService: CourseMaterialService,
  ) {}

  @Get()
  findAll(
    @User() user: PrismaUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? Number(page) : 1;
    const limitNum = limit ? Number(limit) : 10;
    return this.courseService.findAll(user.id, user.role, pageNum, limitNum);
  }

  @Get('all')
  findAllUnfiltered(
    @User() user: PrismaUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? Number(page) : 1;
    const limitNum = limit ? Number(limit) : 10;
    return this.courseService.findAllUnfiltered(
      user.id,
      user.role,
      pageNum,
      limitNum,
    );
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @User() user: PrismaUser) {
    return this.courseService.findOne(BigInt(id), user.id);
  }

  @Post()
  @Roles(UserRole.TEACHER)
  create(@User() user: PrismaUser, @Body() dto: CreateCourseDto) {
    return this.courseService.create(user.id, dto);
  }

  @Patch(':id')
  @Roles(UserRole.TEACHER)
  update(
    @Param('id', ParseIntPipe) id: number,
    @User() user: PrismaUser,
    @Body() dto: UpdateCourseDto,
  ) {
    return this.courseService.update(BigInt(id), user.id, dto);
  }

  @Post(':id/enroll')
  @Roles(UserRole.STUDENT)
  requestEnroll(
    @Param('id', ParseIntPipe) id: number,
    @User() user: PrismaUser,
  ) {
    return this.courseService.requestEnroll(BigInt(id), user.id);
  }

  @Get(':id/materials')
  getMaterials(@Param('id', ParseIntPipe) id: number, @User() user: PrismaUser) {
    return this.materialService.list(BigInt(id), user.id);
  }

  @Get(':id/materials/:materialId')
  getMaterial(
    @Param('id', ParseIntPipe) id: number,
    @Param('materialId', ParseIntPipe) materialId: number,
    @User() user: PrismaUser,
  ) {
    return this.materialService.getOne(BigInt(id), BigInt(materialId), user.id);
  }

  @Post(':id/materials/link')
  @Roles(UserRole.TEACHER)
  createMaterialLink(
    @Param('id', ParseIntPipe) id: number,
    @User() user: PrismaUser,
    @Body() dto: CreateCourseMaterialLinkDto,
  ) {
    return this.materialService.createLink(BigInt(id), user.id, dto);
  }

  @Post(':id/materials/file')
  @Roles(UserRole.TEACHER)
  @UseInterceptors(FileInterceptor('file'))
  createMaterialFile(
    @Param('id', ParseIntPipe) id: number,
    @User() user: PrismaUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: CreateCourseMaterialFileDto,
  ) {
    return this.materialService.createFile(BigInt(id), user.id, file, dto);
  }

  @Delete(':id/materials/:materialId')
  @Roles(UserRole.TEACHER)
  removeMaterial(
    @Param('id', ParseIntPipe) id: number,
    @Param('materialId', ParseIntPipe) materialId: number,
    @User() user: PrismaUser,
  ) {
    return this.materialService.remove(BigInt(id), BigInt(materialId), user.id);
  }

  @Get(':id/student-results')
  @Roles(UserRole.TEACHER)
  getStudentResults(
    @Param('id', ParseIntPipe) id: number,
    @User() user: PrismaUser,
  ) {
    return this.courseService.getStudentResults(BigInt(id), user.id);
  }

  @Get(':id/pending-enrollments')
  @Roles(UserRole.TEACHER)
  getPendingEnrollments(
    @Param('id', ParseIntPipe) id: number,
    @User() user: PrismaUser,
  ) {
    return this.courseService.getPendingEnrollments(BigInt(id), user.id);
  }

  @Post(':id/pending-enrollments/:pendingId/accept')
  @Roles(UserRole.TEACHER)
  acceptPendingEnrollment(
    @Param('id', ParseIntPipe) id: number,
    @Param('pendingId', ParseIntPipe) pendingId: number,
    @User() user: PrismaUser,
  ) {
    return this.courseService.acceptPendingEnrollment(
      BigInt(id),
      BigInt(pendingId),
      user.id,
    );
  }

  @Post(':id/pending-enrollments/:pendingId/decline')
  @Roles(UserRole.TEACHER)
  declinePendingEnrollment(
    @Param('id', ParseIntPipe) id: number,
    @Param('pendingId', ParseIntPipe) pendingId: number,
    @User() user: PrismaUser,
  ) {
    return this.courseService.declinePendingEnrollment(
      BigInt(id),
      BigInt(pendingId),
      user.id,
    );
  }
}
