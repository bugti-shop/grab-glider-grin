/**
 * Web Push Notifications utility
 * Uses the browser Notification API (works in PWA and browser)
 */

export const isNotificationSupported = (): boolean => {
  return 'Notification' in window;
};

export const getNotificationPermission = (): NotificationPermission | 'unsupported' => {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission;
};

export const requestNotificationPermission = async (): Promise<NotificationPermission | 'unsupported'> => {
  if (!isNotificationSupported()) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';

  try {
    const result = await Notification.requestPermission();
    return result;
  } catch {
    return 'denied';
  }
};

export interface WebNotificationOptions {
  body?: string;
  icon?: string;
  badge?: string;
  tag?: string;
  requireInteraction?: boolean;
  data?: Record<string, unknown>;
  actions?: Array<{ action: string; title: string }>;
}

export const sendWebNotification = (
  title: string,
  options: WebNotificationOptions = {}
): Notification | null => {
  if (!isNotificationSupported() || Notification.permission !== 'granted') {
    console.log('Web Notification: Permission not granted or unsupported');
    return null;
  }

  try {
    const notification = new Notification(title, {
      body: options.body,
      icon: options.icon || '/launcher-icon.webp',
      badge: options.badge || '/launcher-icon.webp',
      tag: options.tag,
      requireInteraction: options.requireInteraction ?? false,
      data: options.data,
    });

    // Focus app when notification is clicked
    notification.onclick = () => {
      window.focus();
      notification.close();
    };

    return notification;
  } catch (err) {
    console.error('Web Notification: Failed to send', err);
    // Fallback: try via service worker
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then((registration) => {
        registration.showNotification(title, {
          body: options.body,
          icon: options.icon || '/launcher-icon.webp',
          badge: options.badge || '/launcher-icon.webp',
          tag: options.tag,
        });
      }).catch(console.error);
    }
    return null;
  }
};

/**
 * Schedule a notification after a delay (in milliseconds)
 */
export const scheduleWebNotification = (
  title: string,
  options: WebNotificationOptions = {},
  delayMs: number
): ReturnType<typeof setTimeout> => {
  return setTimeout(() => {
    sendWebNotification(title, options);
  }, delayMs);
};
