import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import Stripe from 'stripe';
import { SubscriptionCheckoutDto } from './dto/subscription-checkout.dto';
import { SupportCheckoutDto } from './dto/support-checkout.dto';

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private stripe: Stripe | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private getStripe(): Stripe {
    const key = this.config.get<string>('STRIPE_SECRET_KEY');
    if (!key) {
      throw new ServiceUnavailableException('Stripe is not configured');
    }
    if (!this.stripe) {
      this.stripe = new Stripe(key);
    }
    return this.stripe;
  }

  async createSupportCheckout(user: User, dto: SupportCheckoutDto) {
    const priceId = this.config.get<string>('STRIPE_SUPPORT_PRICE_ID');
    const frontend = this.config
      .get<string>('FRONTEND_BASE_URL')
      ?.replace(/\/$/, '');
    if (!priceId || !frontend) {
      throw new ServiceUnavailableException(
        'Support checkout is not configured (STRIPE_SUPPORT_PRICE_ID, FRONTEND_BASE_URL)',
      );
    }

    const courseId = dto.courseId?.trim() ?? '';
    const assignmentId = dto.assignmentId?.trim() ?? '';

    const returnPath =
      courseId && assignmentId
        ? `/courses/${courseId}/assignment/${assignmentId}`
        : '/support';

    const stripe = this.getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${frontend}${returnPath}?support=thanks`,
      cancel_url: `${frontend}${returnPath}?support=cancelled`,
      client_reference_id: user.id.toString(),
      customer_email: user.email,
      metadata: {
        userId: user.id.toString(),
        courseId,
        assignmentId,
      },
    });

    if (!session.url) {
      throw new InternalServerErrorException(
        'Stripe did not return a checkout URL',
      );
    }

    return { url: session.url };
  }

  async createSubscriptionCheckout(user: User, dto: SubscriptionCheckoutDto) {
    const priceId =
      dto.tier === 'PREMIUM'
        ? this.config.get<string>('STRIPE_PREMIUM_PRICE_ID')
        : this.config.get<string>('STRIPE_PRO_PRICE_ID');
    const frontend = this.config
      .get<string>('FRONTEND_BASE_URL')
      ?.replace(/\/$/, '');
    if (!priceId || !frontend) {
      throw new ServiceUnavailableException(
        `Subscription checkout is not configured (STRIPE_${dto.tier}_PRICE_ID, FRONTEND_BASE_URL)`,
      );
    }

    const stripe = this.getStripe();

    let customerId: string | undefined = user.stripeCustomerId ?? undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId: user.id.toString() },
      });
      customerId = customer.id;
      await this.prisma.user.update({
        where: { id: user.id },
        data: { stripeCustomerId: customerId },
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${frontend}/support?subscription=success`,
      cancel_url: `${frontend}/support?subscription=cancelled`,
      client_reference_id: user.id.toString(),
      subscription_data: {
        metadata: { userId: user.id.toString(), tier: dto.tier },
      },
    });

    if (!session.url) {
      throw new InternalServerErrorException(
        'Stripe did not return a checkout URL',
      );
    }

    return { url: session.url };
  }

  private subscriptionPeriodEndDate(sub: Stripe.Subscription): Date {
    const fromItem = sub.items?.data?.[0]?.current_period_end;
    const legacy = (sub as { current_period_end?: number }).current_period_end;
    const unix =
      (typeof fromItem === 'number' && fromItem > 0
        ? fromItem
        : undefined) ??
      (typeof legacy === 'number' && legacy > 0 ? legacy : undefined) ??
      (typeof sub.ended_at === 'number' && sub.ended_at > 0
        ? sub.ended_at
        : undefined);
    if (unix != null) {
      return new Date(unix * 1000);
    }
    this.logger.warn(
      `Stripe subscription ${sub.id}: missing current_period_end on items; using current time`,
    );
    return new Date();
  }

  private async upsertSubscription(
    stripeSubscriptionId: string,
    stripeCustomerId: string,
    userId: bigint,
    status: string,
    currentPeriodEnd: Date,
    priceId?: string,
  ): Promise<void> {
    await this.prisma.userSubscription.upsert({
      where: { stripeSubscriptionId },
      create: {
        userId,
        stripeSubscriptionId,
        stripeCustomerId,
        status,
        currentPeriodEnd,
        priceId,
      },
      update: { status, currentPeriodEnd, priceId, updatedAt: new Date() },
    });
  }

  private static readonly CANCEL_ELIGIBLE_STATUSES = new Set<
    Stripe.Subscription.Status
  >(['active', 'trialing', 'past_due', 'paused']);
  private async cancelOtherDbSubscriptionsOnStripe(
    stripe: Stripe,
    stripeCustomerId: string,
    keepSubscriptionId: string,
  ): Promise<void> {
    const rows = await this.prisma.userSubscription.findMany({
      where: {
        stripeCustomerId,
        stripeSubscriptionId: { not: keepSubscriptionId },
      },
    });
    for (const row of rows) {
      try {
        const live = await stripe.subscriptions.retrieve(row.stripeSubscriptionId);
        if (!StripeService.CANCEL_ELIGIBLE_STATUSES.has(live.status)) {
          continue;
        }
        await stripe.subscriptions.cancel(row.stripeSubscriptionId);
        this.logger.log(
          `Canceled previous subscription ${row.stripeSubscriptionId} for customer ${stripeCustomerId} (kept ${keepSubscriptionId})`,
        );
      } catch (err) {
        this.logger.warn(
          `Failed to cancel subscription ${row.stripeSubscriptionId} for customer ${stripeCustomerId}: ${err}`,
        );
      }
    }
  }

  async handleWebhook(rawBody: Buffer, signature: string | undefined) {
    const webhookSecret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!webhookSecret) {
      throw new ServiceUnavailableException('Stripe webhook is not configured');
    }
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }

    const stripe = this.getStripe();
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err) {
      this.logger.warn(`Webhook signature verification failed: ${err}`);
      throw new BadRequestException('Invalid webhook signature');
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        this.logger.log(
          `checkout.session.completed id=${session.id} mode=${session.mode} client_reference_id=${session.client_reference_id}`,
        );
        if (
          session.mode === 'subscription' &&
          session.customer &&
          session.subscription
        ) {
          const userId = session.client_reference_id;
          const customerId =
            typeof session.customer === 'string'
              ? session.customer
              : session.customer.id;
          if (userId) {
            await this.prisma.user.update({
              where: { id: BigInt(userId) },
              data: { stripeCustomerId: customerId },
            });
            const subId =
              typeof session.subscription === 'string'
                ? session.subscription
                : session.subscription?.id;
            if (subId) {
              const stripe = this.getStripe();
              const sub = await stripe.subscriptions.retrieve(subId);
              const priceId = sub.items.data[0]?.price?.id ?? undefined;
              await this.upsertSubscription(
                sub.id,
                customerId,
                BigInt(userId),
                sub.status,
                this.subscriptionPeriodEndDate(sub),
                priceId,
              );
              await this.cancelOtherDbSubscriptionsOnStripe(
                stripe,
                customerId,
                sub.id,
              );
            }
          }
        }
        break;
      }
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const customerId =
          typeof subscription.customer === 'string'
            ? subscription.customer
            : subscription.customer?.id;
        if (!customerId) break;
        const user = await this.prisma.user.findUnique({
          where: { stripeCustomerId: customerId },
        });
        if (!user) break;
        const priceId = subscription.items.data[0]?.price?.id ?? undefined;
        await this.upsertSubscription(
          subscription.id,
          customerId,
          user.id,
          subscription.status,
          this.subscriptionPeriodEndDate(subscription),
          priceId,
        );
        this.logger.log(
          `customer.subscription.updated id=${subscription.id} status=${subscription.status}`,
        );
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customerId =
          typeof subscription.customer === 'string'
            ? subscription.customer
            : subscription.customer?.id;
        if (!customerId) break;
        const user = await this.prisma.user.findUnique({
          where: { stripeCustomerId: customerId },
        });
        if (!user) break;
        await this.upsertSubscription(
          subscription.id,
          customerId,
          user.id,
          'canceled',
          this.subscriptionPeriodEndDate(subscription),
        );
        this.logger.log(
          `customer.subscription.deleted id=${subscription.id} -> status=canceled`,
        );
        break;
      }
      default:
        this.logger.debug(`Stripe webhook event (no handler): ${event.type}`);
    }

    return { received: true };
  }
}
