import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { getSetting, setSetting } from '@/utils/settingsStorage';

const EXPIRY_WARNED_KEY = 'flowist_expiry_warned';
const EXPIRY_NOTIFIED_KEY = 'flowist_expiry_notified';

/**
 * Watches subscription status and fires:
 * 1. A warning notification 1 day before trial/subscription expires
 * 2. An expiry notification when Pro access is revoked
 */
export const useSubscriptionExpiry = () => {
  const { isPro, customerInfo, isLoading } = useSubscription();
  const isNative = Capacitor.isNativePlatform();
  const prevIsProRef = useRef<boolean | null>(null);
  const hasCheckedRef = useRef(false);

  // Request notification permission early (lazy loaded to avoid crashes)
  useEffect(() => {
    if (isNative) return;
    import('@/utils/webNotifications')
      .then(({ requestNotificationPermission }) => requestNotificationPermission())
      .catch(() => {});
  }, [isNative]);

  // Detect Pro → Free transition (subscription expired)
  useEffect(() => {
    if (isNative) return;
    if (isLoading) return;

    // First load: just record current state
    if (prevIsProRef.current === null) {
      prevIsProRef.current = isPro;
      return;
    }

    // Pro → Free transition = subscription expired
    if (prevIsProRef.current === true && !isPro) {
      handleExpired();
    }

    prevIsProRef.current = isPro;
  }, [isNative, isPro, isLoading]);

  // Check for upcoming expiry (1 day warning)
  useEffect(() => {
    if (isNative) return;
    if (isLoading || hasCheckedRef.current || !isPro || !customerInfo) return;
    hasCheckedRef.current = true;

    const entitlement = customerInfo.entitlements?.active?.['Pro'];
    if (!entitlement?.expirationDate) return;

    const expirationDate = new Date(entitlement.expirationDate);
    const now = new Date();
    const hoursRemaining = (expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60);

    // Warning: 0–24 hours remaining
    if (hoursRemaining > 0 && hoursRemaining <= 24) {
      handleExpiryWarning(hoursRemaining, entitlement.periodType);
    }
  }, [isNative, isPro, customerInfo, isLoading]);

  const handleExpiryWarning = async (hoursRemaining: number, periodType?: string | null) => {
    const today = new Date().toDateString();
    const lastWarned = await getSetting<string>(EXPIRY_WARNED_KEY, '');
    if (lastWarned === today) return; // Already warned today

    await setSetting(EXPIRY_WARNED_KEY, today);

    const isTrial = periodType === 'TRIAL' || periodType === 'trial';
    const daysLeft = Math.max(1, Math.ceil(hoursRemaining / 24));
    const title = isTrial ? '⏰ Trial Ending Soon' : '⏰ Subscription Expiring';
    const body = isTrial
      ? `Your free trial expires in ${daysLeft} day${daysLeft > 1 ? 's' : ''}. Upgrade now to keep Pro features!`
      : `Your subscription expires in ${daysLeft} day${daysLeft > 1 ? 's' : ''}. Renew to keep Pro features!`;

    import('@/utils/webNotifications').then(({ sendWebNotification }) => 
      sendWebNotification(title, { body, tag: 'sub-warning' })
    ).catch(() => {});
    
    // Also dispatch event for in-app UI
    window.dispatchEvent(new CustomEvent('subscriptionWarning', {
      detail: { title, body, isTrial, hoursRemaining }
    }));
  };

  const handleExpired = async () => {
    const today = new Date().toDateString();
    const lastNotified = await getSetting<string>(EXPIRY_NOTIFIED_KEY, '');
    if (lastNotified === today) return;

    await setSetting(EXPIRY_NOTIFIED_KEY, today);

    const title = '🔒 Pro Access Expired';
    const body = 'Your subscription has ended. Upgrade to restore Pro features.';

    import('@/utils/webNotifications').then(({ sendWebNotification }) =>
      sendWebNotification(title, { body, tag: 'sub-expired' })
    ).catch(() => {});
    
    window.dispatchEvent(new CustomEvent('subscriptionExpired', {
      detail: { title, body }
    }));
  };
};
