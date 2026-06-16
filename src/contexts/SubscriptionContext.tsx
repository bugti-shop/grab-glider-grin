import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { getSetting, setSetting } from '@/utils/settingsStorage';
import { getStoredGoogleUser } from '@/utils/googleAuth';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/lib/supabase';
import {
  getLocalLifetimeMax,
  setLocalLifetimeMax,
  pushLifetimeCounter,
  pullAndMergeLifetimeCounters,
  resetAllLifetimeCounters,
} from '@/utils/lifetimeCountersCloud';
import { initOrCheckTrial, isTrialActive as isDeviceTrialActiveFn } from '@/utils/deviceTrial';
import {
  Purchases,
  LOG_LEVEL,
  CustomerInfo,
  PurchasesOfferings,
  PurchasesPackage,
  PACKAGE_TYPE,
  PAYWALL_RESULT,
  PurchasesCallbackId
} from '@revenuecat/purchases-capacitor';
// RevenueCatUI removed for Capacitor v5 compatibility (no v5 of purchases-capacitor-ui exists).
// The app uses its own PremiumPaywall component instead.

// RevenueCat API Key - This is a public key safe to include in the app
// Platform-specific RevenueCat API keys.
// iOS keys MUST start with `appl_` — passing a `goog_` key to the iOS SDK
// triggers a native fatalError that crashes the WebView (black screen on launch).
const REVENUECAT_API_KEY_ANDROID = 'goog_WLSvWlyHHLzNAgIfhCzAYsGaZyh';
const REVENUECAT_API_KEY_IOS = 'appl_UAIbyOGOGMDtOQNzzaZjGFPfJDR';
const REVENUECAT_API_KEY =
  Capacitor.getPlatform() === 'ios' ? REVENUECAT_API_KEY_IOS : REVENUECAT_API_KEY_ANDROID;

// Entitlement identifier
const ENTITLEMENT_ID = 'Pro';

// Product identifiers — platform-aware (iOS uses App Store IDs; Android uses Play base:offer IDs)
const IS_IOS = Capacitor.getPlatform() === 'ios';
const PRODUCT_IDS: { weekly: string; monthly: string; yearly: string } = IS_IOS
  ? {
      weekly: 'com.flowist.app.week',
      monthly: 'com.flowist.app.month',
      yearly: 'com.flowist.app.year',
    }
  : {
      weekly: 'nnppd_weekly:nnnpd-weekly',
      monthly: 'npd_mo:npd-mo',
      yearly: 'npd_yr:npd-yearly-plan',
    };

export type ProductType = 'weekly' | 'monthly' | 'yearly';

// Free trial offer IDs (base plan:offer)
const TRIAL_OFFER_IDS: Partial<Record<ProductType, string>> = {
  monthly: 'npd-monthly-offer',
  yearly: 'npd-yearly-trial',
};

export type SubscriptionTier = 'free' | 'premium';
export type SubscriptionPlanType = 'none' | 'weekly' | 'monthly' | 'yearly';

// All premium features list
export const PREMIUM_FEATURES = [
  'linkedin_formatter',
  'note_templates',
  'app_lock',
  'notes_type_visibility',
  'notes_settings',
  'tasks_settings',
  'quick_add',
  'multiple_tasks',
  'location_reminders',
  'task_status',
  'view_mode_status_board',
  'view_mode_timeline',
  'view_mode_progress',
  'view_mode_priority',
  'view_mode_history',
  'dark_mode',
  'smart_lists',
  'time_tracking',
  'extract_features',
  'backup',
  'deadline_escalation',
  'deadline',
  'pin_feature',
  'extra_folders',
  'extra_sections',
  'file_attachments',
  'customize_navigation',
  'sketch',
  'sketch_collab',
  'urgent_reminder',
  'team_collaboration',
  'ai_dictation',
] as const;

// No features are restricted to specific plan types - all premium features available to all plans
export const RECURRING_ONLY_FEATURES: readonly PremiumFeature[] = [] as const;

export type PremiumFeature = typeof PREMIUM_FEATURES[number];

// Hard limits (legacy — kept Infinity so non-soft paths stay open)
export const FREE_LIMITS = {
  maxNoteFolders: Infinity,
  maxTaskFolders: Infinity,
  maxTaskSections: Infinity,
  maxNotes: Infinity,
};

// Free user lifetime limits — applies to ALL free users (not just brand-new).
// These are LIFETIME counts: deleting items does NOT free up quota. User must upgrade to Pro.
export const SOFT_FREE_LIMITS = {
  notes: 50,
  tasks: 891,
  noteFolders: 9,
  taskFolders: 9,
  taskSections: 10,
} as const;

export type SoftLimitKind = keyof typeof SOFT_FREE_LIMITS;

// === Free Plan Capacity Limits (current-count based; delete frees up) ===
// These complement SOFT_FREE_LIMITS and are checked at create time using the
// CURRENT count for the relevant scope (per folder / per task / per day / global).
export const FREE_CAPACITY_LIMITS = {
  habits: 5,                      // global
  noteFolders: 9,                 // global
  taskFolders: 9,                 // global
  notes: 50,                      // global
  tags: 20,                       // global
  countdowns: 5,                  // global
  sectionsPerFolder: 10,          // per task folder
  tasksPerFolder: 99,             // per task folder
  subtasksPerTask: 19,            // per task
  remindersPerTask: 2,            // per task
  attachmentsPerDay: 1,           // per calendar day
  darkThemes: 1,                  // only 1 dark theme free
  eisenhowerTasksPerQuadrant: 10, // per quadrant
  smartListsCustom: 2,            // saved custom smart views
  blocksAdvancedPerNote: 3,       // per note (image/file/toggle/callout/template)
  calendarViews: 1,               // only "month"
} as const;

export type CapacityKind = keyof typeof FREE_CAPACITY_LIMITS;

// Human-readable labels + scope strings used in the dynamic paywall message.
export const CAPACITY_LABELS: Record<CapacityKind, { label: string; scope: string }> = {
  habits:             { label: 'Habits',        scope: 'total' },
  noteFolders:        { label: 'Note Folders',  scope: 'total' },
  taskFolders:        { label: 'Task Folders',  scope: 'total' },
  notes:              { label: 'Notes',         scope: 'total' },
  tags:               { label: 'Tags',          scope: 'total' },
  countdowns:         { label: 'Countdowns',    scope: 'total' },
  sectionsPerFolder:  { label: 'Sections',      scope: 'per folder' },
  tasksPerFolder:     { label: 'Tasks',         scope: 'per folder' },
  subtasksPerTask:    { label: 'Subtasks',      scope: 'per task' },
  remindersPerTask:   { label: 'Reminders',     scope: 'per task' },
  attachmentsPerDay:  { label: 'Attachments',   scope: 'per day' },
  darkThemes:         { label: 'Dark Themes',   scope: 'total' },
  eisenhowerTasksPerQuadrant: { label: 'Matrix Tasks', scope: 'per quadrant' },
  smartListsCustom:   { label: 'Custom Smart Lists', scope: 'total' },
  blocksAdvancedPerNote: { label: 'Advanced Blocks', scope: 'per note' },
  calendarViews:      { label: 'Calendar Views', scope: 'total' },
};

// Pro-only feature keys used with requirePro(feature). Free message map lives in PremiumPaywall.
export const PRO_FEATURE_LABELS: Record<string, string> = {
  pomodoro: 'Pomodoro Timer is a Pro feature',
  reading_mode: 'Reading Mode is a Pro feature',
  image_attachment: 'Image attachments are a Pro feature',
  extract_tasks_image: 'Extract tasks from image is a Pro feature',
  extract_tasks_text: 'Extract tasks from text is a Pro feature',
  extract_note_image: 'Extract note from image is a Pro feature',
  extract_pdf: 'PDF extract is a Pro feature',
  block_image: 'Image block is a Pro feature',
  block_file: 'File block is a Pro feature',
  block_template: 'Template block is a Pro feature',
  block_toggle: 'Toggle block is a Pro feature',
  block_callout: 'Callout block is a Pro feature',
  batch_section: 'Batch Section is a Pro feature',
  batch_priority: 'Batch Priority is a Pro feature',
  batch_folder: 'Batch Folder is a Pro feature',
  batch_due_date: 'Batch Due Date is a Pro feature',
  batch_status: 'Batch Status change is a Pro feature',
  dark_theme_extra: 'Extra dark themes are a Pro feature',
  calendar_view_week: 'Week view is a Pro feature',
  calendar_view_day: 'Day view is a Pro feature',
  calendar_view_agenda: 'Agenda view is a Pro feature',
  calendar_view_year: 'Year view is a Pro feature',
  calendar_view_3day: '3-Day view is a Pro feature',
  smart_list_pro: 'Advanced Smart Lists are a Pro feature',
  notes_settings_advanced: 'This advanced notes setting is Pro',
  tasks_default_advanced: 'This advanced tasks setting is Pro',
  note_type_visibility_advanced: 'Hiding more note types is a Pro feature',
};


interface UnifiedBillingContextType {
  // Subscription state
  tier: SubscriptionTier;
  planType: SubscriptionPlanType;
  isPro: boolean;
  isRecurringSubscriber: boolean;
  isLoading: boolean;
  isLocalTrial: boolean;
  localTrialExpired: boolean;
  graceExpired: boolean;
  /** True when the user unlocked Pro via the BUGTI admin access code. */
  isAdminBypass: boolean;
  /** True when RevenueCat reports the active entitlement is in its free-trial period (Android/iOS native trial — card on file). */
  isRevenueCatTrial: boolean;
  checkStripeByEmail: (email: string) => Promise<boolean>;
  
  // Feature gating
  showPaywall: boolean;
  isVerifyingCheckout: boolean;
  checkoutVerificationFailed: boolean;
  paywallFeature: string | null;
  openPaywall: (feature?: string, options?: { daily?: boolean }) => void;
  closePaywall: () => void;
  canUseFeature: (feature: PremiumFeature) => boolean;
  requireFeature: (feature: PremiumFeature) => boolean;
  unlockPro: () => Promise<void>;

  // Soft paywall (new-user teaser mode)
  isNewFreeUser: boolean;
  markAsNewFreeUser: () => Promise<void>;
  canCreateWithinSoftLimit: (kind: SoftLimitKind, currentCount: number) => boolean;
  softRequireCreate: (kind: SoftLimitKind, currentCount: number) => boolean;
  softRequireMutate: () => boolean;

  // Current-count capacity gating (Free plan limits — delete frees up).
  capacityLimit: (kind: CapacityKind) => number;
  hasCapacity: (kind: CapacityKind, currentCount: number) => boolean;
  requireCapacity: (kind: CapacityKind, currentCount: number) => boolean;
  requireProFeature: (feature: string) => boolean;


  // RevenueCat state
  isInitialized: boolean;
  customerInfo: CustomerInfo | null;
  offerings: PurchasesOfferings | null;
  error: string | null;

  // RevenueCat actions
  initialize: (appUserID?: string) => Promise<void>;
  checkEntitlement: () => Promise<boolean>;
  getOfferings: () => Promise<PurchasesOfferings | null>;
  purchase: (productType: ProductType) => Promise<boolean>;
  purchasePackage: (pkg: PurchasesPackage) => Promise<boolean>;
  restorePurchases: () => Promise<boolean>;
  presentPaywall: () => Promise<PAYWALL_RESULT>;
  presentPaywallIfNeeded: () => Promise<PAYWALL_RESULT>;
  presentCustomerCenter: () => Promise<void>;
  logout: () => Promise<void>;
}

const UnifiedBillingContext = createContext<UnifiedBillingContextType | undefined>(undefined);

// Free trial duration in days (device-locked, server-backed, cross-platform)
const DAILY_PAYWALL_DATE_KEY = 'flowist_paywall_last_shown_date';
const SIGNOUT_GRACE_MS = 24 * 60 * 60 * 1000; // 1 day after sign-out

const getTodayKey = () => new Date().toISOString().slice(0, 10);

const canShowAutomaticPaywallToday = (): boolean => {
  try {
    return localStorage.getItem(DAILY_PAYWALL_DATE_KEY) !== getTodayKey();
  } catch {
    return true;
  }
};

const markPaywallShownToday = () => {
  try { localStorage.setItem(DAILY_PAYWALL_DATE_KEY, getTodayKey()); } catch {}
};

const hasActiveRevenueCatAccess = (info: CustomerInfo | null | undefined): boolean => {
  if (!info) return false;
  return Boolean(
    info.entitlements.active[ENTITLEMENT_ID] ||
      ((info as any).activeSubscriptions && (info as any).activeSubscriptions.length > 0),
  );
};

export const SubscriptionProvider = ({ children }: { children: ReactNode }) => {
  // Local state
  const [localProAccess, setLocalProAccess] = useState(() => {
    try { return localStorage.getItem('flowist_admin_bypass') === 'true'; } catch { return false; }
  });
  // If cached as subscribed, skip local loading entirely — instant access
  const [localLoading, setLocalLoading] = useState(() => {
    try {
      if (!Capacitor.isNativePlatform() && localStorage.getItem('flowist_stripe_subscribed') === 'true') return false;
      if (Capacitor.isNativePlatform() && localStorage.getItem('flowist_rc_entitled') === 'true') return false;
      if (localStorage.getItem('flowist_admin_bypass') === 'true') return false;
    } catch {}
    return true;
  });
  // On web: if user was previously verified as subscribed, trust local cache instantly
  // and verify silently in background — no paywall flash for returning subscribers
  const [showPaywall, setShowPaywall] = useState(() => {
    if (Capacitor.isNativePlatform()) return false;
    try {
      // If previously verified as subscribed, don't show paywall on mount
      if (localStorage.getItem('flowist_stripe_subscribed') === 'true') return false;
      if (localStorage.getItem('flowist_admin_bypass') === 'true') return false;
    } catch {}
    return false;
  });
  const [paywallFeature, setPaywallFeature] = useState<string | null>(null);
  const [isLocalTrial, setIsLocalTrial] = useState(false);
  const [localTrialExpired, setLocalTrialExpired] = useState(false);
  const [graceExpired, setGraceExpired] = useState(false);
  const [signoutGraceActive, setSignoutGraceActive] = useState(false);

  // Cache expiry windows — after this, cached entitlement is NOT trusted on mount.
  // This prevents deleted/cancelled customers from keeping access indefinitely offline.
  const RC_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;   // 7 days for native (RC)
  const STRIPE_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;   // 24h for web (Stripe)
  const isCacheFresh = (key: string, maxAgeMs: number): boolean => {
    try {
      const ts = Number(localStorage.getItem(key) || '0');
      return ts > 0 && (Date.now() - ts) < maxAgeMs;
    } catch { return false; }
  };

  // RevenueCat state
  // If native user was previously entitled AND cache is fresh, mark as initialized for offline-first access
  const [isInitialized, setIsInitialized] = useState(() => {
    if (Capacitor.isNativePlatform()) {
      try {
        return localStorage.getItem('flowist_rc_entitled') === 'true'
          && isCacheFresh('flowist_rc_verified_at', RC_CACHE_MAX_AGE_MS);
      } catch {}
    }
    return false;
  });
  const [rcLoading, setRcLoading] = useState(false);
  // Initialize rcIsPro from local cache only when cache is FRESH (verified recently).
  const [rcIsPro, setRcIsPro] = useState(() => {
    try {
      if (!Capacitor.isNativePlatform()) {
        return localStorage.getItem('flowist_stripe_subscribed') === 'true'
          && isCacheFresh('flowist_sub_verified_at', STRIPE_CACHE_MAX_AGE_MS);
      }
      return localStorage.getItem('flowist_rc_entitled') === 'true'
        && isCacheFresh('flowist_rc_verified_at', RC_CACHE_MAX_AGE_MS);
    } catch {}
    return false;
  });
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [offerings, setOfferings] = useState<PurchasesOfferings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [listenerHandle, setListenerHandle] = useState<PurchasesCallbackId | null>(null);
  const [isAdminBypass, setIsAdminBypass] = useState(() => {
    try { return localStorage.getItem('flowist_admin_bypass') === 'true'; } catch { return false; }
  });
  // If locally cached as subscribed AND cache is fresh, mark as resolved to avoid loading state
  const [isWebSubscriptionResolved, setIsWebSubscriptionResolved] = useState(() => {
    if (Capacitor.isNativePlatform()) return true;
    try {
      if (localStorage.getItem('flowist_stripe_subscribed') === 'true'
        && isCacheFresh('flowist_sub_verified_at', STRIPE_CACHE_MAX_AGE_MS)) return true;
      if (localStorage.getItem('flowist_admin_bypass') === 'true') return true;
    } catch {}
    return false;
  });
  const [isVerifyingCheckout, setIsVerifyingCheckout] = useState(false);
  const [checkoutVerificationFailed, setCheckoutVerificationFailed] = useState(false);

  // Soft paywall state — true for brand-new free users post-onboarding (no pre-existing data).
  // Cached from localStorage for instant access on mount; verified async via getSetting.
  const [isNewFreeUser, setIsNewFreeUser] = useState<boolean>(() => {
    try { return localStorage.getItem('flowist_new_user') === 'true'; } catch { return false; }
  });

  useEffect(() => {
    getSetting<boolean>('flowist_new_user', false).then((v) => {
      setIsNewFreeUser(!!v);
      try { localStorage.setItem('flowist_new_user', v ? 'true' : 'false'); } catch {}
    }).catch(() => {});

    const handleNewFreeUserChanged = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const next = !!detail?.value;
      setIsNewFreeUser(next);
      try { localStorage.setItem('flowist_new_user', next ? 'true' : 'false'); } catch {}
    };
    window.addEventListener('flowistNewFreeUserChanged', handleNewFreeUserChanged);
    return () => window.removeEventListener('flowistNewFreeUserChanged', handleNewFreeUserChanged);
  }, []);

  // Pull cloud lifetime counters AND today's daily AI usage on mount + auth changes.
  // Merges max(local, cloud) so reinstalls / new devices inherit the user's usage.
  useEffect(() => {
    void pullAndMergeLifetimeCounters();
    void import('@/utils/aiUsageCloud').then(({ pullAndMergeAiUsage }) => pullAndMergeAiUsage());
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void pullAndMergeLifetimeCounters();
      void import('@/utils/aiUsageCloud').then(({ pullAndMergeAiUsage }) => pullAndMergeAiUsage());
    });
    return () => { sub.subscription.unsubscribe(); };
  }, []);

  // Check sign-out grace period on mount
  useEffect(() => {
    const checkSignoutGrace = async () => {
      try {
        const signoutTs = await getSetting<number>('flowist_signout_grace_ts', 0);
        if (signoutTs > 0 && Date.now() - signoutTs < SIGNOUT_GRACE_MS) {
          console.log('[Grace] Sign-out grace period active — user can use app without sign-in');
          setSignoutGraceActive(true);
        } else if (signoutTs > 0) {
          // Grace expired — clear it
          await setSetting('flowist_signout_grace_ts', 0);
          setSignoutGraceActive(false);
        }
      } catch {}
    };
    checkSignoutGrace();

    // Re-check every 60s in case grace expires while app is open
    const interval = setInterval(async () => {
      try {
        const signoutTs = await getSetting<number>('flowist_signout_grace_ts', 0);
        if (signoutTs > 0 && Date.now() - signoutTs >= SIGNOUT_GRACE_MS) {
          console.log('[Grace] Sign-out grace period expired');
          setSignoutGraceActive(false);
          await setSetting('flowist_signout_grace_ts', 0);
        }
      } catch {}
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  // Free trial fully disabled — new installs do NOT get 2 days of Premium.
  // Users are on the Free plan immediately; Pro requires subscription/admin bypass.
  const checkLocalTrial = useCallback(async () => {
    setIsLocalTrial(false);
    setLocalTrialExpired(false);
    setGraceExpired(false);
    return false;
  }, []);

  // Load local admin bypass + trial on mount + listen for activation
  useEffect(() => {
    const loadLocal = async () => {
      try {
        const adminBypass = await getSetting<boolean>('flowist_admin_bypass', false);
        setLocalProAccess(!!adminBypass);
        setIsAdminBypass(!!adminBypass);
        // Trial disabled — only admin bypass grants local Pro access.
        if (adminBypass) {
          setLocalProAccess(true);
        } else {
          setLocalProAccess(false);
        }
        await checkLocalTrial();
      } catch (e) {
        console.error('Failed to load subscription:', e);
      } finally {
        setLocalLoading(false);
      }
    };
    loadLocal();

    // Listen for admin bypass activation from OnboardingFlow or elsewhere
    const handleAdminBypass = () => {
      setLocalProAccess(true);
      setIsAdminBypass(true);
    };
    window.addEventListener('adminBypassActivated', handleAdminBypass);

    // Trial removed — onboarding no longer grants Pro access.
    const handleTrialStart = () => {};

    // Periodically check trial expiry (every 60s)
    const trialInterval = setInterval(async () => {
      const stillActive = await checkLocalTrial();
      if (!stillActive && !isAdminBypass) {
        // Trial expired AND no admin bypass — revoke local pro access immediately
        console.log('[Trial] Local trial expired — revoking Pro access');
        setLocalProAccess(false);
      }
    }, 60000);

    return () => {
      window.removeEventListener('adminBypassActivated', handleAdminBypass);
      clearInterval(trialInterval);
    };
  }, [checkLocalTrial]);

  // On native: clear local bypass if RevenueCat confirms no active entitlement
  // BUT skip if it's an admin bypass (access code)
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !isInitialized) return;
    if (!rcIsPro && localProAccess && !isAdminBypass) {
      // RevenueCat says no entitlement — clear the local bypass
      console.log('RevenueCat: No active entitlement, clearing local Pro bypass');
      setSetting('flowist_admin_bypass', false).catch(console.error);
      setLocalProAccess(false);
    }
  }, [rcIsPro, isInitialized, localProAccess, isAdminBypass]);

  // ==================== RevenueCat Logic ====================

  const initialize = useCallback(async (userID?: string) => {
    if (!Capacitor.isNativePlatform()) {
      console.log('RevenueCat: Skipping initialization on web platform');
      setIsInitialized(true);
      return;
    }

    // Hard guard: never call Purchases.configure with a wrong-platform key.
    // The iOS native SDK fatal-errors on a `goog_` key and crashes the WebView.
    const platform = Capacitor.getPlatform();
    const key = REVENUECAT_API_KEY || '';
    const validPrefix = platform === 'ios' ? 'appl_' : 'goog_';
    if (!key.startsWith(validPrefix) || key.includes('REPLACE_WITH_YOUR')) {
      console.warn(
        `[RevenueCat] Skipping init: API key for ${platform} is missing or invalid ` +
          `(expected prefix "${validPrefix}"). App will run in free tier.`,
      );
      setIsInitialized(true);
      setRcIsPro(false);
      return;
    }

    try {
      setRcLoading(true);
      setError(null);
      await Purchases.setLogLevel({ level: LOG_LEVEL.DEBUG });
      await Purchases.configure({ apiKey: REVENUECAT_API_KEY, appUserID: userID });

      console.log('RevenueCat: SDK configured successfully');

      const { customerInfo: info } = await Purchases.getCustomerInfo();
      setCustomerInfo(info);
      let hasEntitlement = hasActiveRevenueCatAccess(info);

      // Auto-recover purchases on Android (and iOS) when the cached customer
      // info has no active entitlement. This handles the case where the user
      // bought a subscription on Google Play / App Store but the local
      // RevenueCat anonymous ID lost association (e.g. after reinstall or
      // when initialize() was first called without a stable appUserID).
      if (!hasEntitlement) {
        try {
          console.log('[RevenueCat] No entitlement on init — attempting silent restore');
          const { customerInfo: restored } = await Purchases.restorePurchases();
          if (hasActiveRevenueCatAccess(restored)) {
            setCustomerInfo(restored);
            hasEntitlement = true;
            console.log('[RevenueCat] Silent restore recovered active entitlement');
          }
        } catch (restoreErr) {
          console.warn('[RevenueCat] Silent restore failed', restoreErr);
        }
      }
      setRcIsPro(hasEntitlement);
      // Cache entitlement + plan details on native for offline-first access
      try {
        localStorage.setItem('flowist_rc_entitled', hasEntitlement ? 'true' : 'false');
        localStorage.setItem('flowist_rc_verified_at', String(Date.now()));
        if (hasEntitlement) {
          const entitlement = info.entitlements.active[ENTITLEMENT_ID];
          if (entitlement?.productIdentifier) {
            localStorage.setItem('flowist_rc_product', entitlement.productIdentifier);
          }
        } else {
          localStorage.removeItem('flowist_rc_product');
        }
      } catch {}

      const offeringsData = await Purchases.getOfferings();
      setOfferings(offeringsData);

      setIsInitialized(true);
      console.log('RevenueCat: Initialization complete', { isPro: hasEntitlement });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to initialize RevenueCat';
      console.error('RevenueCat: Initialization error', err);
      setError(errorMessage);
      // Offline-first: only honor cached entitlement if cache is FRESH (within 7 days).
      // Stale cache → revoke access so deleted/cancelled customers can't keep using app indefinitely offline.
      try {
        const cachedEntitled = localStorage.getItem('flowist_rc_entitled') === 'true';
        const fresh = isCacheFresh('flowist_rc_verified_at', RC_CACHE_MAX_AGE_MS);
        if (cachedEntitled && fresh) {
          console.log('RevenueCat: Init failed but fresh cached entitlement found — granting offline access');
          setRcIsPro(true);
        } else {
          if (cachedEntitled && !fresh) {
            console.log('RevenueCat: Cached entitlement is stale — revoking access');
            localStorage.setItem('flowist_rc_entitled', 'false');
          }
          setRcIsPro(false);
        }
      } catch {}
      setIsInitialized(true); // Always resolve so isLoading doesn't hang
    } finally {
      setRcLoading(false);
    }
  }, []);

  const checkEntitlement = useCallback(async (): Promise<boolean> => {
    if (!Capacitor.isNativePlatform()) return false;
    try {
      const { customerInfo: info } = await Purchases.getCustomerInfo();
      setCustomerInfo(info);
      const hasEntitlement = hasActiveRevenueCatAccess(info);
      setRcIsPro(hasEntitlement);
      try {
        localStorage.setItem('flowist_rc_entitled', hasEntitlement ? 'true' : 'false');
        localStorage.setItem('flowist_rc_verified_at', String(Date.now()));
      } catch {}
      return hasEntitlement;
    } catch (err) {
      console.error('RevenueCat: Error checking entitlement', err);
      return false;
    }
  }, []);

  const getOfferingsData = useCallback(async (): Promise<PurchasesOfferings | null> => {
    if (!Capacitor.isNativePlatform()) return null;
    try {
      setRcLoading(true);
      const offeringsData = await Purchases.getOfferings();
      setOfferings(offeringsData);
      return offeringsData;
    } catch (err) {
      console.error('RevenueCat: Error fetching offerings', err);
      return null;
    } finally {
      setRcLoading(false);
    }
  }, []);

  const purchasePackage = useCallback(async (pkg: PurchasesPackage): Promise<boolean> => {
    if (!Capacitor.isNativePlatform()) return false;
    try {
      setRcLoading(true);
      setError(null);
      const result = await Purchases.purchasePackage({ aPackage: pkg });
      setCustomerInfo(result.customerInfo);
      const hasEntitlement = hasActiveRevenueCatAccess(result.customerInfo);
      setRcIsPro(hasEntitlement);
      try { localStorage.setItem('flowist_rc_entitled', hasEntitlement ? 'true' : 'false'); localStorage.setItem('flowist_rc_verified_at', String(Date.now())); } catch {}
      console.log('RevenueCat: Purchase successful', { isPro: hasEntitlement });
      return hasEntitlement;
    } catch (err: any) {
      if (err.code === 'PURCHASE_CANCELLED' || err.userCancelled) {
        console.log('RevenueCat: Purchase cancelled by user');
        return false;
      }
      const errorMessage = err instanceof Error ? err.message : 'Purchase failed';
      console.error('RevenueCat: Purchase error', err);
      setError(errorMessage);
      return false;
    } finally {
      setRcLoading(false);
    }
  }, []);

  const purchase = useCallback(async (productType: ProductType): Promise<boolean> => {
    if (!Capacitor.isNativePlatform()) {
      console.log('RevenueCat: Purchase not available on web platform');
      return false;
    }
    try {
      setRcLoading(true);
      setError(null);
      const currentOfferings = await Purchases.getOfferings();
      if (!currentOfferings) throw new Error('No offerings available');

      // Collect ALL packages from ALL offerings (current + all named offerings)
      const allPackages: PurchasesPackage[] = [];
      if (currentOfferings.current) {
        allPackages.push(...currentOfferings.current.availablePackages);
      }
      // Also search through all named offerings
      if (currentOfferings.all) {
        Object.values(currentOfferings.all).forEach((offering: any) => {
          if (offering?.availablePackages) {
            offering.availablePackages.forEach((p: PurchasesPackage) => {
              if (!allPackages.find(existing => existing.identifier === p.identifier && existing.product?.identifier === p.product?.identifier)) {
                allPackages.push(p);
              }
            });
          }
        });
      }

      console.log('RevenueCat: All available packages across offerings:', allPackages.map(p => ({
        identifier: p.identifier,
        packageType: p.packageType,
        productIdentifier: p.product?.identifier,
      })));
      console.log('RevenueCat: Looking for productType:', productType, 'with ID:', PRODUCT_IDS[productType]);

      let pkg: any = null;

      const packageTypeMap: Record<ProductType, PACKAGE_TYPE> = {
        weekly: PACKAGE_TYPE.WEEKLY,
        monthly: PACKAGE_TYPE.MONTHLY,
        yearly: PACKAGE_TYPE.ANNUAL,
      };

      const productIdMap: Record<ProductType, string> = {
        weekly: IS_IOS ? 'com.flowist.app.week' : 'nnppd_weekly',
        monthly: IS_IOS ? 'com.flowist.app.month' : 'npd_mo',
        yearly: IS_IOS ? 'com.flowist.app.year' : 'npd_yr',
      };

      // Try finding by package type first, then by product identifier across ALL offerings
      pkg = allPackages.find(p => p.packageType === packageTypeMap[productType])
        || allPackages.find(p => p.product?.identifier === productIdMap[productType])
        || allPackages.find(p => p.product?.identifier?.includes(productIdMap[productType]));

      if (pkg) {
        console.log('RevenueCat: Found package:', pkg.identifier, pkg.product?.identifier);
        return await purchasePackage(pkg);
      }

      // Fallback: purchase directly via store product if not in offerings
      console.log('RevenueCat: Package not found in offerings, trying direct product purchase for:', productIdMap[productType]);
      const fullProductId = PRODUCT_IDS[productType];
      const { products } = await Purchases.getProducts({ 
        productIdentifiers: [productIdMap[productType], fullProductId] 
      });
      console.log('RevenueCat: Found store products:', products.map(p => p.identifier));

      const storeProduct = products.find(p => p.identifier === productIdMap[productType])
        || products.find(p => p.identifier === fullProductId)
        || products[0];

      if (!storeProduct) {
        console.error('RevenueCat: No product found. Tried:', productIdMap[productType], fullProductId);
        throw new Error(`Product not found for ${productType}. Make sure it's added to RevenueCat and Google Play.`);
      }

      console.log('RevenueCat: Purchasing store product directly:', storeProduct.identifier);
      
      // Try to apply free trial offer if available
      const trialOfferId = TRIAL_OFFER_IDS[productType];
      const purchaseOptions: any = { product: storeProduct };
      if (trialOfferId && (storeProduct as any).subscriptionOptions) {
        const trialOption = (storeProduct as any).subscriptionOptions?.find(
          (opt: any) => opt.id?.includes(trialOfferId)
        );
        if (trialOption) {
          purchaseOptions.subscriptionOption = trialOption;
          console.log('RevenueCat: Applying trial offer:', trialOfferId);
        }
      }
      
      const result = await Purchases.purchaseStoreProduct(purchaseOptions);
      setCustomerInfo(result.customerInfo);
      const hasEntitlement = hasActiveRevenueCatAccess(result.customerInfo);
      setRcIsPro(hasEntitlement);
      try { localStorage.setItem('flowist_rc_entitled', hasEntitlement ? 'true' : 'false'); localStorage.setItem('flowist_rc_verified_at', String(Date.now())); } catch {}
      return hasEntitlement;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Purchase failed';
      console.error('RevenueCat: Purchase error', err);
      setError(errorMessage);
      return false;
    } finally {
      setRcLoading(false);
    }
  }, [purchasePackage]);

  const restorePurchases = useCallback(async (): Promise<boolean> => {
    if (!Capacitor.isNativePlatform()) return false;
    try {
      setRcLoading(true);
      setError(null);
      const { customerInfo: info } = await Purchases.restorePurchases();
      setCustomerInfo(info);
      const hasEntitlement = hasActiveRevenueCatAccess(info);
      setRcIsPro(hasEntitlement);
      try { localStorage.setItem('flowist_rc_entitled', hasEntitlement ? 'true' : 'false'); localStorage.setItem('flowist_rc_verified_at', String(Date.now())); } catch {}
      console.log('RevenueCat: Restore successful', { isPro: hasEntitlement });
      return hasEntitlement;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Restore failed';
      console.error('RevenueCat: Restore error', err);
      setError(errorMessage);
      return false;
    } finally {
      setRcLoading(false);
    }
  }, []);

  const presentPaywallRC = useCallback(async (): Promise<PAYWALL_RESULT> => {
    if (!Capacitor.isNativePlatform()) {
      console.log('RevenueCat: Paywall not available on web platform');
      return PAYWALL_RESULT.NOT_PRESENTED;
    }
    try {
      setRcLoading(true);
      // Native RevenueCat paywall UI not available on Capacitor v5; fall back to custom paywall.
      console.warn('RevenueCat: Native paywall UI unavailable on Capacitor v5, use PremiumPaywall instead.');
      return PAYWALL_RESULT.NOT_PRESENTED;
    } catch (err) {
      console.error('RevenueCat: Paywall error', err);
      return PAYWALL_RESULT.ERROR;
    } finally {
      setRcLoading(false);
    }
  }, [checkEntitlement]);

  const presentPaywallIfNeeded = useCallback(async (): Promise<PAYWALL_RESULT> => {
    if (!Capacitor.isNativePlatform()) {
      return PAYWALL_RESULT.NOT_PRESENTED;
    }
    try {
      setRcLoading(true);
      // Native RevenueCat paywall UI not available on Capacitor v5.
      console.warn('RevenueCat: presentPaywallIfNeeded unavailable on Capacitor v5.');
      return PAYWALL_RESULT.NOT_PRESENTED;
    } catch (err) {
      console.error('RevenueCat: Paywall error', err);
      return PAYWALL_RESULT.ERROR;
    } finally {
      setRcLoading(false);
    }
  }, [checkEntitlement]);

  const presentCustomerCenter = useCallback(async (): Promise<void> => {
    if (!Capacitor.isNativePlatform()) return;
    // RevenueCat Customer Center UI unavailable on Capacitor v5.
    console.warn('RevenueCat: Customer Center unavailable on Capacitor v5.');
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    if (!Capacitor.isNativePlatform()) return;
    try {
      await Purchases.logOut();
      setCustomerInfo(null);
      setRcIsPro(false);
      try { localStorage.removeItem('flowist_rc_entitled'); } catch {}
      console.log('RevenueCat: Logged out, subscription disassociated');
    } catch (err) {
      console.error('RevenueCat: Logout error', err);
    }
  }, []);

  const hasVerifiedStripeAccess = useCallback((data: any) => {
    const status = data?.subscription_status;
    return Boolean(data?.subscribed || status === 'active' || status === 'trialing' || status === 'past_due');
  }, []);

  // Check Stripe subscription on web — silently in background
  // Never flashes paywall for returning subscribers; trusts local cache until server says otherwise
  const checkStripeSubscription = useCallback(async () => {
    if (Capacitor.isNativePlatform()) return;
    
    // Don't reset isWebSubscriptionResolved if we already have a cached result
    // This prevents the loading/paywall flash on refresh
    const wasCached = (() => {
      try { return localStorage.getItem('flowist_stripe_subscribed') === 'true'; } catch { return false; }
    })();
    if (!wasCached) {
      setIsWebSubscriptionResolved(false);
    }
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const storedEmail = (() => {
        try {
          return localStorage.getItem('flowist_stripe_customer_email')?.trim() || null;
        } catch {
          return null;
        }
      })();

      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }

      if (!session?.access_token && !storedEmail) {
        if (!isAdminBypass && !wasCached) {
          setRcIsPro(false);
        }
        return;
      }
      
      const { data, error } = await supabase.functions.invoke('check-subscription', {
        headers,
        body: !session?.access_token && storedEmail ? { email: storedEmail } : undefined,
      });
      
      if (error) {
        console.error('Stripe check-subscription error:', error);
        // On error, don't revoke access for cached subscribers — fail open
        return;
      }
      
      if (hasVerifiedStripeAccess(data)) {
        setRcIsPro(true);
        if (data.plan_type) {
          (window as any).__stripePlanType = data.plan_type;
          (window as any).__stripeIsTrialing = data.is_trialing || false;
        }
        if (data.customer_email) {
          try { localStorage.setItem('flowist_stripe_customer_email', data.customer_email); } catch {}
        }
        try { localStorage.setItem('flowist_stripe_subscribed', 'true'); } catch {}
        try { localStorage.setItem('flowist_trial_used', 'true'); } catch {}
        // Cache plan details for offline-first access
        try {
          if (data.plan_type) localStorage.setItem('flowist_stripe_plan', data.plan_type);
          localStorage.setItem('flowist_stripe_trialing', data.is_trialing ? 'true' : 'false');
          localStorage.setItem('flowist_sub_verified_at', String(Date.now()));
        } catch {}
        setShowPaywall(false);
        setPaywallFeature(null);
      } else {
        // Server confirmed no subscription — only revoke if verification is recent (not stale network error)
        if (!isAdminBypass) {
          setRcIsPro(false);
          try {
            localStorage.removeItem('flowist_stripe_subscribed');
            localStorage.removeItem('flowist_stripe_customer_email');
            localStorage.removeItem('flowist_stripe_plan');
            localStorage.removeItem('flowist_sub_verified_at');
          } catch {}
        }
      }
    } catch (err) {
      console.error('Failed to check Stripe subscription:', err);
      // Network error — don't revoke access for cached subscribers
    } finally {
      setIsWebSubscriptionResolved(true);
    }
  }, [hasVerifiedStripeAccess, isAdminBypass]);

  // Check for Stripe checkout success redirect — verify with server, don't trust URL alone
  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('stripe_success') === 'true') {
      console.log('Stripe checkout success detected, verifying with server...');
      const plan = params.get('plan');
      const sessionId = params.get('session_id');
      if (plan) {
        (window as any).__stripePlanType = plan;
      }
      setIsWebSubscriptionResolved(false);
      setIsVerifyingCheckout(true);
      setCheckoutVerificationFailed(false);
      // Clean URL immediately
      const url = new URL(window.location.href);
      url.searchParams.delete('stripe_success');
      url.searchParams.delete('plan');
      url.searchParams.delete('session_id');
      window.history.replaceState({}, '', url.pathname);
      
      // Verify subscription with server — retry a few times since webhook may not have fired yet
      const verifyWithRetry = async (retries = 5) => {
        for (let i = 0; i < retries; i++) {
          try {
            const { data: { session } } = await supabase.auth.getSession();
            const headers: Record<string, string> = {};
            if (session?.access_token) {
              headers.Authorization = `Bearer ${session.access_token}`;
            }
            if (!session?.access_token && !sessionId) break;
            
            const { data, error } = await supabase.functions.invoke('check-subscription', {
              headers,
              body: sessionId ? { session_id: sessionId } : undefined,
            });
            
            if (error) {
              console.error('Stripe verify attempt', i + 1, 'error:', error);
            }
            
            if (hasVerifiedStripeAccess(data)) {
              console.log('Stripe subscription verified on attempt', i + 1);
              setRcIsPro(true);
              if (data.plan_type) {
                (window as any).__stripePlanType = data.plan_type;
                (window as any).__stripeIsTrialing = data.is_trialing || false;
              }
              if (data.customer_email) {
                try { localStorage.setItem('flowist_stripe_customer_email', data.customer_email); } catch {}
              }
              try { localStorage.setItem('flowist_stripe_subscribed', 'true'); } catch {}
              try { localStorage.setItem('flowist_trial_used', 'true'); } catch {}
              setShowPaywall(false);
              setPaywallFeature(null);
              setIsWebSubscriptionResolved(true);
              setIsVerifyingCheckout(false);
              
              // If no authenticated user, show "secure your subscription" message
              const { data: { session: currentSession } } = await supabase.auth.getSession();
              if (!currentSession?.user) {
                window.dispatchEvent(new CustomEvent('showSecureSubscriptionMessage'));
              }
              return;
            }
          } catch (err) {
            console.error('Stripe verify attempt', i + 1, 'failed:', err);
          }
          // Wait before retrying (2s, 4s, 6s, 8s, 10s)
          if (i < retries - 1) {
            await new Promise(r => setTimeout(r, (i + 1) * 2000));
          }
        }
        console.warn('Stripe subscription not confirmed after retries');
        setIsWebSubscriptionResolved(true);
        setIsVerifyingCheckout(false);
        setCheckoutVerificationFailed(true);
      };
      
      void verifyWithRetry();
    }
  }, [hasVerifiedStripeAccess]);

  // Restore local Stripe subscription on mount — verify with server
  // Don't blindly trust localStorage; always confirm with Stripe API
  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;
    try {
      if (localStorage.getItem('flowist_stripe_subscribed') === 'true') {
        // Don't set rcIsPro here — let checkStripeSubscription verify with server
        // This prevents back-button bypass from Stripe checkout
        console.log('Stripe: Found local subscription flag, will verify with server');
      }
    } catch {}
  }, []);

  // Auto-initialize RevenueCat on mount with Firebase UID for subscription association
  useEffect(() => {
    if (!isInitialized && Capacitor.isNativePlatform()) {
      const initWithFirebaseUser = async () => {
        try {
          const storedUser = await getStoredGoogleUser();
          const appUserID = storedUser?.uid || storedUser?.email || undefined;
          await initialize(appUserID);
        } catch {
          await initialize();
        }
      };
      initWithFirebaseUser();
    } else if (!Capacitor.isNativePlatform()) {
      setIsInitialized(true);
      // Check Stripe subscription on web
      checkStripeSubscription();
    }
  }, [initialize, isInitialized, checkStripeSubscription]);

  // Periodically check Stripe subscription on web (every 60s)
  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;
    const interval = setInterval(checkStripeSubscription, 60000);
    return () => clearInterval(interval);
  }, [checkStripeSubscription]);

  // Re-check Stripe sub when returning to the tab (after checkout redirect)
  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkStripeSubscription();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [checkStripeSubscription]);

  // Listen for stripe restore event from paywall
  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;
    const handleRestore = () => checkStripeSubscription();
    window.addEventListener('stripeSubscriptionRestored', handleRestore);
    return () => window.removeEventListener('stripeSubscriptionRestored', handleRestore);
  }, [checkStripeSubscription]);

  // Listen for sign-out event — reset all subscription state and show paywall
  // Works for both web (Stripe) and native (RevenueCat/Google Play)
  useEffect(() => {
    const handleSignOut = async () => {
      console.log('SubscriptionContext: User signed out, resetting subscription state');

      // If user was a subscriber (paid or trial), grant 1-day grace period
      const wasPro = rcIsPro || localProAccess || isAdminBypass;
      if (wasPro) {
        console.log('[Grace] User was subscribed — granting 1-day sign-out grace period');
        await setSetting('flowist_signout_grace_ts', Date.now());
        setSignoutGraceActive(true);
      }

      // RevenueCat logout on native (disassociates Google Play subscription from user)
      if (Capacitor.isNativePlatform() && isInitialized) {
        try {
          await Purchases.logOut();
          console.log('RevenueCat: Logged out on sign-out');
        } catch (err) {
          console.error('RevenueCat: Logout on sign-out failed:', err);
        }
      }
      setRcIsPro(false);
      setLocalProAccess(false);
      setIsAdminBypass(false);
      setCustomerInfo(null);
      setIsLocalTrial(false);
      setLocalTrialExpired(false);
      setGraceExpired(false);
      setIsWebSubscriptionResolved(true);
      (window as any).__stripePlanType = undefined;
      (window as any).__stripeIsTrialing = undefined;
      // Clear local trial start so it doesn't grant access after sign-out
      setSetting('flowist_trial_start', 0).catch(() => {});
      setSetting('flowist_admin_bypass', false).catch(() => {});
      try {
        localStorage.removeItem('flowist_stripe_subscribed');
        localStorage.removeItem('flowist_stripe_customer_email');
      } catch {}

      // Only reset onboarding if NO grace period (grace = user stays in app)
      if (!wasPro) {
        setShowPaywall(false);
        setSetting('onboarding_completed', false).catch(() => {});
        window.dispatchEvent(new CustomEvent('flowistOnboardingReset'));
      } else {
        // Grace active — keep the app open, don't show paywall or onboarding
        setShowPaywall(false);
      }
    };
    window.addEventListener('flowistSignedOut', handleSignOut);
    return () => window.removeEventListener('flowistSignedOut', handleSignOut);
  }, [isInitialized, rcIsPro, localProAccess, isAdminBypass]);

  // Re-login to RevenueCat when Google auth state changes (sign in / sign out)
  useEffect(() => {
    const handleAuthChange = async () => {
      if (!Capacitor.isNativePlatform() || !isInitialized) return;
      try {
        const storedUser = await getStoredGoogleUser();
        if (storedUser?.uid) {
          // Log in to RevenueCat with Firebase UID to restore their subscription
          await Purchases.logIn({ appUserID: storedUser.uid });
          const { customerInfo: info } = await Purchases.getCustomerInfo();
          setCustomerInfo(info);
          const hasEntitlement = hasActiveRevenueCatAccess(info);
          setRcIsPro(hasEntitlement);
          try { localStorage.setItem('flowist_rc_entitled', hasEntitlement ? 'true' : 'false'); localStorage.setItem('flowist_rc_verified_at', String(Date.now())); } catch {}
          console.log('RevenueCat: Logged in with Firebase UID, isPro:', hasEntitlement);
          
          // Also check Stripe subscription for this Gmail (cross-platform sync)
          if (!hasEntitlement && storedUser.email) {
            try {
              const { data } = await supabase.functions.invoke('check-subscription', {
                body: { email: storedUser.email.trim().toLowerCase() },
              });
              if (data?.subscribed) {
                setRcIsPro(true);
                if (data.plan_type) {
                  (window as any).__stripePlanType = data.plan_type;
                  (window as any).__stripeIsTrialing = data.is_trialing || false;
                }
                try { localStorage.setItem('flowist_stripe_subscribed', 'true'); } catch {}
                console.log('RevenueCat: No entitlement but found Stripe subscription for', storedUser.email);
              }
            } catch (e) {
              console.warn('Stripe cross-platform check failed:', e);
            }
          }
        }
      } catch (err) {
        console.error('RevenueCat: Error syncing auth state', err);
      }
    };

    window.addEventListener('googleAuthStateChanged', handleAuthChange);
    return () => window.removeEventListener('googleAuthStateChanged', handleAuthChange);
  }, [isInitialized]);

  // Realtime: subscribe to user_entitlements changes (RevenueCat webhook -> instant revoke/grant)
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    const subscribe = async () => {
      try {
        // Use RevenueCat's actual appUserID — this is what the webhook receives.
        let rcAppUserID: string | null = null;
        try {
          const result = await Purchases.getAppUserID();
          // SDK returns either a string or { appUserID: string } depending on version
          rcAppUserID = typeof result === 'string' ? result : (result as any)?.appUserID ?? null;
        } catch {}
        const storedUser = await getStoredGoogleUser();
        const appUserID = rcAppUserID || storedUser?.uid || storedUser?.email;
        if (!appUserID || cancelled) return;
        console.log('[Realtime] Subscribing to entitlements for', appUserID);

        // Initial fetch
        const { data: existing } = await (supabase as any)
          .from('user_entitlements')
          .select('*')
          .eq('app_user_id', appUserID)
          .maybeSingle();

        const applyEntitlement = (row: any) => {
          if (!row) return;
          const now = Date.now();
          const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : null;
          const graceAt = row.grace_period_expires_at ? new Date(row.grace_period_expires_at).getTime() : null;

          let active = !!row.is_active;
          // Respect grace period for billing issues
          if (row.in_billing_retry && graceAt && graceAt > now) active = true;
          // If expired, force revoke
          if (expiresAt && expiresAt < now && !(row.in_billing_retry && graceAt && graceAt > now)) {
            active = false;
          }

          console.log('[Realtime Entitlement]', { event: row.last_event_type, active, expiresAt, graceAt });
          setRcIsPro(active);
          try {
            localStorage.setItem('flowist_rc_entitled', active ? 'true' : 'false');
            localStorage.setItem('flowist_rc_verified_at', String(Date.now()));
          } catch {}
        };

        if (existing) applyEntitlement(existing);

        channel = supabase
          .channel(`entitlement-${appUserID}`, { config: { private: true } })
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'user_entitlements',
              filter: `app_user_id=eq.${appUserID}`,
            },
            (payload) => {
              console.log('[Realtime] Entitlement change:', payload.eventType);
              applyEntitlement(payload.new);
            }
          )
          .subscribe();
      } catch (err) {
        console.error('[Realtime] Failed to subscribe to entitlements:', err);
      }
    };

    subscribe();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [isInitialized]);

  // Listen for customer info updates
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let isMounted = true;
    let currentListenerHandle: PurchasesCallbackId | null = null;

    const setupListener = async () => {
      try {
        const handle = await Purchases.addCustomerInfoUpdateListener((info: CustomerInfo) => {
          if (isMounted) {
            console.log('RevenueCat: Customer info updated');
            setCustomerInfo(info);
            const hasEntitlement = hasActiveRevenueCatAccess(info);
            setRcIsPro(hasEntitlement);
            try {
              localStorage.setItem('flowist_rc_entitled', hasEntitlement ? 'true' : 'false');
              localStorage.setItem('flowist_rc_verified_at', String(Date.now()));
            } catch {}
          }
        });
        currentListenerHandle = handle;
        if (isMounted) setListenerHandle(handle);
      } catch (err) {
        console.error('RevenueCat: Error setting up listener', err);
      }
    };

    setupListener();

    return () => {
      isMounted = false;
      const handleToRemove = currentListenerHandle ?? listenerHandle;
      if (handleToRemove) {
        (Purchases.removeCustomerInfoUpdateListener as any)(handleToRemove).catch(console.error);
      }
    };
  }, []);

  // Re-check entitlement when app resumes from background (catches expired trials/subs)
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !isInitialized) return;

    let lastSyncAt = 0;
    let wasHidden = false;
    const SYNC_THROTTLE_MS = 30_000; // don't hammer the store

    const handleResume = async () => {
      if (Date.now() - lastSyncAt < SYNC_THROTTLE_MS) return;
      lastSyncAt = Date.now();

      console.log('RevenueCat: App resumed, syncing purchases & re-checking entitlement');
      try {
        await Purchases.syncPurchases();
        console.log('RevenueCat: syncPurchases() completed');
      } catch (err) {
        console.warn('RevenueCat: syncPurchases() failed', err);
      }
      try { await checkEntitlement(); } catch (e) { console.warn('checkEntitlement failed', e); }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        wasHidden = true;
        return;
      }
      // Only sync on a true background→foreground transition — never on initial mount.
      // This prevents syncPurchases() from running during cold start and blocking the UI.
      if (document.visibilityState === 'visible' && wasHidden) {
        wasHidden = false;
        handleResume();
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [isInitialized, checkEntitlement]);
  // On web: only Stripe-verified subscription or admin bypass grants access (no local trial)
  // On native: RevenueCat + local trial still works
  const isPro = Capacitor.isNativePlatform()
    ? (rcIsPro || localProAccess || signoutGraceActive)
    : (rcIsPro || localProAccess || signoutGraceActive);
  const tier: SubscriptionTier = isPro ? 'premium' : 'free';
  // Never block loading for cached subscribers — they get instant access
  const isCachedSubscriber = rcIsPro && !localLoading;
  const isLoading = isCachedSubscriber ? false : (localLoading || rcLoading || (Capacitor.isNativePlatform() && !isInitialized) || (!Capacitor.isNativePlatform() && !isWebSubscriptionResolved));

  // Detect plan type from RevenueCat entitlement, Stripe, or offline cache
  const planType: SubscriptionPlanType = useMemo(() => {
    if (!isPro) return 'none';
    if (localProAccess) return 'monthly';
    // Web Stripe plan type (live or cached)
    const stripePlan = (window as any).__stripePlanType || (() => {
      try { return localStorage.getItem('flowist_stripe_plan'); } catch { return null; }
    })();
    if (!Capacitor.isNativePlatform() && stripePlan) {
      if (stripePlan === 'weekly') return 'weekly';
      if (stripePlan === 'monthly') return 'monthly';
      if (stripePlan === 'yearly') return 'yearly';
    }
    // Native: check RC customer info or cached product
    if (!customerInfo) {
      // Offline fallback: use cached product identifier
      try {
        const cachedProduct = localStorage.getItem('flowist_rc_product') || '';
        if (cachedProduct.includes('_yr') || cachedProduct.includes('yearly')) return 'yearly';
        if (cachedProduct.includes('weekly') || cachedProduct.includes('_wk')) return 'weekly';
        if (cachedProduct.includes('month') || cachedProduct.includes('mo')) return 'monthly';
      } catch {}
      return 'none';
    }
    const entitlement = customerInfo.entitlements.active[ENTITLEMENT_ID];
    if (!entitlement) return 'none';
    const productId = entitlement.productIdentifier || '';
    if (productId.includes('_yr') || productId.includes('yearly') || productId.includes('annual')) return 'yearly';
    if (productId.includes('weekly') || productId.includes('_wk')) return 'weekly';
    if (productId === PRODUCT_IDS.monthly || productId.includes('month') || productId.includes('mo')) return 'monthly';
    return 'none';
  }, [isPro, customerInfo, localProAccess]);

  const isRecurringSubscriber = planType === 'monthly' || planType === 'weekly' || planType === 'yearly';

  // ==================== Feature Gating ====================

  const canUseFeature = useCallback((feature: PremiumFeature): boolean => {
    // Sketch editor is FREE for everyone (collab remains Pro).
    if (feature === 'sketch') return true;
    if (!isPro) return false;
    if ((RECURRING_ONLY_FEATURES as readonly string[]).includes(feature)) {
      return isRecurringSubscriber;
    }
    return true;
  }, [isPro, isRecurringSubscriber]);

  const requireFeature = useCallback((feature: PremiumFeature): boolean => {
    // Sketch editor is FREE for everyone (collab remains Pro).
    if (feature === 'sketch') return true;
    // AI features are NEVER unlocked by the 2-day device trial —
    // only real Pro (paid subscription or admin bypass) can use them.
    if (feature === 'ai_dictation') {
      const hasRealPro = rcIsPro || isAdminBypass;
      if (hasRealPro) return true;
      setPaywallFeature(feature);
      setShowPaywall(true);
      return false;
    }
    if ((RECURRING_ONLY_FEATURES as readonly string[]).includes(feature)) {
      if (isRecurringSubscriber) return true;
      setPaywallFeature(feature);
      setShowPaywall(true);
      return false;
    }
    if (isPro) return true;
    setPaywallFeature(feature);
    setShowPaywall(true);
    return false;
  }, [isPro, isRecurringSubscriber, rcIsPro, isAdminBypass]);

  const openPaywall = useCallback((feature?: string, options?: { daily?: boolean }) => {
    if (options?.daily) {
      if (!canShowAutomaticPaywallToday()) return;
      markPaywallShownToday();
    }
    setPaywallFeature(feature || null);
    setShowPaywall(true);
  }, []);

  const closePaywall = useCallback(() => {
    // Paywall is always dismissable via the close (X) button. Hard feature gating
    // is enforced separately at each Pro-gated action via requireFeature().
    setShowPaywall(false);
    setPaywallFeature(null);
  }, []);

  const unlockPro = useCallback(async () => {
    await setSetting('flowist_admin_bypass', true);
    try {
      localStorage.setItem('flowist_admin_bypass', 'true');
      localStorage.setItem('flowist_user_engaged', 'true');
      localStorage.setItem('onboarding_completed_flag', 'true');
    } catch {}
    setLocalProAccess(true);
    setIsAdminBypass(true);
    setShowPaywall(false);
    setPaywallFeature(null);
    window.dispatchEvent(new Event('adminBypassActivated'));
  }, []);

  // ── Soft Paywall Helpers ──
  const markAsNewFreeUser = useCallback(async () => {
    try {
      await setSetting('flowist_new_user', true);
      try { localStorage.setItem('flowist_new_user', 'true'); } catch {}
      setIsNewFreeUser(true);
    } catch (e) {
      console.warn('Failed to mark as new free user:', e);
    }
  }, []);

  // Auto-clear new-user flag once user becomes Pro
  useEffect(() => {
    if (isPro && isNewFreeUser) {
      setIsNewFreeUser(false);
      try { localStorage.setItem('flowist_new_user', 'false'); } catch {}
      setSetting('flowist_new_user', false).catch(() => {});
    }
  }, [isPro, isNewFreeUser]);

  // When user upgrades to Pro: wipe lifetime counters (local + cloud) so a fresh
  // slate is in place if they ever downgrade. Guarded by a flag so it runs only once
  // per upgrade (not on every re-render). Flag is cleared if user drops back to Free.
  useEffect(() => {
    if (isPro) {
      try {
        if (localStorage.getItem('flowist_lifetime_reset_done') === 'true') return;
        localStorage.setItem('flowist_lifetime_reset_done', 'true');
      } catch {}
      void resetAllLifetimeCounters();
    } else {
      try { localStorage.removeItem('flowist_lifetime_reset_done'); } catch {}
    }
  }, [isPro]);

  // Free-tier quota is based on CURRENT count (deleting frees up quota).
  // Lifetime counters are no longer used for gating — kept as no-ops for backward compat.
  const getLifetimeMax = (_kind: SoftLimitKind): number => 0;
  const bumpLifetimeMax = (_kind: SoftLimitKind, _currentCount: number) => {
    // no-op: deletion should free quota, so we don't track lifetime max anymore
  };

  const canCreateWithinSoftLimit = useCallback((kind: SoftLimitKind, currentCount: number): boolean => {
    if (isPro) return true;
    return currentCount < SOFT_FREE_LIMITS[kind];
  }, [isPro]);

  // Returns true when allowed to create. Opens paywall + returns false when current count hits the free limit.
  const softRequireCreate = useCallback((kind: SoftLimitKind, currentCount: number): boolean => {
    if (isPro) return true;
    if (currentCount >= SOFT_FREE_LIMITS[kind]) {
      setPaywallFeature(`soft_limit_${kind}`);
      if (canShowAutomaticPaywallToday()) {
        markPaywallShownToday();
        setShowPaywall(true);
      }
      return false;
    }
    return true;
  }, [isPro]);

  // Returns true when allowed to mutate.
  // Pro/trial-active users: always allowed.
  // Post-trial free users: blocked → opens dismissible paywall.
  const softRequireMutate = useCallback((): boolean => {
    if (isPro) return true;
    if (localTrialExpired) {
      setPaywallFeature('trial_expired');
      if (canShowAutomaticPaywallToday()) {
        markPaywallShownToday();
        setShowPaywall(true);
      }
      return false;
    }
    return true;
  }, [isPro, localTrialExpired]);

  // === Free Plan capacity gating (current-count) ===
  const capacityLimit = useCallback((kind: CapacityKind): number => {
    return isPro ? Infinity : FREE_CAPACITY_LIMITS[kind];
  }, [isPro]);

  const hasCapacity = useCallback((kind: CapacityKind, currentCount: number): boolean => {
    if (isPro) return true;
    return currentCount < FREE_CAPACITY_LIMITS[kind];
  }, [isPro]);

  // Returns true when create is allowed; opens paywall with dynamic message and returns false otherwise.
  const requireCapacity = useCallback((kind: CapacityKind, currentCount: number): boolean => {
    if (isPro) return true;
    if (currentCount < FREE_CAPACITY_LIMITS[kind]) return true;
    setPaywallFeature(`capacity_${kind}`);
    setShowPaywall(true);
    return false;
  }, [isPro]);

  // Generic "require pro" for arbitrary feature strings (e.g. 'pomodoro', 'reading_mode').
  // Returns true when access is allowed; opens paywall with the feature key otherwise.
  const requireProFeature = useCallback((feature: string): boolean => {
    if (isPro) return true;
    setPaywallFeature(feature);
    setShowPaywall(true);
    return false;
  }, [isPro]);




  // Check Stripe subscription by email (used from onboarding Google sign-in)
  const checkStripeByEmail = useCallback(async (email: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase.functions.invoke('check-subscription', {
        body: { email: email.trim().toLowerCase() },
      });
      if (error) {
        console.error('checkStripeByEmail error:', error);
        return false;
      }
      if (data?.subscribed) {
        setRcIsPro(true);
        if (data.plan_type) {
          (window as any).__stripePlanType = data.plan_type;
          (window as any).__stripeIsTrialing = data.is_trialing || false;
        }
        try { localStorage.setItem('flowist_stripe_customer_email', email.trim().toLowerCase()); } catch {}
        try { localStorage.setItem('flowist_stripe_subscribed', 'true'); } catch {}
        setShowPaywall(false);
        setPaywallFeature(null);
        return true;
      }
      setRcIsPro(false);
      return false;
    } catch (err) {
      console.error('checkStripeByEmail failed:', err);
      setRcIsPro(false);
      return false;
    }
  }, []);

  return (
    <UnifiedBillingContext.Provider
      value={{
        // Subscription
        tier,
        planType,
        isPro,
        isRecurringSubscriber,
        isLoading,
        isLocalTrial,
        localTrialExpired,
        graceExpired,
        isAdminBypass,
        isRevenueCatTrial: (() => {
          const ent = customerInfo?.entitlements?.active?.[ENTITLEMENT_ID] as any;
          return ent?.periodType === 'TRIAL';
        })(),
        checkStripeByEmail,
        // Feature gating
        showPaywall,
        isVerifyingCheckout,
        checkoutVerificationFailed,
        paywallFeature,
        openPaywall,
        closePaywall,
        canUseFeature,
        requireFeature,
        unlockPro,
        // Soft paywall
        isNewFreeUser,
        markAsNewFreeUser,
        canCreateWithinSoftLimit,
        softRequireCreate,
        softRequireMutate,
        capacityLimit,
        hasCapacity,
        requireCapacity,
        requireProFeature,

        // RevenueCat
        isInitialized,
        customerInfo,
        offerings,
        error,
        initialize,
        checkEntitlement,
        getOfferings: getOfferingsData,
        purchase,
        purchasePackage,
        restorePurchases,
        presentPaywall: presentPaywallRC,
        presentPaywallIfNeeded,
        presentCustomerCenter,
        logout,
      }}
    >
      {children}
    </UnifiedBillingContext.Provider>
  );
};

// Safe fallback for when context is not yet available (React concurrent error recovery)
const FALLBACK_CONTEXT: UnifiedBillingContextType = {
  tier: 'free',
  planType: 'none',
  isPro: false,
  isRecurringSubscriber: false,
  isLoading: true,
  isLocalTrial: false,
  localTrialExpired: false,
  graceExpired: false,
  isAdminBypass: false,
  isRevenueCatTrial: false,
  checkStripeByEmail: async () => false,
  showPaywall: false,
  isVerifyingCheckout: false,
  checkoutVerificationFailed: false,
  paywallFeature: null,
  openPaywall: () => {},
  closePaywall: () => {},
  canUseFeature: () => false,
  requireFeature: () => false,
  unlockPro: async () => {},
  isNewFreeUser: false,
  markAsNewFreeUser: async () => {},
  canCreateWithinSoftLimit: () => true,
  softRequireCreate: () => true,
  softRequireMutate: () => true,
  capacityLimit: () => Infinity,
  hasCapacity: () => true,
  requireCapacity: () => true,
  requireProFeature: () => true,

  isInitialized: false,
  customerInfo: null,
  offerings: null,
  error: null,
  initialize: async () => {},
  checkEntitlement: async () => false,
  getOfferings: async () => null,
  purchase: async () => false,
  purchasePackage: async () => false,
  restorePurchases: async () => false,
  presentPaywall: async () => PAYWALL_RESULT.NOT_PRESENTED,
  presentPaywallIfNeeded: async () => PAYWALL_RESULT.NOT_PRESENTED,
  presentCustomerCenter: async () => {},
  logout: async () => {},
};

// Primary hook - unified billing (never throws — returns safe fallback during error recovery)
export const useSubscription = () => {
  const context = useContext(UnifiedBillingContext);
  return context ?? FALLBACK_CONTEXT;
};

// Backward-compatible alias for useRevenueCat consumers
export const useRevenueCat = () => useSubscription();

// Re-export constants
export { ENTITLEMENT_ID, PRODUCT_IDS, REVENUECAT_API_KEY };
