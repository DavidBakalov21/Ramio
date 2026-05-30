import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { StripeService } from './stripe.service';

const mockConstructEvent = jest.fn();
const mockSubscriptionsRetrieve = jest.fn();
const mockSubscriptionsCancel = jest.fn();

jest.mock('stripe', () =>
  jest.fn().mockImplementation(() => ({
    webhooks: {
      constructEvent: (...args: unknown[]) => mockConstructEvent(...args),
    },
    subscriptions: {
      retrieve: (...args: unknown[]) => mockSubscriptionsRetrieve(...args),
      cancel: (...args: unknown[]) => mockSubscriptionsCancel(...args),
    },
  })),
);

describe('StripeService.handleWebhook', () => {
  let service: StripeService;
  let configGet: jest.Mock;
  let prisma: {
    user: { update: jest.Mock; findUnique: jest.Mock };
    userSubscription: {
      upsert: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
    };
  };

  const rawBody = Buffer.from('{}');
  const signature = 'sig_test';
  const premiumPriceId = 'price_premium_test';
  const userId = '42';
  const customerId = 'cus_test';
  const subscriptionId = 'sub_test';
  const periodEndUnix = 1_900_000_000;

  beforeEach(() => {
    jest.clearAllMocks();
    configGet = jest.fn((key: string) => {
      const values: Record<string, string> = {
        STRIPE_WEBHOOK_SECRET: 'whsec_test',
        STRIPE_SECRET_KEY: 'sk_test',
        STRIPE_PREMIUM_PRICE_ID: premiumPriceId,
      };
      return values[key];
    });
    prisma = {
      user: {
        update: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn(),
      },
      userSubscription: {
        upsert: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    service = new StripeService(
      { get: configGet } as unknown as ConfigService,
      prisma as unknown as PrismaService,
    );
    mockSubscriptionsRetrieve.mockResolvedValue({
      id: subscriptionId,
      status: 'active',
      customer: customerId,
      items: {
        data: [{ current_period_end: periodEndUnix, price: { id: premiumPriceId } }],
      },
    });
    mockSubscriptionsCancel.mockResolvedValue({});
  });

  function checkoutCompletedEvent() {
    return {
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test',
          mode: 'subscription',
          customer: customerId,
          subscription: subscriptionId,
          client_reference_id: userId,
        },
      },
    };
  }

  function subscriptionUpdatedEvent(status = 'active') {
    return {
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: subscriptionId,
          status,
          customer: customerId,
          items: {
            data: [
              {
                current_period_end: periodEndUnix,
                price: { id: premiumPriceId },
              },
            ],
          },
        },
      },
    };
  }

  function subscriptionDeletedEvent() {
    return {
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: subscriptionId,
          status: 'canceled',
          customer: customerId,
          ended_at: periodEndUnix,
          items: {
            data: [{ current_period_end: periodEndUnix, price: { id: premiumPriceId } }],
          },
        },
      },
    };
  }

  async function dispatch(event: object) {
    mockConstructEvent.mockReturnValue(event);
    return service.handleWebhook(rawBody, signature);
  }

  describe('missing/invalid signature → BadRequestException', () => {
    it('throws when signature header is missing', async () => {
      await expect(service.handleWebhook(rawBody, undefined)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.handleWebhook(rawBody, undefined)).rejects.toThrow(
        'Missing stripe-signature header',
      );
    });

    it('throws when constructEvent fails', async () => {
      mockConstructEvent.mockImplementation(() => {
        throw new Error('bad signature');
      });
      await expect(service.handleWebhook(rawBody, signature)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.handleWebhook(rawBody, signature)).rejects.toThrow(
        'Invalid webhook signature',
      );
    });
  });

  describe('checkout.session.completed → upsertSubscription called with the correct tier', () => {
    it('upserts subscription with premium price id', async () => {
      await dispatch(checkoutCompletedEvent());

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: BigInt(userId) },
        data: { stripeCustomerId: customerId },
      });
      expect(prisma.userSubscription.upsert).toHaveBeenCalledWith({
        where: { stripeSubscriptionId: subscriptionId },
        create: expect.objectContaining({
          userId: BigInt(userId),
          stripeSubscriptionId: subscriptionId,
          stripeCustomerId: customerId,
          status: 'active',
          priceId: premiumPriceId,
          currentPeriodEnd: new Date(periodEndUnix * 1000),
        }),
        update: expect.objectContaining({
          status: 'active',
          priceId: premiumPriceId,
          currentPeriodEnd: new Date(periodEndUnix * 1000),
        }),
      });
    });
  });

  describe('the SAME event delivered twice → upsert keyed on subscription id leaves one stable row', () => {
    it('performs identical upsert writes without diverging state', async () => {
      const event = checkoutCompletedEvent();
      await dispatch(event);
      await dispatch(event);

      expect(prisma.userSubscription.upsert).toHaveBeenCalledTimes(2);
      expect(prisma.userSubscription.upsert.mock.calls[0]).toEqual(
        prisma.userSubscription.upsert.mock.calls[1],
      );
    });
  });

  describe('out-of-order: customer.subscription.deleted then .updated → final state is NOT resurrected to active', () => {
    it('keeps canceled status after a stale active update', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: BigInt(userId),
        stripeCustomerId: customerId,
      });
      prisma.userSubscription.findUnique.mockResolvedValue({
        stripeSubscriptionId: subscriptionId,
        status: 'canceled',
      });

      await dispatch(subscriptionDeletedEvent());
      await dispatch(subscriptionUpdatedEvent('active'));

      const lastUpsert =
        prisma.userSubscription.upsert.mock.calls.at(-1)?.[0];
      expect(lastUpsert?.update?.status ?? lastUpsert?.create?.status).toBe(
        'canceled',
      );
      expect(lastUpsert?.update?.status ?? lastUpsert?.create?.status).not.toBe(
        'active',
      );
    });
  });

  describe('customer.subscription.deleted → tier downgraded to FREE', () => {
    it('writes canceled status so effective tier is FREE', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: BigInt(userId),
        stripeCustomerId: customerId,
      });

      await dispatch(subscriptionDeletedEvent());

      expect(prisma.userSubscription.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { stripeSubscriptionId: subscriptionId },
          create: expect.objectContaining({ status: 'canceled' }),
          update: expect.objectContaining({ status: 'canceled' }),
        }),
      );

      prisma.userSubscription.findFirst.mockResolvedValue(null);
      const subscriptionService = new SubscriptionService(
        prisma as unknown as PrismaService,
        { get: configGet } as unknown as ConfigService,
      );
      await expect(
        subscriptionService.getSubscriptionTier(BigInt(userId)),
      ).resolves.toBe('FREE');
    });
  });

  describe('unknown event.type → no-op (no upsert call)', () => {
    it('returns received without touching subscriptions', async () => {
      await expect(
        dispatch({ type: 'invoice.payment_succeeded', data: { object: {} } }),
      ).resolves.toEqual({ received: true });
      expect(prisma.userSubscription.upsert).not.toHaveBeenCalled();
    });
  });

  describe('missing STRIPE_WEBHOOK_SECRET → ServiceUnavailableException', () => {
    it('throws ServiceUnavailableException', async () => {
      configGet.mockImplementation((key: string) => {
        if (key === 'STRIPE_WEBHOOK_SECRET') return undefined;
        if (key === 'STRIPE_SECRET_KEY') return 'sk_test';
        return undefined;
      });
      await expect(service.handleWebhook(rawBody, signature)).rejects.toThrow(
        ServiceUnavailableException,
      );
      await expect(service.handleWebhook(rawBody, signature)).rejects.toThrow(
        'Stripe webhook is not configured',
      );
    });
  });
});
