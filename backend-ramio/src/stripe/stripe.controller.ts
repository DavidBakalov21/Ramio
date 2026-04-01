import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { User } from 'src/auth/decorators/user.decorator';
import { Public } from 'src/auth/decorators/public.decorator';
import type { User as PrismaUser } from '@prisma/client';
import { SubscriptionCheckoutDto } from './dto/subscription-checkout.dto';
import { SupportCheckoutDto } from './dto/support-checkout.dto';
import { StripeService } from './stripe.service';

@Controller('stripe')
export class StripeController {
  constructor(private readonly stripeService: StripeService) {}

  @Post('support-checkout')
  createSupportCheckout(
    @User() user: PrismaUser,
    @Body() dto: SupportCheckoutDto,
  ) {
    return this.stripeService.createSupportCheckout(user, dto);
  }

  @Post('subscription-checkout')
  createSubscriptionCheckout(
    @User() user: PrismaUser,
    @Body() dto: SubscriptionCheckoutDto,
  ) {
    return this.stripeService.createSubscriptionCheckout(user, dto);
  }

  @Post('webhook')
  @Public()
  @HttpCode(200)
  handleWebhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('stripe-signature') signature: string | undefined,
  ) {
    const rawBody = req.rawBody;
    if (!rawBody) {
      throw new BadRequestException(
        'Missing raw body for webhook verification',
      );
    }
    return this.stripeService.handleWebhook(rawBody, signature);
  }
}
