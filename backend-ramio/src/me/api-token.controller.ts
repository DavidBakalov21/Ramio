import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import type { User as PrismaUser } from '@prisma/client';
import { User } from 'src/auth/decorators/user.decorator';
import { ApiTokenService } from 'src/auth/api-token.service';
import { CreateApiTokenDto } from './dto/create-api-token.dto';

@Controller('me/api-tokens')
export class ApiTokenController {
  constructor(private readonly apiTokenService: ApiTokenService) {}

  @Get()
  listTokens(@User() user: PrismaUser) {
    return this.apiTokenService.listTokens(user.id, user.role);
  }

  @Post()
  createToken(@User() user: PrismaUser, @Body() dto: CreateApiTokenDto) {
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : undefined;
    return this.apiTokenService.createToken(
      user.id,
      user.role,
      dto.name,
      expiresAt,
    );
  }

  @Delete(':id')
  revokeToken(
    @User() user: PrismaUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.apiTokenService.revokeToken(user.id, user.role, BigInt(id));
  }
}
