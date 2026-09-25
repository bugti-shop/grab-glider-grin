/** App-wide silent replacement for @capacitor/haptics. */
export enum ImpactStyle {
  Heavy = 'HEAVY',
  Medium = 'MEDIUM',
  Light = 'LIGHT',
}

export enum NotificationType {
  Success = 'SUCCESS',
  Warning = 'WARNING',
  Error = 'ERROR',
}

const resolved = Promise.resolve();

export const Haptics = {
  impact: (..._args: unknown[]) => resolved,
  notification: (..._args: unknown[]) => resolved,
  vibrate: (..._args: unknown[]) => resolved,
  selectionStart: (..._args: unknown[]) => resolved,
  selectionChanged: (..._args: unknown[]) => resolved,
  selectionEnd: (..._args: unknown[]) => resolved,
};