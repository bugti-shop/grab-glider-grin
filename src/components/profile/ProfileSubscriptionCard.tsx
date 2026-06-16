import { useTranslation } from 'react-i18next';
import { Crown, Gift, Calendar, Clock, ChevronRight, Shield, Loader2, RefreshCw } from 'lucide-react';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { toast } from 'sonner';
import { useState } from 'react';

const ENTITLEMENT_ID = 'Pro';
const TRIAL_TOTAL_DAYS = 8;

export const ProfileSubscriptionCard = () => {
  const { t } = useTranslation();
  const { isPro, planType, customerInfo, openPaywall, restorePurchases } = useSubscription();
  const [isRestoring, setIsRestoring] = useState(false);

  const handleRestore = async () => {
    if (isRestoring) return;
    setIsRestoring(true);
    try {
      const ok = await restorePurchases();
      toast.success(
        ok
          ? t('profile.restoreSuccessSub', 'Purchases restored!')
          : t('profile.restoreNoneFound', 'No active purchases found on this account'),
      );
    } catch (e: any) {
      toast.error(t('profile.restoreFailedSub', 'Restore failed. Try again.'));
    } finally {
      setIsRestoring(false);
    }
  };

  // Extract subscription details from RevenueCat customerInfo
  const entitlement = customerInfo?.entitlements?.active?.[ENTITLEMENT_ID];
  const isTrialing = entitlement?.periodType === 'TRIAL' || entitlement?.periodType === 'trial';
  const expirationDate = entitlement?.expirationDate ? new Date(entitlement.expirationDate) : null;
  const purchaseDate = entitlement?.latestPurchaseDate ? new Date(entitlement.latestPurchaseDate) : null;
  const willRenew = entitlement?.willRenew ?? false;

  const formatDate = (date: Date | null) => {
    if (!date) return '—';
    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const getPlanLabel = () => {
    if (!isPro) return t('profile.freePlan', 'Free');
    if (isTrialing) return t('profile.trialPlan', 'Free Trial');
    switch (planType) {
      case 'weekly': return t('profile.weeklyPlan', 'Weekly');
      case 'monthly': return t('profile.monthlyPlan', 'Monthly');
      case 'yearly': return t('profile.yearlyPlan', 'Yearly');
      default: return t('profile.proPlan', 'Pro');
    }
  };

  const getDaysRemaining = () => {
    if (!expirationDate) return null;
    const now = new Date();
    const diff = expirationDate.getTime() - now.getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  };

  const daysRemaining = getDaysRemaining();
  const trialProgress = isTrialing && daysRemaining !== null
    ? Math.max(0, Math.min(1, (TRIAL_TOTAL_DAYS - daysRemaining) / TRIAL_TOTAL_DAYS))
    : null;

  const getStatusColor = () => {
    if (!isPro) return 'text-muted-foreground';
    if (isTrialing && daysRemaining !== null && daysRemaining <= 3) return 'text-destructive';
    if (isTrialing) return 'text-amber-600 dark:text-amber-400';
    return 'text-primary';
  };

  return (
    <div
      className="w-full rounded-2xl border border-border/50 overflow-hidden bg-card"
    >
      {/* Header */}
      <div className={`px-4 py-3 flex items-center gap-3 ${isPro ? 'bg-primary/10' : 'bg-muted/50'}`}>
        <div className={`w-9 h-9 rounded-full flex items-center justify-center ${isPro ? 'bg-primary/20' : 'bg-muted'}`}>
          {isPro ? (
            isTrialing ? <Gift className="h-4.5 w-4.5 text-primary" /> : <Crown className="h-4.5 w-4.5" fill="#FFD700" color="#FFD700" />
          ) : (
            <Crown className="h-4.5 w-4.5 text-muted-foreground" fill="#FFD700" color="#FFD700" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">{getPlanLabel()}</p>
          <p className="text-xs text-muted-foreground">
            {isPro
              ? isTrialing
                ? t('profile.trialActive', 'Trial is active')
                : t('profile.subscriptionActive', 'Subscription active')
              : t('profile.noSubscription', 'No active subscription')}
          </p>
        </div>
        {isPro && (
          <span className="px-2.5 py-1 text-[10px] font-bold uppercase rounded-full bg-primary/15 text-primary tracking-wide">
            {isTrialing ? t('profile.trial', 'Trial') : t('profile.pro', 'PRO')}
          </span>
        )}
      </div>

      {/* Details */}
      <div className="px-4 py-3 space-y-2.5">
        {/* Trial progress bar */}
        {isPro && isTrialing && trialProgress !== null && daysRemaining !== null && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className={`text-xs font-semibold ${getStatusColor()}`}>
                {daysRemaining <= 0
                  ? t('profile.trialExpired', 'Trial expired')
                  : daysRemaining === 1
                    ? t('profile.trialLastDay', '1 day left in trial')
                    : t('profile.trialDaysLeft', '{{days}} days left in trial', { days: daysRemaining })}
              </span>
              <span className="text-[10px] text-muted-foreground font-medium">
                {TRIAL_TOTAL_DAYS - daysRemaining}/{TRIAL_TOTAL_DAYS}
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{
                  background: daysRemaining <= 3
                    ? 'hsl(0 84.2% 60.2%)'
                    : daysRemaining <= 7
                      ? 'hsl(38 92% 50%)'
                      : 'hsl(var(--primary))',
                  width: `${trialProgress * 100}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Non-trial days remaining indicator */}
        {isPro && !isTrialing && daysRemaining !== null && (
          <div className="flex items-center justify-between py-1 px-3 rounded-xl bg-primary/5">
            <div className="flex items-center gap-2">
              <Shield className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-medium text-primary">
                {willRenew
                  ? t('profile.autoRenews', 'Auto-renews in {{days}} days', { days: daysRemaining })
                  : t('profile.expiresInDays', 'Expires in {{days}} days', { days: daysRemaining })}
              </span>
            </div>
          </div>
        )}

        {isPro && expirationDate && (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" />
                <span className="text-xs">
                  {isTrialing
                    ? t('profile.trialEnds', 'Trial ends')
                    : willRenew
                      ? t('profile.renewsOn', 'Renews on')
                      : t('profile.expiresOn', 'Expires on')}
                </span>
              </div>
              <span className="text-xs font-medium text-foreground">{formatDate(expirationDate)}</span>
            </div>

            {purchaseDate && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" />
                  <span className="text-xs">{t('profile.startedOn', 'Started on')}</span>
                </div>
                <span className="text-xs font-medium text-foreground">{formatDate(purchaseDate)}</span>
              </div>
            )}
          </>
        )}

        {/* Action button */}
        {!isPro ? (
          <button
            onClick={() => openPaywall()}
            className="w-full flex items-center justify-between px-3 py-2.5 mt-1 rounded-xl bg-primary/10 hover:bg-primary/15 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Crown className="h-4 w-4" fill="#FFD700" color="#FFD700" />
              <span className="text-sm font-medium text-primary">{t('profile.upgradeToPro', 'Upgrade to Flowist Pro')}</span>
            </div>
            <ChevronRight className="h-4 w-4 text-primary" />
          </button>
        ) : isTrialing ? (
          <button
            onClick={() => openPaywall()}
            className="w-full flex items-center justify-between px-3 py-2.5 mt-1 rounded-xl bg-primary/10 hover:bg-primary/15 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Crown className="h-4 w-4" fill="#FFD700" color="#FFD700" />
              <span className="text-sm font-medium text-primary">{t('profile.subscribeToPro', 'Subscribe to keep Pro')}</span>
            </div>
            <ChevronRight className="h-4 w-4 text-primary" />
          </button>
        ) : null}

        {/* Restore purchases — always visible so users can recover an existing subscription */}
        <button
          onClick={handleRestore}
          disabled={isRestoring}
          className="w-full flex items-center justify-center gap-2 mt-1 px-3 py-2 rounded-xl border border-border/60 hover:bg-muted/50 transition-colors disabled:opacity-60"
        >
          {isRestoring ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <span className="text-xs font-medium text-foreground">
            {isRestoring
              ? t('profile.restoring', 'Restoring…')
              : t('profile.restorePurchases', 'Restore Purchases')}
          </span>
        </button>
      </div>
    </div>
  );
};