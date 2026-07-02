import { useEffect, useState } from 'react';
import { useSubscription } from '@/contexts/SubscriptionContext';

/**
 * True when the signed-in user has an active Team or Family plan.
 * Guest links and other team-tier features gate on this.
 * We inspect the RevenueCat product identifier stored locally,
 * plus the Stripe plan label captured by SubscriptionContext.
 */
export function useHasTeamPlan(): boolean {
  const { isPro } = useSubscription();
  const [hasTeam, setHasTeam] = useState(false);

  useEffect(() => {
    if (!isPro) { setHasTeam(false); return; }
    const rcProduct = (localStorage.getItem('flowist_rc_product') ?? '').toLowerCase();
    const stripePlan = (localStorage.getItem('flowist_stripe_plan') ?? '').toLowerCase();
    setHasTeam(
      rcProduct.includes('team') || rcProduct.includes('family') ||
      stripePlan.includes('team') || stripePlan.includes('family'),
    );
  }, [isPro]);

  return hasTeam;
}
