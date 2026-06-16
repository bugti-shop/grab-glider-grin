/**
 * TaskSectionHeader — Section header with dropdown menu for flat view mode.
 * Extracted from Today.tsx renderSectionHeader function.
 */
import { TodoItem, TaskSection } from '@/types/note';
import { useTranslation } from 'react-i18next';
import { Edit, Plus as PlusIcon, ArrowUpCircle, ArrowDownCircle, Move, MoreVertical, Copy, Trash2, ChevronRight, ChevronDown, LayoutList, LayoutGrid, Columns3, GitBranch, Flag, ListChecks } from 'lucide-react';
import { TrendingUp, History } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

interface TaskSectionHeaderProps {
  section: TaskSection;
  sections: TaskSection[];
  isDragging?: boolean;
  uncompletedItems: TodoItem[];
  viewMode: string;
  collapsedViewSections: Set<string>;
  onToggleSectionCollapse: (sectionId: string) => void;
  onEditSection: (section: TaskSection) => void;
  onAddTaskToSection: (sectionId: string) => void;
  onAddSection: (position: 'above' | 'below', referenceId?: string) => void;
  onDuplicateSection: (sectionId: string) => void;
  onMoveSection: (section: TaskSection) => void;
  onDeleteSection: (sectionId: string) => void;
}

export const TaskSectionHeader = ({
  section, sections, isDragging = false, uncompletedItems, viewMode,
  collapsedViewSections, onToggleSectionCollapse,
  onEditSection, onAddTaskToSection, onAddSection,
  onDuplicateSection, onMoveSection, onDeleteSection,
}: TaskSectionHeaderProps) => {
  const { t } = useTranslation();
  const sectionTasks = uncompletedItems.filter(item => item.sectionId === section.id || (!item.sectionId && section.id === sections[0]?.id));

  const getViewModeIcon = () => {
    switch (viewMode) {
      case 'kanban': return <Columns3 className="h-3.5 w-3.5" />;
      case 'kanban-status': return <ListChecks className="h-3.5 w-3.5" />;
      case 'timeline': return <GitBranch className="h-3.5 w-3.5" />;
      case 'progress': return <TrendingUp className="h-3.5 w-3.5" />;
      case 'priority': return <Flag className="h-3.5 w-3.5" />;
      case 'history': return <History className="h-3.5 w-3.5" />;
      default: return <LayoutList className="h-3.5 w-3.5" />;
    }
  };

  return (
    <div data-tour="task-section" className={cn("flex items-center", isDragging && "opacity-90 scale-[1.02] shadow-xl bg-card rounded-t-xl")} style={{ borderLeft: `4px solid ${section.color}` }}>
      <div className="flex-1 flex items-center gap-3 px-3 py-2.5 bg-muted/30">
        <span className="text-muted-foreground" style={{ color: section.color }}>{getViewModeIcon()}</span>
        <span className="text-sm font-semibold">{section.name}</span>
        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{sectionTasks.length}</span>
      </div>
      <button onClick={() => onToggleSectionCollapse(section.id)} className="p-2 hover:bg-muted/50 transition-colors">
        {collapsedViewSections.has(`flat-${section.id}`) ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="p-2 hover:bg-muted/50 transition-colors"><MoreVertical className="h-4 w-4 text-muted-foreground" /></button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48 bg-popover border shadow-lg z-50">
          <DropdownMenuItem onClick={() => onEditSection(section)} className="cursor-pointer"><Edit className="h-4 w-4 mr-2" />{t('sections.editSection')}</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onAddTaskToSection(section.id)} className="cursor-pointer"><PlusIcon className="h-4 w-4 mr-2" />{t('sections.addTask')}</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onAddSection('above', section.id)} className="cursor-pointer"><ArrowUpCircle className="h-4 w-4 mr-2" />{t('sections.addSectionAbove')}</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onAddSection('below', section.id)} className="cursor-pointer"><ArrowDownCircle className="h-4 w-4 mr-2" />{t('sections.addSectionBelow')}</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onDuplicateSection(section.id)} className="cursor-pointer"><Copy className="h-4 w-4 mr-2" />{t('sections.duplicateSection')}</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onMoveSection(section)} className="cursor-pointer"><Move className="h-4 w-4 mr-2" />{t('sections.moveTo')}</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onDeleteSection(section.id)} className="cursor-pointer text-destructive focus:text-destructive" disabled={sections.length <= 1}><Trash2 className="h-4 w-4 mr-2" />{t('common.delete')}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
