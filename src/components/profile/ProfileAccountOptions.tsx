import { useTranslation } from 'react-i18next';
import { m as motion } from 'framer-motion';
import { Settings, Bell, HelpCircle, Info, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export const ProfileAccountOptions = () => {
  const { t } = useTranslation();

  const options = [
    { icon: Settings, label: t('profile.optSettings', 'Settings'), to: '/settings' },
    { icon: Bell, label: t('profile.optNotifications', 'Notifications'), to: '/reminders' },
    { icon: HelpCircle, label: t('profile.optHelp', 'Help & Support'), to: '/settings' },
    { icon: Info, label: t('profile.optAbout', 'About the App'), to: '/settings' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full bg-card rounded-2xl border border-border/50 overflow-hidden"
    >
      <div className="divide-y divide-border/30">
        {options.map((opt, i) => (
          <Link
            key={opt.label}
            to={opt.to}
            className="flex items-center justify-between px-4 py-3.5 hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-center gap-3">
              <opt.icon className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-foreground">{opt.label}</span>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </motion.div>
  );
};
