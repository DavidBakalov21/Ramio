import { IsIn } from 'class-validator';

export class SubscriptionCheckoutDto {
  @IsIn(['PRO', 'PREMIUM'])
  tier: 'PRO' | 'PREMIUM';
}
