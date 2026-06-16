/**
 * Shim for sonner — wraps `toast` so only toasts with an `action`
 * property (e.g. Undo) are shown. All others are silently suppressed.
 * 
 * The real sonner is aliased as `sonner-real` in vite.config.ts.
 */

// @ts-nocheck — vite alias resolves 'sonner-real' at build time
export { Toaster } from 'sonner-real';
export type { ExternalToast, ToastT, ToasterProps } from 'sonner-real';
import { toast as originalToast } from 'sonner-real';

const hasAction = (opts: any): boolean =>
  opts && typeof opts === 'object' && 'action' in opts;

const toast = Object.assign(
  (message: any, opts?: any) => {
    if (hasAction(opts)) return originalToast(message, opts);
    return undefined as any;
  },
  {
    success: (message: any, opts?: any) => {
      if (hasAction(opts)) return originalToast.success(message, opts);
      return undefined as any;
    },
    error: (_message: any, _opts?: any) => undefined as any,
    info: (_message: any, _opts?: any) => undefined as any,
    warning: (_message: any, _opts?: any) => undefined as any,
    loading: (message: any, opts?: any) => {
      if (hasAction(opts)) return originalToast.loading(message, opts);
      return undefined as any;
    },
    promise: originalToast.promise,
    dismiss: originalToast.dismiss,
    custom: (_component: any, _opts?: any) => undefined as any,
    message: (_message: any, _opts?: any) => undefined as any,
  }
) as typeof originalToast;

export { toast };
