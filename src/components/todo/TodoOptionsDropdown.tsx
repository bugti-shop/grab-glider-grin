import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sparkles, Flame, Clock, Calendar as CalendarIcon2, Upload, Download } from 'lucide-react';
import { MoreVertical, Eye, EyeOff, Filter, Copy, MousePointer2, Settings, LayoutList, LayoutGrid, ListPlus, ArrowUpDown, Columns3, GitBranch, Flag, ChevronRight, Trash2, ListChecks, Crown } from 'lucide-react';
import { Plus as PlusIcon, FolderIcon, ArrowDownAZ } from 'lucide-react';
import { toast } from 'sonner';
import { loadCustomSmartViews, deleteCustomSmartView } from '@/utils/customSmartViews';
import { ImportDataSheet } from '@/components/ImportDataSheet';
import { loadTasksFromDB } from '@/utils/taskStorage';
import { exportTasksCsv } from '@/utils/csvExport';

interface TodoOptionsDropdownProps {
  dropdownView: string;
  setDropdownView: (view: any) => void;
  requireFeature: (feature: string) => boolean;
  isPro: boolean;
  smartList: string;
  setSmartList: (id: any) => void;
  smartListData: { smartLists: any[]; getCounts: Record<string, number> };
  customSmartViews: any[];
  setCustomSmartViews: (views: any[]) => void;
  activeCustomViewId: string | null;
  setActiveCustomViewId: (id: string | null) => void;
  setDateFilter: (v: any) => void;
  setPriorityFilter: (v: any) => void;
  setStatusFilter: (v: any) => void;
  setTagFilter: (v: string[]) => void;
  setSelectedFolderId: (v: string | null) => void;
  sortBy: string;
  setSortBy: (v: any) => void;
  showCompleted: boolean;
  setShowCompleted: (v: boolean) => void;
  hideDetailsOptions: { hideDateTime: boolean; hideStatus: boolean; hideSubtasks: boolean };
  setHideDetailsOptions: (v: { hideDateTime: boolean; hideStatus: boolean; hideSubtasks: boolean }) => void;
  compactMode: boolean;
  setCompactMode: (v: boolean) => void;
  setIsTaskOptionsOpen: (v: boolean) => void;
  groupByOption: string;
  setGroupByOption: (v: any) => void;
  setIsFilterSheetOpen: (v: boolean) => void;
  setIsDuplicateSheetOpen: (v: boolean) => void;
  setIsBatchTaskOpen: (v: boolean) => void;
  handleAddSection: (position: string) => void;
  setIsFolderManageOpen: (v: boolean) => void;
  setIsSelectionMode: (v: boolean) => void;
  setIsSelectActionsOpen: (v: boolean) => void;
  viewMode: string;
  setViewMode: (v: any) => void;
}

export const TodoOptionsDropdown = ({
  dropdownView,
  setDropdownView,
  requireFeature,
  isPro,
  smartList,
  setSmartList,
  smartListData,
  customSmartViews,
  setCustomSmartViews,
  activeCustomViewId,
  setActiveCustomViewId,
  setDateFilter,
  setPriorityFilter,
  setStatusFilter,
  setTagFilter,
  setSelectedFolderId,
  sortBy,
  setSortBy,
  showCompleted,
  setShowCompleted,
  hideDetailsOptions,
  setHideDetailsOptions,
  compactMode,
  setCompactMode,
  setIsTaskOptionsOpen,
  groupByOption,
  setGroupByOption,
  setIsFilterSheetOpen,
  setIsDuplicateSheetOpen,
  setIsBatchTaskOpen,
  handleAddSection,
  setIsFolderManageOpen,
  setIsSelectionMode,
  setIsSelectActionsOpen,
  viewMode,
  setViewMode,
}: TodoOptionsDropdownProps) => {
  const { t } = useTranslation();
  const [isImportOpen, setIsImportOpen] = useState(false);

  return (
    <>
    <DropdownMenu onOpenChange={(open) => { if (!open) setDropdownView('main'); }}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9" data-tour="todo-options-menu"><MoreVertical className="h-5 w-5" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-56 max-h-[70vh] overflow-y-auto bg-popover border shadow-lg z-50">
        {/* Main menu */}
        <div className={cn("transition-all duration-200 ease-out", dropdownView === 'main' ? "animate-in slide-in-from-left-full" : "hidden")}>
          {dropdownView === 'main' && (
            <>
              <DropdownMenuItem onClick={(e) => { e.preventDefault(); setDropdownView('smartLists'); }} className="cursor-pointer">
                <Sparkles className="h-4 w-4 mr-2" />
                <span className="flex-1">{t('menu.smartLists')}</span>
                {!isPro && <Crown className="h-3.5 w-3.5 ml-2" fill="#FFD700" color="#FFD700" />}
                
                {smartList !== 'all' && <Badge variant="secondary" className="ml-auto h-5 px-1.5 text-xs mr-1">{t('menu.active')}</Badge>}
                <ChevronRight className="h-4 w-4 ml-auto" />
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.preventDefault(); setDropdownView('sortBy'); }} className="cursor-pointer">
                <ArrowUpDown className="h-4 w-4 mr-2" />{t('menu.sortBy')}<ChevronRight className="h-4 w-4 ml-auto" />
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setShowCompleted(!showCompleted)} className="cursor-pointer">
                {showCompleted ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
                {showCompleted ? t('menu.hideCompleted') : t('menu.showCompleted')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { const allHidden = hideDetailsOptions.hideDateTime && hideDetailsOptions.hideStatus && hideDetailsOptions.hideSubtasks; setHideDetailsOptions({ hideDateTime: !allHidden, hideStatus: !allHidden, hideSubtasks: !allHidden }); }} className="cursor-pointer">
                {(hideDetailsOptions.hideDateTime && hideDetailsOptions.hideStatus && hideDetailsOptions.hideSubtasks) ? <><Eye className="h-4 w-4 mr-2" />{t('menu.showAllDetails')}</> : <><EyeOff className="h-4 w-4 mr-2" />{t('menu.hideAllDetails')}</>}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setCompactMode(!compactMode)} className="cursor-pointer">
                {compactMode ? <LayoutList className="h-4 w-4 mr-2" /> : <LayoutGrid className="h-4 w-4 mr-2" />}
                {compactMode ? t('menu.normalMode') : t('menu.compactMode')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setIsTaskOptionsOpen(true)} className="cursor-pointer"><Settings className="h-4 w-4 mr-2" />{t('menu.detailSettings')}</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={(e) => { e.preventDefault(); setDropdownView('groupBy'); }} className="cursor-pointer">
                <Columns3 className="h-4 w-4 mr-2" />{t('menu.groupBy')}
                {groupByOption !== 'none' && <Badge variant="secondary" className="ml-auto h-5 px-1.5 text-xs mr-1">{groupByOption}</Badge>}
                <ChevronRight className="h-4 w-4 ml-auto" />
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setIsFilterSheetOpen(true)} className="cursor-pointer"><Filter className="h-4 w-4 mr-2" />{t('menu.filter')}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setIsDuplicateSheetOpen(true)} className="cursor-pointer"><Copy className="h-4 w-4 mr-2" />{t('menu.duplicate')}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => { if (!requireFeature('multiple_tasks')) return; setIsBatchTaskOpen(true); }} className="cursor-pointer">
                <ListPlus className="h-4 w-4 mr-2" />
                <span className="flex-1">{t('menu.addMultipleTasks')}</span>
                <Crown className="h-3.5 w-3.5 ml-2" fill="#FFD700" color="#FFD700" />
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleAddSection('below')} className="cursor-pointer"><PlusIcon className="h-4 w-4 mr-2" />{t('menu.sections')}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setIsFolderManageOpen(true)} className="cursor-pointer"><FolderIcon className="h-4 w-4 mr-2" />{t('menu.folders')}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setIsImportOpen(true)} className="cursor-pointer"><Upload className="h-4 w-4 mr-2" />Import Tasks</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => { setIsSelectionMode(true); setIsSelectActionsOpen(true); }} className="cursor-pointer"><MousePointer2 className="h-4 w-4 mr-2" />{t('menu.select')}</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setViewMode('flat')} className={cn("cursor-pointer", viewMode === 'flat' && "bg-accent")}><LayoutList className="h-4 w-4 mr-2" />{t('menu.flatLayout')}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setViewMode('kanban')} className={cn("cursor-pointer", viewMode === 'kanban' && "bg-accent")}><Columns3 className="h-4 w-4 mr-2" />{t('menu.kanbanBoard')}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => { if (!requireFeature('view_mode_status_board')) return; setViewMode('kanban-status'); }} className={cn("cursor-pointer", viewMode === 'kanban-status' && "bg-accent")}>
                <ListChecks className="h-4 w-4 mr-2" />
                <span className="flex-1">{t('menu.statusBoard')}</span>
                <Crown className="h-3.5 w-3.5 ml-2" fill="#FFD700" color="#FFD700" />
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { if (!requireFeature('view_mode_timeline')) return; setViewMode('timeline'); }} className={cn("cursor-pointer", viewMode === 'timeline' && "bg-accent")}>
                <GitBranch className="h-4 w-4 mr-2" />
                <span className="flex-1">{t('menu.timelineBoard')}</span>
                <Crown className="h-3.5 w-3.5 ml-2" fill="#FFD700" color="#FFD700" />
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { if (!requireFeature('view_mode_priority')) return; setViewMode('priority'); }} className={cn("cursor-pointer", viewMode === 'priority' && "bg-accent")}>
                <Flag className="h-4 w-4 mr-2" />
                <span className="flex-1">{t('menu.priorityBoard')}</span>
                <Crown className="h-3.5 w-3.5 ml-2" fill="#FFD700" color="#FFD700" />
              </DropdownMenuItem>
            </>
          )}
        </div>

        {/* Smart Lists submenu */}
        <div className={cn("transition-all duration-200 ease-out", dropdownView === 'smartLists' ? "animate-in slide-in-from-right-full" : "hidden")}>
          {dropdownView === 'smartLists' && (
            <>
              <DropdownMenuItem onClick={(e) => { e.preventDefault(); setDropdownView('main'); }} className="cursor-pointer"><ChevronRight className="h-4 w-4 mr-2 rotate-180" />{t('menu.back')}</DropdownMenuItem>
              <DropdownMenuSeparator />
              {smartListData.smartLists.map((list) => (
                <DropdownMenuItem key={list.id} onClick={() => { if (list.id !== 'all' && !requireFeature('smart_lists')) return; setSmartList(list.id); setActiveCustomViewId(null); }} className={cn("cursor-pointer", smartList === list.id && !activeCustomViewId && "bg-accent")}>
                  {list.icon}<span className={cn("ml-2", list.color)}>{list.label}</span>
                  {list.id !== 'all' && !isPro ? <Crown className="h-3.5 w-3.5 ml-auto" fill="#FFD700" color="#FFD700" /> : smartListData.getCounts[list.id] > 0 && <Badge variant={list.id === 'overdue' ? "destructive" : "secondary"} className="ml-auto">{smartListData.getCounts[list.id]}</Badge>}
                </DropdownMenuItem>
              ))}
              {customSmartViews.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <div className="px-2 py-1.5"><span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Saved Views</span></div>
                  {customSmartViews.map((view) => (
                    <DropdownMenuItem key={view.id} onClick={() => {
                      setDateFilter(view.filters.dateFilter);
                      setPriorityFilter(view.filters.priorityFilter);
                      setStatusFilter(view.filters.statusFilter);
                      setTagFilter(view.filters.tags);
                      setSelectedFolderId(view.filters.folderId);
                      setSmartList('all');
                      setActiveCustomViewId(view.id);
                      toast.success(`Applied "${view.name}" view`);
                    }} className={cn("cursor-pointer group", activeCustomViewId === view.id && "bg-accent")}>
                      <span className="mr-2">{view.icon}</span>
                      <span className="truncate" style={{ color: view.color }}>{view.name}</span>
                      <button onClick={async (e) => {
                        e.stopPropagation();
                        await deleteCustomSmartView(view.id);
                        loadCustomSmartViews().then(setCustomSmartViews);
                        if (activeCustomViewId === view.id) setActiveCustomViewId(null);
                        toast.success(t('smartViews.viewDeleted', 'Smart View deleted'));
                      }} className="opacity-0 group-hover:opacity-100 ml-auto p-1 hover:bg-destructive/10 rounded transition-opacity">
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </button>
                    </DropdownMenuItem>
                  ))}
                </>
              )}
            </>
          )}
        </div>

        {/* Sort By submenu */}
        <div className={cn("transition-all duration-200 ease-out", dropdownView === 'sortBy' ? "animate-in slide-in-from-right-full" : "hidden")}>
          {dropdownView === 'sortBy' && (
            <>
              <DropdownMenuItem onClick={(e) => { e.preventDefault(); setDropdownView('main'); }} className="cursor-pointer"><ChevronRight className="h-4 w-4 mr-2 rotate-180" />{t('menu.back')}</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setSortBy('date')} className={cn("cursor-pointer", sortBy === 'date' && "bg-accent")}><CalendarIcon2 className="h-4 w-4 mr-2 text-info" />{t('menu.dueDate')}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy('priority')} className={cn("cursor-pointer", sortBy === 'priority' && "bg-accent")}><Flame className="h-4 w-4 mr-2 text-streak" />{t('menu.priority')}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy('name')} className={cn("cursor-pointer", sortBy === 'name' && "bg-accent")}><ArrowDownAZ className="h-4 w-4 mr-2 text-accent-purple" />{t('menu.name')}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy('created')} className={cn("cursor-pointer", sortBy === 'created' && "bg-accent")}><Clock className="h-4 w-4 mr-2 text-success" />{t('menu.createdTime')}</DropdownMenuItem>
            </>
          )}
        </div>

        {/* Group By submenu */}
        <div className={cn("transition-all duration-200 ease-out", dropdownView === 'groupBy' ? "animate-in slide-in-from-right-full" : "hidden")}>
          {dropdownView === 'groupBy' && (
            <>
              <DropdownMenuItem onClick={(e) => { e.preventDefault(); setDropdownView('main'); }} className="cursor-pointer"><ChevronRight className="h-4 w-4 mr-2 rotate-180" />{t('menu.back')}</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setGroupByOption('none')} className={cn("cursor-pointer", groupByOption === 'none' && "bg-accent")}><LayoutList className="h-4 w-4 mr-2 text-muted-foreground" />{t('menu.noGrouping')}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setGroupByOption('section')} className={cn("cursor-pointer", groupByOption === 'section' && "bg-accent")}><Columns3 className="h-4 w-4 mr-2 text-info" />{t('menu.bySection')}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setGroupByOption('priority')} className={cn("cursor-pointer", groupByOption === 'priority' && "bg-accent")}><Flag className="h-4 w-4 mr-2 text-streak" />{t('menu.byPriority')}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setGroupByOption('date')} className={cn("cursor-pointer", groupByOption === 'date' && "bg-accent")}><CalendarIcon2 className="h-4 w-4 mr-2 text-success" />{t('menu.byDueDate')}</DropdownMenuItem>
            </>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
    <ImportDataSheet isOpen={isImportOpen} onClose={() => setIsImportOpen(false)} />
    </>
  );
};
