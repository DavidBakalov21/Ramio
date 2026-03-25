import { Module } from '@nestjs/common';
import { MeController } from './me.controller';
import { MeService } from './me.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { SubscriptionModule } from 'src/subscription/subscription.module';
import { AuthModule } from 'src/auth/auth.module';
import { StorageModule } from 'src/storage/storage.module';

@Module({
  imports: [AuthModule, PrismaModule, StorageModule, SubscriptionModule],
  controllers: [MeController],
  providers: [MeService],
})
export class MeModule {}
