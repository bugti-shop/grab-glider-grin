/**
 * Build-time fallback for `sonner` when the package is missing from
 * node_modules. Vite's alias in vite.config.ts swaps `sonner-real` to this
 * file if `node_modules/sonner` doesn't exist, preventing ENOENT crashes.
 *
 * All exports are no-ops so the app builds and runs without toast UI.
 */
import * as React from 'react';

export const Toaster: React.FC<Record<string, unknown>> = () => null;

const noop = () => undefined as any;

export const toast: any = Object.assign(noop, {
  success: noop,
  error: noop,
  info: noop,
  warning: noop,
  loading: noop,
  message: noop,
  custom: noop,
  promise: (p: Promise<unknown>) => p,
  dismiss: noop,
});

export type ExternalToast = Record<string, unknown>;
export type ToastT = Record<string, unknown>;
export type ToasterProps = Record<string, unknown>;
