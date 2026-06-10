import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { ApiTokenService } from './api-token.service';
import { AuthController } from './auth.controller';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [AuthService, ApiTokenService],
  controllers: [AuthController],
  exports: [AuthService, ApiTokenService],
})
export class AuthModule {}
