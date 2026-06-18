import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Menu, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from '@hello-pangea/dnd';
import {
  addHabitSection,
  deleteHabitSection,
  loadHabitSections,
  renameHabitSection,
  reorderHabitSections,
} from '@/utils/habitSectionsStorage';
import { HabitSection } from '@/types/habit';
import { cn } from '@/lib/utils';

const HabitSections = () => {
  const navigate = useNavigate();
  const [sections, setSections] = useState<HabitSection[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<HabitSection | null>(null);
  const [editName, setEditName] = useState('');

  const refresh = () => setSections(loadHabitSections());
  useEffect(() => {
    refresh();
  }, []);

  const onDragEnd = (r: DropResult) => {
    if (!r.destination) return;
    const list = Array.from(sections);
    const [moved] = list.splice(r.source.index, 1);
    list.splice(r.destination.index, 0, moved);
    setSections(list);
    reorderHabitSections(list.map((s) => s.id));
  };

  const submitAdd = () => {
    if (!newName.trim()) return;
    addHabitSection(newName.trim());
    setNewName('');
    setShowAdd(false);
    refresh();
  };

  const submitRename = () => {
    if (!editing) return;
    renameHabitSection(editing.id, editName.trim() || editing.name);
    setEditing(null);
    refresh();
  };

  return (
    <div className="min-h-screen bg-muted/30 pb-10">
      <header className="safe-area-top px-4 pt-3 pb-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold text-foreground">Manage Section</h1>
      </header>

      <div className="px-3">
        <div className="bg-background rounded-2xl p-2">
          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="hs">
              {(prov) => (
                <div ref={prov.innerRef} {...prov.droppableProps}>
                  {sections.map((s, i) => (
                    <Draggable key={s.id} draggableId={s.id} index={i}>
                      {(p, snap) => (
                        <div
                          ref={p.innerRef}
                          {...p.draggableProps}
                          className={cn(
                            'flex items-center gap-3 px-3 py-4 border-b border-border/40 last:border-0',
                            snap.isDragging && 'bg-muted'
                          )}
                        >
                          <button
                            onClick={() => {
                              setEditing(s);
                              setEditName(s.name);
                            }}
                            className="flex-1 text-left text-base text-foreground"
                          >
                            {s.name}
                          </button>
                          {sections.length > 1 && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                if (confirm(`Delete section "${s.name}"?`)) {
                                  deleteHabitSection(s.id);
                                  refresh();
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          )}
                          <div {...p.dragHandleProps} className="p-1 touch-none">
                            <Menu className="h-5 w-5 text-muted-foreground" />
                          </div>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {prov.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>

          <button
            onClick={() => setShowAdd(true)}
            className="w-full flex items-center gap-2 px-3 py-4 text-primary"
          >
            <Plus className="h-5 w-5" />
            <span className="text-base font-medium">Add Section</span>
          </button>
        </div>
      </div>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>New Section</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Section name"
            className="h-11"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAdd(false)} className="text-primary">
              Cancel
            </Button>
            <Button onClick={submitAdd}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Rename Section</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className="h-11"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)} className="text-primary">
              Cancel
            </Button>
            <Button onClick={submitRename}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default HabitSections;
