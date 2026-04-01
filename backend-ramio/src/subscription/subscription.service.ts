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
    const activeSub = await this.prisma.userSubscription.findFirst({
      where: { userId, status: { in: ['active', 'trialing'] } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    const sub =
      activeSub ??
      (await this.prisma.userSubscription.findFirst({
        where: {
          userId,
          status: 'canceled',
          currentPeriodEnd: { gt: now },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }));
    if (!sub) return 'FREE';
    const premiumPriceId = this.config.get<string>('STRIPE_PREMIUM_PRICE_ID');
    if (sub.priceId && premiumPriceId && sub.priceId === premiumPriceId) {
      return 'PREMIUM';
    }
    return 'PRO';
  }
}
