import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { User } from '../auth/decorators/user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { User as PrismaUser } from '@prisma/client';
import { CourseService } from './course.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';

@Controller('course')
export class CourseController {
  constructor(private readonly courseService: CourseService) {}

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
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @User() user: PrismaUser,
  ) {
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
