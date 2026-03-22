import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { User } from '@prisma/client';
import Stripe from 'stripe';
import { SupportCheckoutDto } from './dto/support-checkout.dto';

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private stripe: Stripe | null = null;

  constructor(private readonly config: ConfigService) {}

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
    const frontend = this.config.get<string>('FRONTEND_BASE_URL')?.replace(/\/$/, '');
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
      throw new InternalServerErrorException('Stripe did not return a checkout URL');
    }

    return { url: session.url };
  }

  handleWebhook(rawBody: Buffer, signature: string | undefined) {
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
        const session = event.data.object as Stripe.Checkout.Session;
        this.logger.log(
          `checkout.session.completed id=${session.id} amount_total=${session.amount_total} currency=${session.currency} client_reference_id=${session.client_reference_id} metadata=${JSON.stringify(session.metadata ?? {})}`,
        );
        break;
      }
      default:
        this.logger.debug(`Stripe webhook event (no handler): ${event.type}`);
    }

    return { received: true };
  }
}
