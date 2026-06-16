import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Folder as FolderType } from '@/types/note';
import { Trash2, Edit2, Check, X, FolderPlus, GripVertical, Star, ChevronRight, ChevronDown, icons as LucideIcons } from 'lucide-react';
import { useHardwareBackButton } from '@/hooks/useHardwareBackButton';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FOLDER_ICON_NAMES, getChildFolders, getDescendantFolderIds, wouldCreateCycle, getFolderPath } from '@/utils/folderHelpers';

const FOLDER_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'];
const DEFAULT_ICON = 'Folder';

interface FolderManageSheetProps {
  isOpen: boolean;
  onClose: () => void;
  folders: FolderType[];
  onCreateFolder: (name: string, color: string, icon?: string, parentId?: string) => void;
  onEditFolder: (folderId: string, name: string, color: string, icon?: string, parentId?: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onReorderFolders?: (folders: FolderType[]) => void;
  onToggleFavorite?: (folderId: string) => void;
}

const renderIcon = (iconName: string | undefined, color?: string, size = 16) => {
  const Comp = (LucideIcons as Record<string, any>)[iconName || DEFAULT_ICON] || LucideIcons.Folder;
  return <Comp size={size} style={{ color: color || 'currentColor' }} />;
};

export const FolderManageSheet = ({
  isOpen,
  onClose,
  folders,
  onCreateFolder,
  onEditFolder,
  onDeleteFolder,
  onReorderFolders,
  onToggleFavorite,
}: FolderManageSheetProps) => {
  const { t } = useTranslation();
  const [isCreating, setIsCreating] = useState(false);
  const [createParentId, setCreateParentId] = useState<string | undefined>(undefined);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderColor, setNewFolderColor] = useState(FOLDER_COLORS[0]);
  const [newFolderIcon, setNewFolderIcon] = useState<string>(DEFAULT_ICON);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editIcon, setEditIcon] = useState<string>(DEFAULT_ICON);
  const [editParentId, setEditParentId] = useState<string | undefined>(undefined);
  const [folderToDelete, setFolderToDelete] = useState<FolderType | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination || !onReorderFolders) return;
    const sourceIndex = result.source.index;
    const destIndex = result.destination.index;
    if (sourceIndex === destIndex) return;
    try { await Haptics.impact({ style: ImpactStyle.Medium }); } catch {}
    const reordered = Array.from(folders);
    const [removed] = reordered.splice(sourceIndex, 1);
    reordered.splice(destIndex, 0, removed);
    onReorderFolders(reordered);
  };

  useHardwareBackButton({ onBack: onClose, enabled: isOpen, priority: 'sheet' });

  const handleCreate = () => {
    if (newFolderName.trim()) {
      onCreateFolder(newFolderName.trim(), newFolderColor, newFolderIcon, createParentId);
      setNewFolderName('');
      setNewFolderColor(FOLDER_COLORS[0]);
      setNewFolderIcon(DEFAULT_ICON);
      setCreateParentId(undefined);
      setIsCreating(false);
    }
  };

  const startEdit = (folder: FolderType) => {
    setEditingFolderId(folder.id);
    setEditName(folder.name);
    setEditColor(folder.color || FOLDER_COLORS[0]);
    setEditIcon(folder.icon || DEFAULT_ICON);
    setEditParentId(folder.parentId);
  };

  const handleEdit = () => {
    if (!editingFolderId || !editName.trim()) return;
    if (editParentId && wouldCreateCycle(folders, editingFolderId, editParentId)) {
      // Silently drop invalid parent; user gets visual feedback via the disabled option below.
      return;
    }
    onEditFolder(editingFolderId, editName.trim(), editColor, editIcon, editParentId);
    setEditingFolderId(null);
  };

  const confirmDelete = () => {
    if (folderToDelete) {
      onDeleteFolder(folderToDelete.id);
      setFolderToDelete(null);
    }
  };

  // Build tree-ordered list of (folder, depth) for rendering. Drag&drop still
  // reorders the underlying flat array — parent relationships persist via parentId.
  const treeOrder = useMemo(() => {
    const out: Array<{ folder: FolderType; depth: number; hasChildren: boolean }> = [];
    const walk = (parentId: string | null, depth: number) => {
      const children = getChildFolders(folders, parentId);
      children.forEach((f) => {
        const hasChildren = getChildFolders(folders, f.id).length > 0;
        out.push({ folder: f, depth, hasChildren });
        if (!hasChildren || expanded.has(f.id) || depth === 0) {
          // Always show children of root; nested children require expansion
          if (expanded.has(f.id) || depth === 0) walk(f.id, depth + 1);
        }
      });
    };
    walk(null, 0);
    return out;
  }, [folders, expanded]);

  const renderParentSelect = (
    value: string | undefined,
    onChange: (v: string | undefined) => void,
    excludeId?: string,
  ) => (
    <Select
      value={value || '__root__'}
      onValueChange={(v) => onChange(v === '__root__' ? undefined : v)}
    >
      <SelectTrigger className="h-9">
        <SelectValue placeholder={t('folders.parent', 'Parent (top level)')} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__root__">{t('folders.noParent', '— No parent (top level) —')}</SelectItem>
        {folders.map(f => {
          if (excludeId && (f.id === excludeId || getDescendantFolderIds(folders, excludeId).includes(f.id))) return null;
          const path = getFolderPath(folders, f.id).map(p => p.name).join(' / ');
          return <SelectItem key={f.id} value={f.id}>{path}</SelectItem>;
        })}
      </SelectContent>
    </Select>
  );

  return (
    <>
      <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <SheetContent side="bottom" className="rounded-t-3xl max-h-[85vh]">
          <SheetHeader className="mb-4">
            <SheetTitle>{t('folders.manageFolders')}</SheetTitle>
          </SheetHeader>

          <div className="space-y-4 overflow-y-auto max-h-[70vh] pb-4">
            {isCreating ? (
              <div className="p-3 border rounded-lg space-y-3">
                <Input
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder={t('folders.folderName')}
                  autoFocus
                />
                {/* Parent select */}
                {renderParentSelect(createParentId, setCreateParentId)}
                {/* Color */}
                <div className="flex gap-2 flex-wrap">
                  {FOLDER_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => setNewFolderColor(color)}
                      className="w-8 h-8 rounded-full border-2 transition-all"
                      style={{
                        backgroundColor: color,
                        borderColor: newFolderColor === color ? 'white' : 'transparent',
                        boxShadow: newFolderColor === color ? `0 0 0 2px ${color}` : 'none'
                      }}
                    />
                  ))}
                </div>
                {/* Icon picker */}
                <div className="grid grid-cols-8 gap-1.5 max-h-32 overflow-y-auto p-1 border rounded-md">
                  {FOLDER_ICON_NAMES.map((iconName) => (
                    <button
                      key={iconName}
                      type="button"
                      onClick={() => setNewFolderIcon(iconName)}
                      className={cn(
                        'w-9 h-9 rounded-md flex items-center justify-center transition-all',
                        newFolderIcon === iconName ? 'bg-primary/15 ring-2 ring-primary' : 'hover:bg-muted'
                      )}
                      title={iconName}
                    >
                      {renderIcon(iconName, newFolderColor, 18)}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleCreate} disabled={!newFolderName.trim()}>
                    <Check className="h-4 w-4 mr-1" /> {t('common.create')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setIsCreating(false)}>
                    <X className="h-4 w-4 mr-1" /> {t('common.cancel')}
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" className="w-full" onClick={() => { setCreateParentId(undefined); setIsCreating(true); }}>
                <FolderPlus className="h-4 w-4 mr-2" /> {t('folders.createNewFolder')}
              </Button>
            )}

            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId="folders-list">
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
                    {treeOrder.map(({ folder, depth, hasChildren }, index) => (
                      <Draggable key={folder.id} draggableId={folder.id} index={folders.findIndex(f => f.id === folder.id)}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            className={cn(
                              "p-3 border rounded-lg bg-card",
                              snapshot.isDragging && "shadow-lg ring-2 ring-primary/20"
                            )}
                            style={{ ...provided.draggableProps.style, marginLeft: depth * 18 }}
                          >
                            {editingFolderId === folder.id ? (
                              <div className="space-y-3">
                                <Input value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus />
                                {renderParentSelect(editParentId, setEditParentId, folder.id)}
                                <div className="flex gap-2 flex-wrap">
                                  {FOLDER_COLORS.map((color) => (
                                    <button
                                      key={color}
                                      onClick={() => setEditColor(color)}
                                      className="w-8 h-8 rounded-full border-2 transition-all"
                                      style={{
                                        backgroundColor: color,
                                        borderColor: editColor === color ? 'white' : 'transparent',
                                        boxShadow: editColor === color ? `0 0 0 2px ${color}` : 'none'
                                      }}
                                    />
                                  ))}
                                </div>
                                <div className="grid grid-cols-8 gap-1.5 max-h-32 overflow-y-auto p-1 border rounded-md">
                                  {FOLDER_ICON_NAMES.map((iconName) => (
                                    <button
                                      key={iconName}
                                      type="button"
                                      onClick={() => setEditIcon(iconName)}
                                      className={cn(
                                        'w-9 h-9 rounded-md flex items-center justify-center transition-all',
                                        editIcon === iconName ? 'bg-primary/15 ring-2 ring-primary' : 'hover:bg-muted'
                                      )}
                                      title={iconName}
                                    >
                                      {renderIcon(iconName, editColor, 18)}
                                    </button>
                                  ))}
                                </div>
                                <div className="flex gap-2">
                                  <Button size="sm" onClick={handleEdit}>
                                    <Check className="h-4 w-4 mr-1" /> {t('common.save')}
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => setEditingFolderId(null)}>
                                    <X className="h-4 w-4 mr-1" /> {t('common.cancel')}
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing touch-none">
                                    <GripVertical className="h-4 w-4 text-muted-foreground/50" />
                                  </div>
                                  {hasChildren ? (
                                    <button onClick={() => toggleExpand(folder.id)} className="p-0.5 rounded hover:bg-muted">
                                      {expanded.has(folder.id) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                    </button>
                                  ) : (
                                    <span className="w-5" />
                                  )}
                                  <div
                                    className="w-3 h-3 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: folder.color || FOLDER_COLORS[0] }}
                                  />
                                  {renderIcon(folder.icon, folder.color, 16)}
                                  <span className="font-medium truncate">{folder.name}</span>
                                </div>
                                <div className="flex gap-1 flex-shrink-0">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    title={t('folders.addSubfolder', 'Add subfolder')}
                                    onClick={() => {
                                      setCreateParentId(folder.id);
                                      setIsCreating(true);
                                      setExpanded(prev => new Set(prev).add(folder.id));
                                    }}
                                  >
                                    <FolderPlus className="h-4 w-4" />
                                  </Button>
                                  {onToggleFavorite && (
                                    <Button size="icon" variant="ghost" onClick={() => onToggleFavorite(folder.id)}>
                                      <Star className={cn("h-4 w-4", folder.isFavorite ? "fill-warning text-warning" : "text-muted-foreground")} />
                                    </Button>
                                  )}
                                  <Button size="icon" variant="ghost" onClick={() => startEdit(folder)}>
                                    <Edit2 className="h-4 w-4" />
                                  </Button>
                                  <Button size="icon" variant="ghost" onClick={() => setFolderToDelete(folder)}>
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>

            {folders.length === 0 && !isCreating && (
              <p className="text-center text-muted-foreground py-8">{t('common.noFoldersYet')}</p>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!folderToDelete} onOpenChange={(open) => !open && setFolderToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('folders.deleteFolder')}</AlertDialogTitle>
            <AlertDialogDescription>
              {folderToDelete && getDescendantFolderIds(folders, folderToDelete.id).length > 0
                ? t('folders.deleteFolderWithChildrenDesc', 'This folder and all its subfolders will be deleted. Tasks in them will become unassigned.')
                : t('folders.deleteFolderDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground">
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
