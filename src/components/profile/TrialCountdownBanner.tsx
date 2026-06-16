import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, Crown } from 'lucide-react';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { getSetting } from '@/utils/settingsStorage';

const FREE_TRIAL_DAYS = 2;

export const TrialCountdownBanner = () => {
  const { t } = useTranslation();
  const { isLocalTrial, openPaywall } = useSubscription();
  const [daysLeft, setDaysLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!isLocalTrial) return;
    getSetting<number>('flowist_trial_start', 0).then((start) => {
      if (!start) return;
      const elapsed = Date.now() - start;
      const remaining = Math.max(0, Math.ceil((FREE_TRIAL_DAYS * 86400000 - elapsed) / 86400000));
      setDaysLeft(remaining);
    });
  }, [isLocalTrial]);

  // Free trial removed — banner permanently disabled.
  return null;
  if (!isLocalTrial || daysLeft === null) return null;

  const progress = (FREE_TRIAL_DAYS - daysLeft) / FREE_TRIAL_DAYS;
  const isUrgent = daysLeft <= 2;

  return (
    <div className="px-5 mt-4">
      <div className={`rounded-2xl border p-4 ${
        isUrgent
          ? 'border-destructive/30 bg-destructive/5'
          : 'border-primary/20 bg-primary/5'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
            isUrgent ? 'bg-destructive/10' : 'bg-primary/10'
          }`}>
            <Clock className={`h-5 w-5 ${isUrgent ? 'text-destructive' : 'text-primary'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-bold ${isUrgent ? 'text-destructive' : 'text-foreground'}`}>
              {daysLeft === 0
                ? t('profile.trialEndsToday', 'Trial ends today!')
                : daysLeft === 1
                  ? t('profile.trialLastDay', '1 day left in trial')
                  : t('profile.trialDaysLeft', '{{days}} days left in trial', { days: daysLeft })}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('profile.trialBannerDesc', 'Subscribe to keep all Pro features')}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${
              isUrgent ? 'bg-destructive' : 'bg-primary'
            }`}
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[10px] text-muted-foreground">
            {t('profile.trialDay', 'Day {{current}} of {{total}}', { current: FREE_TRIAL_DAYS - daysLeft, total: FREE_TRIAL_DAYS })}
          </span>
          <button
            onClick={() => openPaywall()}
            className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
              isUrgent
                ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
            }`}
          >
            <Crown className="h-3 w-3" />
            {t('profile.upgradeNow', 'Upgrade Now')}
          </button>
        </div>
      </div>
    </div>
  );
};
