import { Module } from '@nestjs/common';
import { MeController } from './me.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [MeController]
})
export class MeModule {}
