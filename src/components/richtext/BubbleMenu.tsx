import { useEffect, useRef, useState } from 'react';
import { Bold, Italic, Underline as UnderlineIcon, Strikethrough, Code, Link as LinkIcon, MessageSquare, Wand2 } from 'lucide-react';

interface BubbleMenuProps {
  editorRef: React.RefObject<HTMLDivElement>;
  onCommand: (cmd: 'bold' | 'italic' | 'underline' | 'strike' | 'code' | 'link' | 'comment' | 'markdown') => void;
}

export const BubbleMenu = ({ editorRef, onCommand }: BubbleMenuProps) => {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) { setVisible(false); return; }
      const range = sel.getRangeAt(0);
      const editor = editorRef.current;
      if (!editor) { setVisible(false); return; }
      // Only show when selection is inside the editor
      if (!editor.contains(range.commonAncestorContainer)) { setVisible(false); return; }
      const rect = range.getBoundingClientRect();
      if (!rect.width && !rect.height) { setVisible(false); return; }
      setPos({
        top: Math.max(8, rect.top - 72),
        left: Math.max(8, rect.left + rect.width / 2 - 160),
      });
      setVisible(true);
    };
    document.addEventListener('selectionchange', update);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      document.removeEventListener('selectionchange', update);
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [editorRef]);

  if (!visible) return null;

  const btn = 'p-2.5 rounded-md hover:bg-accent text-foreground transition-colors';

  return (
    <div
      ref={ref}
      className="fixed z-[9999] flex items-center gap-1 px-2 py-2 rounded-xl border border-border bg-popover shadow-2xl"
      style={{ top: pos.top, left: pos.left }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <button type="button" className={btn} onClick={() => onCommand('bold')} title="Bold"><Bold size={18} /></button>
      <button type="button" className={btn} onClick={() => onCommand('italic')} title="Italic"><Italic size={18} /></button>
      <button type="button" className={btn} onClick={() => onCommand('underline')} title="Underline"><UnderlineIcon size={18} /></button>
      <button type="button" className={btn} onClick={() => onCommand('strike')} title="Strikethrough"><Strikethrough size={18} /></button>
      <button type="button" className={btn} onClick={() => onCommand('code')} title="Inline code"><Code size={18} /></button>
      <div className="w-px h-5 bg-border mx-1" />
      <button type="button" className={btn} onClick={() => onCommand('link')} title="Insert link"><LinkIcon size={18} /></button>
      <button type="button" className={btn} onClick={() => onCommand('comment')} title="Add comment"><MessageSquare size={18} /></button>
      <div className="w-px h-5 bg-border mx-1" />
      <button
        type="button"
        className={btn + ' flex items-center gap-1 text-xs font-medium'}
        onClick={() => onCommand('markdown')}
        title="Convert selection from Markdown"
      >
        <Wand2 size={16} />
        <span className="hidden sm:inline">Markdown</span>
      </button>
    </div>
  );
};
