import { Module } from '@nestjs/common';
import { CourseController } from './course.controller';
import { CourseService } from './course.service';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { CourseMaterialService } from './course-material.service';

@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [CourseController],
  providers: [CourseService, CourseMaterialService],
})
export class CourseModule {}
