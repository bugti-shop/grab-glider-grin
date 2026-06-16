import { Crown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PremiumCrownProps {
  className?: string;
  size?: number;
  strokeWidth?: number;
}

/**
 * Unified gold premium crown icon. Use this anywhere a Pro feature,
 * locked premium item, or paywall trigger needs to be marked.
 */
export const PREMIUM_CROWN_GOLD = '#FFD700';

export const PremiumCrown = ({ className, size, strokeWidth = 2 }: PremiumCrownProps) => (
  <Crown
    className={cn(className)}
    size={size}
    strokeWidth={strokeWidth}
    fill={PREMIUM_CROWN_GOLD}
    color={PREMIUM_CROWN_GOLD}
  />
);
