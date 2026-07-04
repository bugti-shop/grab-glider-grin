import { useCallback } from 'react';

/**
 * Web Clipper is unlimited for every user (free and Pro). This hook is
 * kept as a shim so existing call sites don't need to change; it always
 * reports zero usage against an Infinity limit and never fetches anything.
 */
export const WEB_CLIPPER_FREE_MONTHLY_LIMIT = Infinity;

export function useWebClipperQuota(_enabled: boolean) {
  const refresh = useCallback(async () => {
    /* no-op — quota removed */
  }, []);

  return {
    used: 0,
    limit: Infinity,
    remaining: Infinity,
    percent: 0,
    loading: false,
    refresh,
  };
}
