import { useState, useEffect, useCallback } from 'react';
import { Crown, X, AlertTriangle, Lock } from 'lucide-react';
import { useSubscription } from '@/contexts/SubscriptionContext';

interface BannerData {
  type: 'warning' | 'expired';
  title: string;
  body: string;
}

export const SubscriptionExpiryBanner = () => {
  const { openPaywall } = useSubscription();
  const [banner, setBanner] = useState<BannerData | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleWarning = (e: CustomEvent) => {
      setBanner({
        type: 'warning',
        title: e.detail.title,
        body: e.detail.body,
      });
    };

    const handleExpired = (e: CustomEvent) => {
      setBanner({
        type: 'expired',
        title: e.detail.title,
        body: e.detail.body,
      });
    };

    window.addEventListener('subscriptionWarning', handleWarning as EventListener);
    window.addEventListener('subscriptionExpired', handleExpired as EventListener);

    return () => {
      window.removeEventListener('subscriptionWarning', handleWarning as EventListener);
      window.removeEventListener('subscriptionExpired', handleExpired as EventListener);
    };
  }, []);

  // Animate in when banner is set
  useEffect(() => {
    if (banner) {
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [banner]);

  // Auto-dismiss
  useEffect(() => {
    if (!banner) return;
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => setBanner(null), 300);
    }, banner.type === 'expired' ? 20000 : 15000);
    return () => clearTimeout(timer);
  }, [banner]);

  const dismiss = useCallback(() => {
    setVisible(false);
    setTimeout(() => setBanner(null), 300);
  }, []);

  if (!banner) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[190] px-4 transition-all duration-300 ease-out"
      style={{
        paddingTop: 'calc(var(--safe-top, 0px) + 12px)',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(-60px)',
      }}
    >
      <div
        className={`mx-auto max-w-md rounded-2xl border shadow-lg ${
          banner.type === 'expired'
            ? 'bg-destructive border-destructive/30 text-destructive-foreground'
            : 'bg-amber-500 border-amber-400/30 text-white'
        }`}
      >
        <div className="flex items-start gap-3 p-4">
          <div className="mt-0.5 flex-shrink-0 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
            {banner.type === 'expired' ? (
              <Lock className="h-4 w-4" />
            ) : (
              <AlertTriangle className="h-4 w-4" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">{banner.title}</p>
            <p className="text-xs opacity-90 mt-0.5">{banner.body}</p>
            <button
              onClick={() => {
                dismiss();
                openPaywall();
              }}
              className={`mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                banner.type === 'expired'
                  ? 'bg-white text-destructive hover:bg-white/90'
                  : 'bg-white text-amber-600 hover:bg-white/90'
              }`}
            >
              <Crown className="h-3 w-3" fill="#FFD700" color="#FFD700" />
              Upgrade Now
            </button>
          </div>
          <button
            onClick={dismiss}
            className="flex-shrink-0 w-6 h-6 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
