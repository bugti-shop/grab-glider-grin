import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bell, Check, CheckCheck, Trash2, Clock, Trophy, Flame, FileText, CheckCircle, Zap, AlertTriangle, Target, Award, MapPin, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  clearAllNotifications,
  deleteNotification,
  InAppNotification,
} from '@/utils/notificationStore';

const iconMap: Record<string, typeof Bell> = {
  bell: Bell,
  flame: Flame,
  trophy: Trophy,
  award: Award,
  'check-circle': CheckCircle,
  'file-text': FileText,
  zap: Zap,
  'alert-triangle': AlertTriangle,
  target: Target,
  map: MapPin,
  clock: Clock,
};

const typeColors: Record<string, string> = {
  reminder: 'text-orange-500',
  streak: 'text-red-500',
  achievement: 'text-yellow-500',
  note: 'text-blue-500',
  task: 'text-green-500',
  system: 'text-muted-foreground',
};

const formatTimeAgo = (timestamp: number): string => {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
};

export const NotificationCenter = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const [notifs, count] = await Promise.all([
        getNotifications(50),
        getUnreadCount(),
      ]);
      setNotifications(notifs);
      setUnreadCount(count);
    } catch (e) {
      console.warn('Failed to load notifications:', e);
    }
  }, []);

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    window.addEventListener('inAppNotificationChanged', handler);
    // Also poll every 30s for any missed events
    const interval = setInterval(refresh, 30000);
    return () => {
      window.removeEventListener('inAppNotificationChanged', handler);
      clearInterval(interval);
    };
  }, [refresh]);

  const handleOpen = () => {
    setIsOpen(!isOpen);
    if (!isOpen) refresh();
  };

  const handleNotifClick = async (notif: InAppNotification) => {
    if (!notif.read) {
      await markAsRead(notif.id);
    }
    if (notif.actionPath) {
      navigate(notif.actionPath);
    }
    setIsOpen(false);
  };

  const handleMarkAllRead = async () => {
    await markAllAsRead();
    refresh();
  };

  const handleClearAll = async () => {
    await clearAllNotifications();
    refresh();
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await deleteNotification(id);
    refresh();
  };

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-notification-center]')) {
        setIsOpen(false);
      }
    };
    setTimeout(() => document.addEventListener('click', handleClick), 0);
    return () => document.removeEventListener('click', handleClick);
  }, [isOpen]);

  return (
    <div className="relative" data-notification-center>
      <Button
        size="icon"
        variant="ghost"
        onClick={handleOpen}
        className="h-7 w-7 xs:h-8 xs:w-8 sm:h-9 sm:w-9 hover:bg-transparent active:bg-transparent relative"
        title={t('common.notifications', 'Notifications')}
      >
        <Bell className="h-4 w-4 xs:h-5 xs:w-5 sm:h-5 sm:w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 xs:h-[18px] xs:w-[18px] items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </Button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-background border border-border rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
            <h3 className="font-semibold text-sm">{t('common.notifications', 'Notifications')}</h3>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleMarkAllRead}
                  className="h-7 text-xs px-2 text-muted-foreground hover:text-foreground"
                >
                  <CheckCheck className="h-3.5 w-3.5 mr-1" />
                  {t('common.markAllRead', 'Mark all read')}
                </Button>
              )}
              {notifications.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleClearAll}
                  className="h-7 text-xs px-2 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>

          {/* Notification list */}
          <ScrollArea className="max-h-[60vh]">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Bell className="h-10 w-10 mb-3 opacity-30" />
                <p className="text-sm">{t('common.noNotifications', 'No notifications yet')}</p>
                <p className="text-xs mt-1 opacity-60">Your activity will appear here</p>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {notifications.map((notif) => {
                  const IconComp = iconMap[notif.icon || 'bell'] || Bell;
                  return (
                    <div
                      key={notif.id}
                      onClick={() => handleNotifClick(notif)}
                      className={cn(
                        'flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-muted/50 group',
                        !notif.read && 'bg-primary/5'
                      )}
                    >
                      <div className={cn('mt-0.5 flex-shrink-0', typeColors[notif.type] || 'text-muted-foreground')}>
                        <IconComp className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={cn('text-sm font-medium truncate', !notif.read && 'text-foreground', notif.read && 'text-muted-foreground')}>
                            {notif.title}
                          </p>
                          {!notif.read && (
                            <span className="h-2 w-2 rounded-full bg-primary flex-shrink-0" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{notif.message}</p>
                        <p className="text-[11px] text-muted-foreground/60 mt-1">{formatTimeAgo(notif.timestamp)}</p>
                      </div>
                      <button
                        onClick={(e) => handleDelete(e, notif.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity mt-1 text-muted-foreground hover:text-destructive flex-shrink-0"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>
      )}
    </div>
  );
};
