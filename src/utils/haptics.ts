import { Priority } from '@/types/note';

export type HapticIntensity = 'light' | 'medium' | 'heavy';

export const triggerHaptic = async (_style: HapticIntensity = 'heavy') => {};

// Double heavy burst for strong tactile feedback on selections
export const triggerSelectionHaptic = async () => {};

// Triple heavy haptic burst for maximum attention on reminders
export const triggerTripleHeavyHaptic = async () => {};

// Priority-based haptic feedback for notifications
export const triggerPriorityHaptic = async (_priority?: Priority) => {};

// Notification haptic based on notification type
export const triggerNotificationHaptic = async (_type: 'success' | 'warning' | 'error' = 'success') => {};
