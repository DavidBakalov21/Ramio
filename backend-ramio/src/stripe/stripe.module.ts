import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StripeController } from './stripe.controller';
import { StripeService } from './stripe.service';

@Module({
  imports: [PrismaModule],
  controllers: [StripeController],
  providers: [StripeService],
})
export class StripeModule {}
