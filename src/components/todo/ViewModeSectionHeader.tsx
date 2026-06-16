/**
 * ViewModeSectionHeader — Collapsible section header used in timeline/progress/priority views.
 * Extracted from Today.tsx renderViewModeSectionHeader function.
 */
import { ReactNode } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';

interface ViewModeSectionHeaderProps {
  label: string;
  taskCount: number;
  color: string;
  icon: ReactNode;
  sectionId: string;
  isCollapsed: boolean;
  onToggle: (sectionId: string) => void;
  extra?: ReactNode;
}

export const ViewModeSectionHeader = ({ label, taskCount, color, icon, sectionId, isCollapsed, onToggle, extra }: ViewModeSectionHeaderProps) => {
  return (
    <button onClick={() => onToggle(sectionId)} className="w-full flex items-center gap-2 px-4 py-3 border-b border-border/30 hover:bg-muted/20 transition-colors" style={{ borderLeft: `4px solid ${color}` }}>
      <span style={{ color }}>{icon}</span>
      <span className="text-sm font-semibold flex-1 text-left">{label}</span>
      {extra}
      <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{taskCount}</span>
      {isCollapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
    </button>
  );
};
