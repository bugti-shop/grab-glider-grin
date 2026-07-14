// Billing Configuration - Product and entitlement identifiers for RevenueCat

import { Capacitor } from '@capacitor/core';

// Entitlement identifier - matches RevenueCat dashboard
export const ENTITLEMENT_ID = 'Pro';

// Product identifiers - matches RevenueCat dashboard and store products
const IS_IOS = Capacitor.getPlatform() === 'ios';

export const BILLING_CONFIG = IS_IOS ? {
  weekly: {
    productId: 'com.flowist.app.week',
  },
  monthly: {
    productId: 'com.flowist.app.month',
  },
  yearly: {
    productId: 'com.flowist.app.year',
  },
} as const : {
  weekly: {
    productId: 'nnppd_weekly:nnnpd-weekly',
    basePlanId: 'nnnpd-weekly',
  },
  monthly: {
    productId: 'npd_mo:npd-mo',
    basePlanId: 'npd-mo',
    trialOfferId: 'npd-monthly-offer',
  },
  yearly: {
    productId: 'npd_yr:npd-yearly-plan',
    basePlanId: 'npd-yearly-plan',
    trialOfferId: 'npd-yearly-trial',
  },
} as const;


export type PlanType = keyof typeof BILLING_CONFIG;

export interface SubscriptionProduct {
  productId: string;
  basePlanId?: string;
  purchaseOptionId?: string;
}

export const getSubscriptionDetails = (plan: PlanType): SubscriptionProduct => {
  return BILLING_CONFIG[plan];
};

// Stripe Payment Links for web purchases
export const STRIPE_PAYMENT_LINKS: Partial<Record<PlanType, string>> = {
  weekly: 'https://buy.stripe.com/7sY14n7WX15lbLraEjgfu00',
  monthly: 'https://buy.stripe.com/7sYfZh911cO302JaEjgfu01',
  yearly: 'https://buy.stripe.com/fZuaEX5OP8xNdTz3bRgfu02',
};

// Stripe Price IDs
export const STRIPE_PRICE_IDS: Partial<Record<PlanType, string>> = {
  weekly: 'price_1TsvMUFAPtKh08jGgppw6EdS',
  monthly: 'price_1TsvLsFAPtKh08jGYUjyPA4Y',
  yearly: 'price_1TsvMoFAPtKh08jGgQg9cfM3',
};


// Pricing display (for UI only - actual pricing comes from RevenueCat/Store)
export const PRICING_DISPLAY = {
  weekly: {
    price: '$1.99',
    period: 'week',
    displayPrice: '$1.99/wk',
  },
  monthly: {
    price: '$3.99',
    period: 'month',
    displayPrice: '$3.99/mo',
  },
  yearly: {
    price: '$39.99',
    period: 'year',
    displayPrice: '$39.99/yearly',
  },
} as const;

export const isNativePlatform = (): boolean => {
  return Capacitor.isNativePlatform();
};
