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
  impact: () => resolved,
  notification: () => resolved,
  vibrate: () => resolved,
  selectionStart: () => resolved,
  selectionChanged: () => resolved,
  selectionEnd: () => resolved,
};