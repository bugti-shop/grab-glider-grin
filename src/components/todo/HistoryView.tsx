import { TodoItem } from '@/types/note';
import { History, CheckCircle2 } from 'lucide-react';
import { isToday, isYesterday, isThisWeek } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { ViewModeSectionHeader } from './ViewModeSectionHeader';

interface HistoryViewProps {
  completedItems: TodoItem[];
  collapsedViewSections: Set<string>;
  toggleViewSectionCollapse: (id: string) => void;
  renderTaskItem: (item: TodoItem) => React.ReactNode;
}

export const HistoryView = ({
  completedItems,
  collapsedViewSections,
  toggleViewSectionCollapse,
  renderTaskItem,
}: HistoryViewProps) => {
  const { t } = useTranslation();

  const historyGroups = [
    { label: t('grouping.completedToday', 'Completed Today'), tasks: completedItems.filter(item => item.dueDate && isToday(new Date(item.dueDate))), color: '#10b981' },
    { label: t('grouping.completedYesterday', 'Completed Yesterday'), tasks: completedItems.filter(item => item.dueDate && isYesterday(new Date(item.dueDate))), color: '#3b82f6' },
    { label: t('grouping.thisWeek', 'This Week'), tasks: completedItems.filter(item => item.dueDate && isThisWeek(new Date(item.dueDate)) && !isToday(new Date(item.dueDate)) && !isYesterday(new Date(item.dueDate))), color: '#8b5cf6' },
    { label: t('grouping.older', 'Older'), tasks: completedItems.filter(item => !item.dueDate || (!isThisWeek(new Date(item.dueDate)))), color: '#6b7280' },
  ];

  const nonEmptyGroups = historyGroups.filter(g => g.tasks.length > 0);

  if (nonEmptyGroups.length === 0) {
    return (
      <div className="text-center py-20">
        <History className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
        <p className="text-muted-foreground">{t('emptyStates.noCompletedTasks')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {nonEmptyGroups.map((group) => {
        const sectionId = `history-${group.label.toLowerCase().replace(/\s+/g, '-')}`;
        const isCollapsed = collapsedViewSections.has(sectionId);
        return (
          <div key={group.label} className="bg-muted/30 rounded-xl border border-border/30 overflow-hidden">
            <ViewModeSectionHeader
              label={group.label}
              taskCount={group.tasks.length}
              color={group.color}
              icon={<CheckCircle2 className="h-4 w-4" />}
              sectionId={sectionId}
              isCollapsed={isCollapsed}
              onToggle={toggleViewSectionCollapse}
            />
            {!isCollapsed && (
              <div className="p-2 space-y-2">
                {group.tasks.map((item) => (
                  <div key={item.id} className="bg-card rounded-lg border border-border/50 opacity-70">
                    {renderTaskItem(item)}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
