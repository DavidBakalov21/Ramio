import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { UserService } from './user.service';

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get(':id')
  getPublicProfile(@Param('id', ParseIntPipe) id: number) {
    return this.userService.getPublicProfile(BigInt(id));
  }
}
