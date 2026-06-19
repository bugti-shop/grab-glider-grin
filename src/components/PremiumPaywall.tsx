import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useInRouterContext } from 'react-router-dom';

// Safe navigate — falls back to window.location when the paywall renders
// outside <BrowserRouter> (during onboarding/landing).
function useSafeNavigate() {
  const inRouter = useInRouterContext();
  const navigate = inRouter ? useNavigate() : null;
  return (to: string) => {
    if (navigate) navigate(to);
    else { try { window.location.assign(to); } catch {} }
  };
}
import appLogo from '@/assets/app-logo.webp';
import heroCrown from '@/assets/paywall-hero-king-throne.webp';
import { useTranslation } from 'react-i18next';
import { Crown, Unlock, Bell, Gift, Check, X, Lock, CalendarDays, Clock, LayoutGrid, Blocks, Timer, BookOpen } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useSubscription, ProductType, FREE_CAPACITY_LIMITS, SOFT_FREE_LIMITS, CAPACITY_LABELS } from '@/contexts/SubscriptionContext';
import { Capacitor } from '@capacitor/core';
import { PurchasesPackage, PACKAGE_TYPE } from '@revenuecat/purchases-capacitor';
import { triggerTripleHeavyHaptic } from '@/utils/haptics';
import { supabase } from '@/lib/supabase';
import { getLocalLifetimeMax } from '@/utils/lifetimeCountersCloud';
import { loadTasksFromDB, updateTaskInDB } from '@/utils/taskStorage';
import { format, formatDistanceToNow, isToday, isTomorrow } from 'date-fns';



// Fallback prices (USD) used only when RevenueCat offerings aren't available (e.g. web)
const FALLBACK_PLANS: { id: ProductType; labelKey: string; price: string; badgeKey: string | null; hasTrial: boolean }[] = [
  { id: 'weekly', labelKey: 'onboarding.paywall.weekly', price: '$1.99/wk', badgeKey: null, hasTrial: false },
  { id: 'monthly', labelKey: 'onboarding.paywall.monthly', price: '$3.99/mo', badgeKey: 'onboarding.paywall.popular', hasTrial: true },
  { id: 'yearly', labelKey: 'onboarding.paywall.yearly', price: '$39.99/yearly', badgeKey: 'onboarding.paywall.bestValue', hasTrial: true },
];

const PERIOD_LABELS: Record<string, string> = {
  weekly: '/wk',
  monthly: '/mo',
  yearly: '/yr',
};

// Shared hook for plans and purchase logic
function usePaywallLogic() {
  const { t } = useTranslation();
  const { showPaywall, closePaywall, purchase, offerings, restorePurchases, isNewFreeUser, isPro, paywallFeature } = useSubscription();
  const [selectedPlan, setSelectedPlan] = useState<ProductType>('monthly');
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [adminError, setAdminError] = useState('');

  const PLANS = useMemo(() => {
    const allPackages: PurchasesPackage[] = [];
    if (offerings?.current?.availablePackages) {
      allPackages.push(...offerings.current.availablePackages);
    }
    if (offerings?.all) {
      Object.values(offerings.all).forEach((offering: any) => {
        offering?.availablePackages?.forEach((p: PurchasesPackage) => {
          if (!allPackages.find(e => e.identifier === p.identifier)) {
            allPackages.push(p);
          }
        });
      });
    }

    const typeMap: Record<ProductType, PACKAGE_TYPE> = {
      weekly: PACKAGE_TYPE.WEEKLY,
      monthly: PACKAGE_TYPE.MONTHLY,
      yearly: PACKAGE_TYPE.ANNUAL,
    };

    const findPrice = (type: ProductType): string | null => {
      const pkg = allPackages.find(p => p.packageType === typeMap[type]);
      const product = pkg?.product;
      if (product?.priceString) {
        return `${product.priceString}${PERIOD_LABELS[type] || ''}`;
      }
      return null;
    };

    const findTrialPrice = (type: ProductType): string | null => {
      const pkg = allPackages.find(p => p.packageType === typeMap[type]);
      const product = pkg?.product;
      if (product?.introPrice) {
        return product.introPrice.priceString || null;
      }
      return null;
    };

    return FALLBACK_PLANS.map(plan => ({
      ...plan,
      price: findPrice(plan.id) || plan.price,
      trialPriceString: findTrialPrice(plan.id),
    }));
  }, [offerings]);

  const currentPlan = PLANS.find(p => p.id === selectedPlan)!;

  // Check if this device has already used a free trial
  const hasUsedTrial = useMemo(() => {
    try {
      return localStorage.getItem('flowist_trial_used') === 'true';
    } catch { return false; }
  }, []);

  const handlePurchase = async () => {
    setIsPurchasing(true);
    setAdminError('');
    try {
      if (Capacitor.isNativePlatform()) {
        const success = await purchase(selectedPlan);
        if (success) {
          // Mark trial as used on this device
          try { localStorage.setItem('flowist_trial_used', 'true'); } catch {}
          closePaywall();
        } else {
          setAdminError(t('onboarding.paywall.purchaseCancelled'));
          setTimeout(() => setAdminError(''), 4000);
        }
      } else {
        // Web: use Supabase edge function for Stripe checkout (works with or without auth)
        const { data: { session } } = await supabase.auth.getSession();
        const headers: Record<string, string> = {};
        if (session?.access_token) {
          headers['Authorization'] = `Bearer ${session.access_token}`;
        }

        const { data, error } = await supabase.functions.invoke('create-checkout', {
          body: { planType: selectedPlan },
          headers,
        });

        if (error || !data?.url) {
          console.error('Checkout error:', error || data?.error);
          setAdminError(data?.error || 'Failed to create checkout session');
          setTimeout(() => setAdminError(''), 5000);
          return;
        }

        // Do NOT mark trial as used here — only after successful payment
        // Redirect to Stripe checkout — do NOT close paywall here
        // If user presses back without paying, paywall must remain visible
        window.location.href = data.url;
      }
    } catch (error: any) {
      if (error.code !== 'PURCHASE_CANCELLED' && !error.userCancelled) {
        console.error('Purchase failed:', error);
        setAdminError(`Purchase failed: ${error.message || 'Please try again.'}`);
        setTimeout(() => setAdminError(''), 5000);
      }
    } finally {
      setIsPurchasing(false);
    }
  };

  const [restoreEmail, setRestoreEmail] = useState('');
  const [showRestoreEmail, setShowRestoreEmail] = useState(false);

  const handleRestore = async () => {
    setIsRestoring(true);
    try {
      if (Capacitor.isNativePlatform()) {
        const success = await restorePurchases();
        if (success) {
          closePaywall();
        } else {
          setAdminError(t('onboarding.paywall.noActivePurchases'));
          setTimeout(() => setAdminError(''), 4000);
        }
      } else {
        // Web: check Stripe subscription status
        const { data: { session } } = await supabase.auth.getSession();
        
        // If no auth session, ask for email
        if (!session?.access_token && !restoreEmail.trim()) {
          setShowRestoreEmail(true);
          setAdminError('Enter the email you used to subscribe');
          setTimeout(() => setAdminError(''), 5000);
          setIsRestoring(false);
          return;
        }

        const headers: Record<string, string> = {};
        if (session?.access_token) {
          headers['Authorization'] = `Bearer ${session.access_token}`;
        }

        const { data, error } = await supabase.functions.invoke('check-subscription', {
          body: restoreEmail.trim() ? { email: restoreEmail.trim() } : undefined,
          headers,
        });

        if (data?.subscribed) {
          // Mark as subscribed locally
          try { localStorage.setItem('flowist_stripe_subscribed', 'true'); } catch {}
          try { localStorage.setItem('flowist_trial_used', 'true'); } catch {}
          if (data.plan_type) {
            (window as any).__stripePlanType = data.plan_type;
          }
          window.dispatchEvent(new Event('stripeSubscriptionRestored'));
          closePaywall();
        } else {
          setAdminError(t('onboarding.paywall.noActivePurchases'));
          setTimeout(() => setAdminError(''), 4000);
        }
      }
    } catch (error: any) {
      console.error('Restore failed:', error);
      setAdminError(error?.message || 'Restore failed.');
      setTimeout(() => setAdminError(''), 4000);
    } finally {
      setIsRestoring(false);
    }
  };

  // Soft-limit info derived from paywallFeature like "soft_limit_notes" / "soft_limit_tasks"
  // Single source of truth: SOFT_FREE_LIMITS in SubscriptionContext.
  const softLimitKind = paywallFeature?.startsWith('soft_limit_') ? paywallFeature.replace('soft_limit_', '') : null;
  const softLimitCount = softLimitKind && (SOFT_FREE_LIMITS as Record<string, number>)[softLimitKind];
  const softLimitMessage = softLimitKind && softLimitCount != null
    ? t(`onboarding.paywall.softLimit.${softLimitKind}`, { count: softLimitCount })
    : null;

  // Capacity-limit info derived from paywallFeature like "capacity_habits".
  // Single source of truth: FREE_CAPACITY_LIMITS + CAPACITY_LABELS in SubscriptionContext.
  const capacityKind = paywallFeature?.startsWith('capacity_') ? paywallFeature.replace('capacity_', '') : null;
  const capacityInfo = capacityKind && (FREE_CAPACITY_LIMITS as Record<string, number>)[capacityKind] != null
    ? {
        label: CAPACITY_LABELS[capacityKind as keyof typeof CAPACITY_LABELS]?.label ?? capacityKind,
        limit: (FREE_CAPACITY_LIMITS as Record<string, number>)[capacityKind],
        scope: (() => {
          const s = CAPACITY_LABELS[capacityKind as keyof typeof CAPACITY_LABELS]?.scope ?? '';
          return s && s !== 'total' ? ` ${s}` : '';
        })(),
      }
    : null;

  // Pro-feature dynamic message map
  const PRO_FEATURE_MESSAGES: Record<string, string> = {
    pro: 'Premium unlocks every advanced tool and higher free-plan limit.',
    daily_free_reminder: 'Upgrade to Premium for unlimited access across notes, tasks, habits, and tools.',
    onboarding_skip: 'Upgrade to Premium to start with every advanced feature unlocked.',
    onboarding_complete: 'Upgrade to Premium to keep building without limits.',
    linkedin_formatter: 'LinkedIn Text Formatter is a Premium feature. Upgrade to unlock polished posts.',
    note_templates: 'Note Templates are a Premium feature. Upgrade to save time with templates.',
    app_lock: 'App Lock is a Premium feature. Upgrade to protect your workspace.',
    notes_type_visibility: 'Note Type Visibility is a Premium feature. Upgrade to customize your notes.',
    notes_settings: 'Advanced Notes Settings are Premium. Upgrade to customize your editor.',
    tasks_settings: 'Advanced Tasks Settings are Premium. Upgrade to customize task defaults.',
    quick_add: 'Quick Add is a Premium feature. Upgrade to capture faster.',
    multiple_tasks: 'Adding multiple tasks at once is Premium. Upgrade to batch-create tasks.',
    location_reminders: 'Location Reminders are Premium. Upgrade to unlock smart reminders.',
    task_status: 'Task Status is a Premium feature. Upgrade to track work more clearly.',
    view_mode_status_board: 'Status Board view is Premium. Upgrade to unlock advanced task layouts.',
    view_mode_timeline: 'Timeline view is Premium. Upgrade to unlock advanced task layouts.',
    view_mode_progress: 'Progress view is Premium. Upgrade to see deeper progress tracking.',
    view_mode_priority: 'Priority Board view is Premium. Upgrade to unlock advanced task layouts.',
    view_mode_history: 'History view is Premium. Upgrade to unlock task history.',
    dark_mode: 'Dark Mode customization is Premium. Upgrade to unlock more themes.',
    smart_lists: 'Smart Lists are Premium. Upgrade to unlock advanced task filtering.',
    time_tracking: 'Time Tracking is Premium. Upgrade to track time on tasks and notes.',
    extract_features: 'Extract features are Premium. Upgrade to extract tasks and notes faster.',
    backup: 'Backup is Premium. Upgrade to protect and export your data.',
    deadline_escalation: 'Deadline Escalation is Premium. Upgrade to unlock stronger reminders.',
    deadline: 'Deadlines are Premium. Upgrade to plan tasks with deadlines.',
    pin_feature: 'Pinning is Premium. Upgrade to keep important items on top.',
    extra_folders: 'Extra folders are Premium. Upgrade for more organization.',
    extra_sections: 'Extra sections are Premium. Upgrade for more task structure.',
    file_attachments: 'File attachments are Premium. Upgrade to attach files to tasks.',
    customize_navigation: 'Customize Navigation is Premium. Upgrade to personalize the app.',
    sketch_collab: 'Sketch collaboration is Premium. Upgrade to collaborate on sketches.',
    urgent_reminder: 'Urgent reminders are Premium. Upgrade to unlock stronger reminders.',
    team_collaboration: 'Team collaboration is Premium. Upgrade to work with others.',
    ai_dictation: 'AI Dictation is Premium. Upgrade to capture notes and tasks with AI.',
    pomodoro: 'Pomodoro Timer is a Pro feature. Upgrade to unlock.',
    reading_mode: 'Reading Mode is a Pro feature. Upgrade to unlock.',
    image_attachment: 'Image attachments are a Pro feature. Upgrade to attach images.',
    extract_tasks_image: 'Extracting tasks from images is a Pro feature.',
    extract_tasks_text: 'Extracting tasks from text is a Pro feature.',
    extract_note_image: 'Extracting notes from images is a Pro feature.',
    extract_pdf: 'PDF extract is a Pro feature.',
    block_image: 'Image block is a Pro feature.',
    block_file: 'File block is a Pro feature.',
    block_template: 'Template block is a Pro feature.',
    block_toggle: 'Toggle block is a Pro feature.',
    block_callout: 'Callout block is a Pro feature.',
    batch_section: 'Batch Section is a Pro feature.',
    batch_priority: 'Batch Priority is a Pro feature.',
    batch_folder: 'Batch Folder is a Pro feature.',
    batch_due_date: 'Batch Due Date is a Pro feature.',
    batch_status: 'Batch Status change is a Pro feature.',
    dark_theme_extra: 'Extra dark themes are a Pro feature.',
    calendar_view_week: 'Week view is a Pro feature.',
    calendar_view_day: 'Day view is a Pro feature.',
    calendar_view_agenda: 'Agenda view is a Pro feature.',
    calendar_view_year: 'Year view is a Pro feature.',
    calendar_view_3day: '3-Day view is a Pro feature.',
    smart_list_pro: 'Advanced Smart Lists are a Pro feature.',
    notes_settings_advanced: 'This advanced notes setting is Pro.',
    tasks_default_advanced: 'This advanced tasks setting is Pro.',
    note_type_visibility_advanced: 'Hiding more note types is a Pro feature.',
    widget_section_tasks: 'Section Tasks widget is a Premium feature. Free plan includes the Notes widget only.',
  };
  const genericFeatureMessage = paywallFeature && !paywallFeature.startsWith('capacity_') && !paywallFeature.startsWith('soft_limit_')
    ? `${paywallFeature.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())} is a Premium feature. Upgrade to unlock.`
    : null;
  const proFeatureMessage = paywallFeature && PRO_FEATURE_MESSAGES[paywallFeature]
    ? PRO_FEATURE_MESSAGES[paywallFeature]
    : genericFeatureMessage;

  const capacityMessage = capacityInfo
    ? `You've reached the Free plan limit of ${capacityInfo.limit} ${capacityInfo.label}${capacityInfo.scope}. Upgrade to Premium for unlimited.`
    : proFeatureMessage;

  // Lifetime usage counts for the always-on usage banner.
  const [usageCounts] = useState(() => ({
    notes: getLocalLifetimeMax('notes'),
    tasks: getLocalLifetimeMax('tasks'),
  }));
  const usageBanner = (usageCounts.notes > 0 || usageCounts.tasks > 0)
    ? t('paywall.usageBanner', "You've created {{notes}} notes & {{tasks}} tasks. Unlock unlimited.", {
        notes: usageCounts.notes,
        tasks: usageCounts.tasks,
      })
    : null;
  const trialExpiredMessage = paywallFeature === 'trial_expired'
    ? t('paywall.trialExpired', 'Your 3-day free trial has ended. Unlock unlimited to keep creating.')
    : null;

  return {
    t, showPaywall, closePaywall, isNewFreeUser, isPro, selectedPlan, setSelectedPlan, isPurchasing, isRestoring,
    adminError,
    PLANS, currentPlan, handlePurchase, handleRestore, hasUsedTrial,
    restoreEmail, setRestoreEmail, showRestoreEmail, softLimitMessage,
    usageBanner, trialExpiredMessage, capacityMessage: capacityMessage || softLimitMessage || trialExpiredMessage || proFeatureMessage,
  };
}


// Footer: Restore + legal links (shared across variants)
function PaywallFooter({ logic }: { logic: ReturnType<typeof usePaywallLogic> }) {
  const { t, isRestoring, handleRestore, adminError, restoreEmail, setRestoreEmail, showRestoreEmail } = logic;
  return (
    <div className="flex flex-col items-center gap-2 mt-3">
      {adminError && <p className="text-xs" style={{ color: 'hsl(0 84.2% 60.2%)' }}>{adminError}</p>}
      {showRestoreEmail && (
        <div className="flex items-center gap-2 mt-1">
          <input type="email" value={restoreEmail} onChange={(e) => setRestoreEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleRestore()}
            placeholder="Enter subscription email" autoComplete="email"
            className="h-8 w-48 rounded-md px-2 text-sm" style={{ border: '1px solid hsl(0 0% 89.8%)', background: 'hsl(0 0% 100%)', color: 'hsl(0 0% 3.9%)' }} />
          <button onClick={handleRestore} disabled={isRestoring} className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium">
            {isRestoring ? '...' : 'Check'}
          </button>
        </div>
      )}
      <div className="flex items-center gap-3">
        <button onClick={handleRestore} disabled={isRestoring} className="text-xs underline disabled:opacity-50" style={{ color: 'hsl(0 0% 45.1%)' }}>
          {isRestoring ? t('onboarding.paywall.restoring') : t('onboarding.paywall.restorePurchase')}
        </button>
      </div>
      <div className="flex items-center gap-3 mt-3">
        <a
          href="https://www.flowist.me/terms-and-conditions"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] underline"
          style={{ color: 'hsl(0 0% 45.1%)' }}
        >
          {t('paywall.terms', 'Terms & Conditions')}
        </a>
        <span className="text-[11px]" style={{ color: 'hsl(0 0% 45.1%)' }}>•</span>
        <a
          href="https://www.flowist.me/privacy-policy"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] underline"
          style={{ color: 'hsl(0 0% 45.1%)' }}
        >
          {t('paywall.privacy', 'Privacy Policy')}
        </a>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   Paywall — Black & Blue (#3c78f0)
   ═══════════════════════════════════════════ */
const PRO_BLUE = '#3c78f0';

const FEATURE_ROWS: { label: string; free: string | 'x' | 'check'; pro: string | 'check' }[] = [
  { label: 'Eisenhower Matrix', free: 'x', pro: 'check' },
  { label: 'Blocks', free: 'x', pro: 'check' },
  { label: 'App Lock', free: 'x', pro: 'check' },
  { label: 'Batch Tasks Add', free: 'x', pro: 'check' },
  { label: 'Countdown Timer', free: 'x', pro: 'check' },
  { label: 'Version History', free: 'x', pro: 'check' },
  { label: 'Reading Mode', free: 'x', pro: 'check' },
  { label: '@ Mention', free: 'x', pro: 'check' },
];

const CAPACITY_ROWS: { label: string; free: string; pro: string }[] = [
  { label: 'Notes', free: '30', pro: 'Unlimited' },
  { label: 'Note Folders', free: '5', pro: 'Unlimited' },
  { label: 'Task Folders', free: '5', pro: 'Unlimited' },
  { label: 'Tasks', free: '38 per folder', pro: 'Unlimited' },
  { label: 'Sections', free: '3 per folder', pro: 'Unlimited' },
  { label: 'Habits', free: '3', pro: 'Unlimited' },
  { label: 'Countdowns', free: '2', pro: 'Unlimited' },
  { label: 'Reminders', free: '1 per task', pro: 'Unlimited' },
  { label: 'Widgets', free: 'Notes only', pro: 'All widgets' },
  { label: 'Attachments', free: '1/day', pro: '200/day' },
  { label: 'Calendar View', free: 'Month only', pro: 'Month/Week/3-Day' },
  { label: 'Themes', free: 'Basic', pro: 'Unlimited' },
];

function Cell({ value, pro }: { value: string; pro?: boolean }) {
  if (value === 'check') {
    return (
      <div className="w-4 h-4 rounded-full flex items-center justify-center mx-auto" style={{ background: PRO_BLUE }}>
        <Check size={9} strokeWidth={3.25} color="#fff" />
      </div>
    );
  }
  if (value === 'x') {
    return <span className="block text-center text-base font-bold" style={{ color: '#5a5a5a' }}>—</span>;
  }
  return (
    <span className="block text-center text-[11.25px] font-semibold whitespace-pre-line leading-tight"
      style={{ color: pro ? PRO_BLUE : '#bdbdbd' }}>
      {value}
    </span>
  );
}

const TABLE_COLS = 'grid-cols-[minmax(0,1.5fr)_minmax(70px,1fr)_minmax(90px,1.2fr)]';

function ComparisonTable({ rows, title, onRowClick }: { rows: { label: string; free: string; pro: string }[]; title?: string; onRowClick?: () => void }) {
  return (
    <div className="w-full">
      {title && (
        <h2 className="text-[15.5px] font-bold mb-1.5 px-1" style={{ color: PRO_BLUE, fontFamily: "'Nunito', sans-serif" }}>{title}</h2>
      )}
      <div className="rounded-xl overflow-hidden w-full" style={{ background: '#161616', border: '1px solid #262626' }}>
        <div className={`grid ${TABLE_COLS} items-center px-2.5 py-2`}>
          <span className="text-[12px] font-bold text-white">Benefits</span>
          <span className="text-center text-[11px] font-semibold inline-flex items-center justify-center gap-1" style={{ color: '#bdbdbd' }}>
            <Crown size={10} color="#bdbdbd" /> Free
          </span>
          <span className="text-center text-[11px] font-semibold inline-flex items-center justify-center gap-1" style={{ color: PRO_BLUE }}>
            <Crown size={10} fill={PRO_BLUE} color={PRO_BLUE} /> Premium
          </span>
        </div>
        {rows.map((row) => (
          <button
            key={row.label}
            type="button"
            onClick={onRowClick}
            className={`w-full grid ${TABLE_COLS} items-center px-2.5 py-2 text-left active:bg-white/[0.04] transition-colors`}
            style={{ borderTop: '1px solid #262626' }}>
            <span className="flex items-center gap-1.5 text-[12px] text-white font-medium leading-snug pr-2">
              <Crown size={10} fill={PRO_BLUE} color={PRO_BLUE} className="flex-shrink-0" />
              <span className="truncate">{row.label}</span>
            </span>
            <div className="flex items-center justify-center"><Cell value={row.free} /></div>
            <div className="flex items-center justify-center"><Cell value={row.pro} pro /></div>
          </button>
        ))}
      </div>
    </div>
  );
}

// Hero — single Premium Crown image (carousel disabled per design).
const HERO_SLIDES = [
  { img: heroCrown, title: 'Upgrade to Flowist Master Plan', subtitle: 'Unlock premium features across all platforms' },
];

const USER_COMMENTS: { tag: string; title: string; body: string }[] = [
  {
    tag: 'Notes & Tasks',
    title: 'Replaced 4 apps in one day',
    body: "I deleted my notepad, to-do app, calendar, and Pomodoro timer after installing Flowist. Everything is in one place, and it works offline. I didn't realize how much app-switching was killing my focus until I stopped doing it.",
  },
  {
    tag: 'Focus Timer',
    title: 'Finally finishing what I start',
    body: 'The Pomodoro timer changed how I study. I sit down, start a session, and actually finish my work. The session history shows me exactly how many productive hours I put in, which is weirdly motivating. Worth it just for this feature alone.',
  },
  {
    tag: 'Privacy',
    title: 'No account. No cloud. Just works.',
    body: "I've tried every productivity app and they all want my email, cloud sync, and a monthly subscription before I can even make a note. Flowist just opens and works. My data stays on my phone. That alone made me a loyal user.",
  },
  {
    tag: 'Students',
    title: 'My entire semester lives here',
    body: 'Lecture notes, assignment deadlines, exam countdowns, habit streaks, Flowist holds all of it. I used to have a separate app for each. Now I open one app in the morning and I know exactly what my day looks like.',
  },
];

function Stars() {
  return (
    <span className="inline-flex items-center gap-[2px]" aria-label="5 out of 5 stars">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} width="12" height="12" viewBox="0 0 24 24" fill="#f5a524">
          <path d="M12 2l2.9 6.9 7.1.6-5.4 4.7 1.7 7-6.3-3.8L5.7 21l1.7-7L2 9.5l7.1-.6L12 2z" />
        </svg>
      ))}
    </span>
  );
}

function UserComments() {
  return (
    <div className="mt-6">
      <h2 className="text-[15.5px] font-bold mb-2 px-1" style={{ color: PRO_BLUE, fontFamily: "'Nunito', sans-serif" }}>
        User Comments
      </h2>
      <div className="flex flex-col gap-2.5">
        {USER_COMMENTS.map((c) => (
          <div key={c.title} className="rounded-xl px-3.5 py-3" style={{ background: '#161616', border: '1px solid #262626' }}>
            <span className="inline-block text-[10.5px] font-semibold px-2 py-[2px] rounded-full mb-2"
              style={{ background: `${PRO_BLUE}22`, color: PRO_BLUE }}>
              {c.tag}
            </span>
            <div className="flex items-start justify-between gap-3 mb-1.5">
              <h3 className="text-[13.5px] font-bold text-white leading-snug">{c.title}</h3>
              <Stars />
            </div>
            <p className="text-[12.25px] leading-relaxed" style={{ color: '#c9c9c9' }}>{c.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}


function PaywallScreen({ logic }: { logic: ReturnType<typeof usePaywallLogic> }) {
  const { t, selectedPlan, setSelectedPlan, isPurchasing, PLANS, currentPlan, handlePurchase, hasUsedTrial, closePaywall, handleRestore, isRestoring, adminError, capacityMessage } = logic;

  const current = HERO_SLIDES[0];

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const previousHtmlOverflow = html.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyPointer = body.style.pointerEvents;
    html.style.overflow = 'hidden';

    // Defeat Radix Dialog/Sheet scroll-lock & pointer-events lockdown that
    // can leave the paywall un-scrollable when it opens from inside an open
    // Sheet/Dialog. Re-apply on every DOM mutation while the paywall is up.
    const neutralize = () => {
      if (body.style.pointerEvents === 'none') body.style.pointerEvents = '';
      if (body.hasAttribute('data-scroll-locked')) body.removeAttribute('data-scroll-locked');
      // Radix also sets these inline when it locks scroll
      body.style.removeProperty('margin-right');
      body.style.removeProperty('overflow');
    };
    neutralize();
    const observer = new MutationObserver(neutralize);
    observer.observe(body, { attributes: true, attributeFilter: ['style', 'data-scroll-locked'] });

    return () => {
      observer.disconnect();
      html.style.overflow = previousHtmlOverflow;
      body.removeAttribute('data-scroll-locked');
      body.style.removeProperty('margin-right');
      if (previousBodyOverflow && previousBodyOverflow !== 'hidden') body.style.overflow = previousBodyOverflow;
      else body.style.removeProperty('overflow');
      if (previousBodyPointer && previousBodyPointer !== 'none') body.style.pointerEvents = previousBodyPointer;
      else body.style.removeProperty('pointer-events');
    };
  }, []);

  return createPortal((
    <div className="fixed inset-0 z-[2147483646] flex flex-col overflow-hidden"
      style={{
        background: '#000',
        color: '#fff',
        fontFamily: "'Nunito Sans', sans-serif",
        height: '100dvh',
        maxHeight: '100dvh',
        touchAction: 'auto',
        pointerEvents: 'auto',
      }}>
      <div className="flex-1 min-h-0 overflow-y-scroll overscroll-contain"
        style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch', touchAction: 'pan-y', pointerEvents: 'auto', paddingBottom: 'calc(170px + var(--safe-bottom, 0px))' }}>


        {/* Hero — compact single image (no carousel) */}
        <div
          className="relative w-full overflow-hidden select-none"
          style={{ aspectRatio: '16 / 10', background: '#05060c' }}
        >
          <img src={current.img} alt="" draggable={false} decoding="async" fetchPriority="high" loading="eager" width={800} height={500} className="w-full h-full object-contain pointer-events-none" style={{ padding: '8px 0 4px', contentVisibility: 'auto' }} />
          <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 60%, rgba(0,0,0,0.95) 100%)' }} />

          {/* Back button overlay */}
          <button onClick={closePaywall} aria-label="Close"
            className="absolute z-20 h-11 w-11 rounded-full flex items-center justify-center active:scale-95"
            style={{
              top: 'calc(var(--safe-top, 0px) + 8px)',
              left: 10,
              background: 'rgba(0,0,0,0.55)',
              color: '#fff',
              backdropFilter: 'blur(8px)',
            }}>
            <X size={26} strokeWidth={2.75} />
          </button>

          {/* Title overlay bottom-left — nudged down so the king/throne is fully visible */}
          <div className="absolute left-0 right-0 bottom-0 px-4 pb-1.5 text-left z-20 pointer-events-none">
            <h2 className="text-[19px] leading-tight font-black tracking-tight text-white drop-shadow-lg" style={{ fontFamily: "'Nunito', sans-serif" }}>{current.title}</h2>
            <p className="text-[11.5px] text-white/80 mt-0.5 drop-shadow">{current.subtitle}</p>
          </div>
        </div>


        {/* Premium Benefits — pulled up close under the hero */}
        <div className="px-3 pt-4 pb-4">
          <h2 className="text-[15.5px] font-bold mb-1.5 px-1" style={{ color: PRO_BLUE, fontFamily: "'Nunito', sans-serif" }}>
            Premium Benefits
          </h2>
          {capacityMessage && (
            <div className="mb-3 rounded-xl px-3.5 py-2.5 flex items-start gap-2"
              style={{ background: `${PRO_BLUE}1f`, border: `1px solid ${PRO_BLUE}66` }}>
              <Crown size={16} color={PRO_BLUE} className="mt-0.5 flex-shrink-0" />
              <p className="text-[13px] font-semibold leading-snug" style={{ color: '#fff' }}>{capacityMessage}</p>
            </div>
          )}
          <ComparisonTable rows={FEATURE_ROWS as any} onRowClick={() => triggerTripleHeavyHaptic()} />

          <div className="mt-6">
            <ComparisonTable rows={CAPACITY_ROWS} title="10x Capacity" onRowClick={() => triggerTripleHeavyHaptic()} />
          </div>

          <UserComments />



        <h2 className="text-[17px] font-bold mb-2 mt-6" style={{ color: PRO_BLUE, fontFamily: "'Nunito', sans-serif" }}>
          Select Your Plan
        </h2>
        <div className="grid grid-cols-3 gap-2">
          {PLANS.map((plan) => {
            const active = selectedPlan === plan.id;
            return (
              <button key={plan.id} onClick={() => { triggerTripleHeavyHaptic(); setSelectedPlan(plan.id); }}
                className="relative rounded-xl p-2.5 text-center transition-all"
                style={{
                  background: active ? `${PRO_BLUE}1a` : '#141414',
                  border: `1.5px solid ${active ? PRO_BLUE : '#262626'}`,
                }}>
                {plan.badgeKey && (
                  <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[8.5px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap"
                    style={{ background: PRO_BLUE, color: '#fff' }}>
                    {t(plan.badgeKey)}
                  </span>
                )}
                <p className="text-[12px] font-bold text-white">{t(plan.labelKey)}</p>
                <p className="text-[10.5px] mt-0.5" style={{ color: active ? PRO_BLUE : '#9a9a9a' }}>{plan.price}</p>
                {active && (
                  <div className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center" style={{ background: PRO_BLUE }}>
                    <Check size={9} color="#fff" />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {(!hasUsedTrial && currentPlan.hasTrial) && (() => {
          const trialEnd = new Date();
          trialEnd.setDate(trialEnd.getDate() + 3);
          const endStr = trialEnd.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
          const period = currentPlan.labelKey.includes('yearly') ? 'yearly' : currentPlan.labelKey.includes('monthly') ? 'monthly' : 'weekly';
          const platform = Capacitor.getPlatform(); // 'ios' | 'android' | 'web'
          const isIOS = platform === 'ios';
          const storeName = isIOS ? 'App Store (Apple ID)' : 'Google Play';
          return (
            <div className="mt-4 rounded-xl p-3.5" style={{ background: '#111', border: `1px solid ${PRO_BLUE}55` }}>
              <p className="text-[12.5px] font-bold mb-2" style={{ color: PRO_BLUE }}>
                Free trial terms
              </p>
              <ul className="space-y-1.5 text-[11.5px] leading-snug" style={{ color: '#cfcfcf' }}>
                <li>• 3-day free trial — you pay <span className="font-bold text-white">$0.00 today</span>.</li>
                <li>• Trial ends on <span className="font-bold text-white">{endStr}</span>. After the trial, your {period} subscription auto-renews at <span className="font-bold text-white">{currentPlan.price}</span> (renewal amount: <span className="font-bold text-white">{currentPlan.price}</span>) until cancelled.</li>
                <li>• Payment is charged to your {storeName} account on the renewal date. Prices may vary by country and applicable taxes. No cancellation fee.</li>
              </ul>

              <p className="text-[12px] font-bold mt-3 mb-1.5" style={{ color: PRO_BLUE }}>
                How to cancel your free trial ({isIOS ? 'App Store' : 'Google Play'})
              </p>
              {isIOS ? (
                <ol className="space-y-1 text-[11.5px] leading-snug list-decimal pl-4" style={{ color: '#cfcfcf' }}>
                  <li>Open the <span className="font-semibold text-white">Settings</span> app on your iPhone or iPad.</li>
                  <li>Tap your <span className="font-semibold text-white">name</span> (top) → <span className="font-semibold text-white">Subscriptions</span>.</li>
                  <li>Select <span className="font-semibold text-white">Flowist</span> from the list of active subscriptions.</li>
                  <li>Tap <span className="font-semibold text-white">Cancel Subscription</span> (or <span className="font-semibold text-white">Cancel Free Trial</span>) and confirm.</li>
                  <li>Cancel <span className="font-bold text-white">at least 24 hours before {endStr}</span> to avoid being charged. You'll keep Premium access until the trial ends.</li>
                </ol>
              ) : (
                <ol className="space-y-1 text-[11.5px] leading-snug list-decimal pl-4" style={{ color: '#cfcfcf' }}>
                  <li>Open the <span className="font-semibold text-white">Google Play Store</span> app on the device used to subscribe.</li>
                  <li>Tap your <span className="font-semibold text-white">profile icon</span> (top-right) → <span className="font-semibold text-white">Payments &amp; subscriptions</span> → <span className="font-semibold text-white">Subscriptions</span>.</li>
                  <li>Select <span className="font-semibold text-white">Flowist</span> from the list of subscriptions.</li>
                  <li>Tap <span className="font-semibold text-white">Cancel subscription</span> and confirm.</li>
                  <li>Cancel <span className="font-bold text-white">at least 24 hours before {endStr}</span> to avoid being charged. You'll keep Premium access until the trial ends.</li>
                </ol>
              )}
            </div>
          );
        })()}

        <div className="mt-5 flex flex-col items-center gap-2">
          <button onClick={handleRestore} disabled={isRestoring}
            className="w-full rounded-xl py-2.5 text-[13px] font-semibold active:opacity-80"
            style={{ background: 'transparent', border: `1.5px solid ${PRO_BLUE}`, color: PRO_BLUE }}>
            {isRestoring ? t('onboarding.paywall.restoring') : 'Restore'}
          </button>
          <button className="text-[12px]" style={{ color: '#9a9a9a' }}>Order History</button>
        </div>

        {adminError && <p className="text-xs text-center mt-3" style={{ color: '#f87171' }}>{adminError}</p>}

          <div className="flex items-center gap-3 justify-center mt-5">
            <a href="https://www.flowist.me/terms-and-conditions" target="_blank" rel="noopener noreferrer"
              className="text-[10.5px] underline" style={{ color: '#777' }}>
              {t('paywall.terms', 'Terms & Conditions')}
            </a>
            <span className="text-[10.5px]" style={{ color: '#555' }}>•</span>
            <a href="https://www.flowist.me/privacy-policy" target="_blank" rel="noopener noreferrer"
              className="text-[10.5px] underline" style={{ color: '#777' }}>
              {t('paywall.privacy', 'Privacy Policy')}
            </a>
          </div>
          <p className="text-center text-[11px] font-semibold mt-2" style={{ color: '#9a9a9a' }}>
            No Commitment, Cancel Anytime
          </p>
        </div>

      </div>

      {/* Sticky bottom CTA */}
      <div className="absolute left-0 right-0 px-4 pt-3 pointer-events-auto"
        style={{
          bottom: 'max(var(--safe-bottom, 0px), 10px)',
          background: 'linear-gradient(to top, #000 70%, rgba(0,0,0,0))',
        }}>
          {(() => {
            const trialEnd = new Date();
            trialEnd.setDate(trialEnd.getDate() + 3);
            const endStr = trialEnd.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
            return (
              <>
                <button onClick={() => { triggerTripleHeavyHaptic(); handlePurchase(); }} disabled={isPurchasing}
                  className="w-full rounded-xl py-3 text-[14px] font-bold active:scale-[0.99] transition disabled:opacity-50"
                  style={{ background: PRO_BLUE, color: '#fff', boxShadow: `0 6px 20px ${PRO_BLUE}55` }}>
                  {isPurchasing
                    ? t('onboarding.paywall.processing')
                    : `Try for $0.00 Today`}
                </button>
                <p className="text-[10.5px] leading-snug text-center mt-1.5 px-2 font-semibold" style={{ color: '#cfcfcf' }}>
                  {(!hasUsedTrial && currentPlan.hasTrial)
                    ? <>3-day free trial, then renews at <span className="text-white font-bold">{currentPlan.price}</span> on <span className="text-white font-bold">{endStr}</span> until cancelled.</>
                    : <>Renews at <span className="text-white font-bold">{currentPlan.price}</span> until cancelled.</>}
                </p>
                <p className="text-[9.5px] leading-snug text-center mt-1 px-2" style={{ color: '#9a9a9a' }}>
                  {(!hasUsedTrial && currentPlan.hasTrial)
                    ? `Cancel anytime in Google Play → Profile → Payments & subscriptions → Subscriptions → Flowist → Cancel subscription, at least 24h before ${endStr} to avoid charges.`
                    : `Cancel anytime in Google Play → Profile → Payments & subscriptions → Subscriptions → Flowist → Cancel subscription.`}
                </p>
              </>
            );
          })()}


      </div>
    </div>
  ), document.body);
}

/* ═══════════════════════════════════════════
   MAIN EXPORT
   ═══════════════════════════════════════════ */
export const PremiumPaywall = () => {
  const logic = usePaywallLogic();
  if (!logic.showPaywall) return null;
  return <PaywallScreen logic={logic} />;
};
