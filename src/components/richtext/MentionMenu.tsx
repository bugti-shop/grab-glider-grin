import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileText, ListTodo, Loader2 } from 'lucide-react';
import { loadNotesMetadataFromDB } from '@/utils/noteStorage';
import { loadTasksFromDB } from '@/utils/taskStorage';

export interface MentionItem {
  id: string;
  type: 'note' | 'task';
  label: string;
  hint?: string;
}

interface MentionMenuProps {
  open: boolean;
  position: { top: number; left: number };
  query: string;
  activeIndex: number;
  onActiveIndexChange: (i: number) => void;
  onSelect: (item: MentionItem) => void;
  onClose: () => void;
  onItemsCountChange: (n: number) => void;
}

export const MentionMenu = ({
  open, position, query, activeIndex, onActiveIndexChange, onSelect, onClose, onItemsCountChange,
}: MentionMenuProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const selectLockRef = useRef(false);
  const pointerStartRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const [items, setItems] = useState<MentionItem[]>([]);
  const [loading, setLoading] = useState(false);

  const emitSelect = useCallback((item: MentionItem) => {
    if (selectLockRef.current) return;
    selectLockRef.current = true;
    onSelect(item);
    window.setTimeout(() => { selectLockRef.current = false; }, 250);
  }, [onSelect]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all([loadNotesMetadataFromDB().catch(() => []), loadTasksFromDB().catch(() => [])])
      .then(([notes, tasks]) => {
        const noteItems: MentionItem[] = (notes || []).map((n: any) => ({
          id: n.id,
          type: 'note',
          label: n.title?.trim() || n.__contentPreview?.slice(0, 60) || n.content?.slice(0, 60) || 'Untitled note',
        }));
        const taskItems: MentionItem[] = (tasks || []).map((t: any) => ({
          id: t.id,
          type: 'task',
          label: t.text?.trim() || 'Untitled task',
          hint: t.completed ? 'completed' : undefined,
        }));
        setItems([...noteItems, ...taskItems]);
      })
      .finally(() => setLoading(false));
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q ? items.filter(i => i.label.toLowerCase().includes(q)) : items;
    return base.slice(0, 30);
  }, [items, query]);

  useEffect(() => { onItemsCountChange(filtered.length); }, [filtered.length, onItemsCountChange]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      className="fixed z-[60] w-72 max-h-80 overflow-y-auto overscroll-contain rounded-lg border border-border bg-popover shadow-xl"
      style={{ top: position.top, left: position.left }}
      onMouseDown={(e) => {
        if (e.button === 0) e.preventDefault();
      }}
      onTouchMove={(e) => e.stopPropagation()}
    >
      <div className="px-3 py-2 text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border flex items-center justify-between">
        <span>Link a note or task</span>
        {loading && <Loader2 size={12} className="animate-spin" />}
      </div>
      {!loading && filtered.length === 0 && (
        <div className="px-3 py-6 text-center text-xs text-muted-foreground">No matches</div>
      )}
      {filtered.map((item, i) => {
        const active = i === Math.min(activeIndex, filtered.length - 1);
        const Icon = item.type === 'note' ? FileText : ListTodo;
        return (
          <button
            key={`${item.type}-${item.id}`}
            type="button"
            onMouseEnter={() => onActiveIndexChange(i)}
            onPointerDown={(e) => {
              pointerStartRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
              onActiveIndexChange(i);
              if (e.pointerType === 'mouse') e.preventDefault();
            }}
            onPointerUp={(e) => {
              const start = pointerStartRef.current;
              pointerStartRef.current = null;
              if (!start || start.id !== e.pointerId) return;
              const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y);
              if (moved < 10) {
                e.preventDefault();
                emitSelect(item);
              }
            }}
            onClick={(e) => { e.preventDefault(); emitSelect(item); }}
            className={`w-full text-left flex items-center gap-2.5 px-3 py-2 transition-colors ${
              active ? 'bg-accent' : 'hover:bg-accent/60'
            }`}
          >
            <Icon size={14} className={item.type === 'note' ? 'text-blue-500' : 'text-emerald-500'} />
            <div className="flex-1 min-w-0">
              <div className="text-sm text-foreground truncate">{item.label}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                {item.type}{item.hint ? ` • ${item.hint}` : ''}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
};
