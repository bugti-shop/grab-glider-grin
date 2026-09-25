import type { ComponentType } from 'react';
import { cn } from '@/lib/utils';

interface NavigationIconProps {
  iconName: string;
  Icon: ComponentType<{ className?: string }>;
  isActive: boolean;
}

// translateZ + backface-hidden pins the icon on its own layer so the sliding
// pill beneath it can't cause sub-pixel jitter during tab switches.
const iconClassName = 'relative z-10 h-5 w-5 flex-shrink-0 [transform:translateZ(0)] [backface-visibility:hidden]';

export const NavigationIcon = ({ iconName, Icon, isActive }: NavigationIconProps) => {
  if (!isActive) return <Icon className={iconClassName} />;

  if (iconName === 'Calendar') {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={iconClassName}
        aria-hidden="true"
      >
        <path d="M3 10h18v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-9Z" className="fill-current" />
        <path d="M3 10V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4" />
        <path d="M8 2v4M16 2v4" />
      </svg>
    );
  }

  if (iconName === 'Book') {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={iconClassName}
        aria-hidden="true"
      >
        <path d="M4 17V4.5A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v14H6.5A2.5 2.5 0 0 0 4 19.5" className="fill-current" />
        <path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H19a1 1 0 0 0 1-1v-4H6.5A2.5 2.5 0 0 0 4 19.5Z" />
      </svg>
    );
  }

  const shouldStayOutline = iconName === 'Home' || iconName === 'BarChart3';
  const keepInnerCircleClear = iconName === 'Settings' || iconName === 'User';

  return (
    <Icon
      className={cn(
        iconClassName,
        !shouldStayOutline && 'fill-current',
        keepInnerCircleClear && '[&>circle]:fill-background',
      )}
    />
  );
};