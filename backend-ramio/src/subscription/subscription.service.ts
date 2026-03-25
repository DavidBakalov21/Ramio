import { Injectable } from '@nestjs/common';
import { UserSubscriptionTier } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SubscriptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async getSubscriptionTier(userId: bigint): Promise<UserSubscriptionTier> {
    const now = new Date();
    const sub = await this.prisma.userSubscription.findFirst({
      where: {
        userId,
        OR: [
          { status: { in: ['active', 'trialing'] } },
          {
            status: 'canceled',
            currentPeriodEnd: { gt: now },
          },
        ],
      },
      orderBy: { currentPeriodEnd: 'desc' },
    });
    if (!sub) return 'FREE';
    const premiumPriceId = this.config.get<string>('STRIPE_PREMIUM_PRICE_ID');
    const proPriceId = this.config.get<string>('STRIPE_PRO_PRICE_ID');
    if (sub.priceId && premiumPriceId && sub.priceId === premiumPriceId) {
      return 'PREMIUM';
    }
    return 'PRO';
  }
}
