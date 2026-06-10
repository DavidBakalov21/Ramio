import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { ImportStudentsDto } from './dto/import-students.dto';
import { UserService } from './user.service';

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post('import-students')
  @Roles(UserRole.TEACHER)
  importStudents(@Body() dto: ImportStudentsDto) {
    return this.userService.importStudents(dto.students);
  }

  @Get(':id')
  getPublicProfile(@Param('id', ParseIntPipe) id: number) {
    return this.userService.getPublicProfile(BigInt(id));
  }
}
