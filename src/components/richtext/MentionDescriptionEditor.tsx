import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { sanitizeHtml } from '@/lib/sanitize';
import { MentionItem, MentionMenu } from './MentionMenu';
import { getCaretRect, mentionHTML, removeAdjacentMention, replaceTriggerAndInsert } from './richTextBlocks';
import { RICH_TEXT_EDITOR_STYLES } from './richTextStyles';

interface MentionDescriptionEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: number;
  onFocus?: () => void;
  onBlur?: () => void;
}

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

const looksLikeHtml = (value: string) => /<\/?[a-z][\s\S]*>/i.test(value);

const normalizeEmptyHtml = (html: string) => {
  const text = html.replace(/<br\s*\/?>/gi, '').replace(/&nbsp;/gi, '').replace(/<[^>]+>/g, '').trim();
  return text ? html : '';
};

export const descriptionToDisplayHtml = (value: string) => {
  if (!value) return '';
  const html = looksLikeHtml(value)
    ? value
    : escapeHtml(value).replace(/\n/g, '<br>');
  return sanitizeHtml(html);
};

export const MentionDescriptionEditor = ({
  value,
  onChange,
  placeholder,
  className,
  minHeight = 96,
  onFocus,
  onBlur,
}: MentionDescriptionEditorProps) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const mentionRangeRef = useRef<Range | null>(null);
  const lastHtmlRef = useRef('');
  const [mentionMenu, setMentionMenu] = useState({
    open: false,
    query: '',
    top: 0,
    left: 0,
    activeIndex: 0,
    triggerLen: 0,
    itemCount: 0,
  });

  const closeMention = useCallback(() => {
    mentionRangeRef.current = null;
    setMentionMenu((m) => ({ ...m, open: false }));
  }, []);

  useEffect(() => {
    const next = descriptionToDisplayHtml(value);
    const el = editorRef.current;
    if (!el || document.activeElement === el || next === lastHtmlRef.current) return;
    el.innerHTML = next;
    lastHtmlRef.current = next;
  }, [value]);

  const detectMentionTrigger = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) { closeMention(); return; }
    const range = sel.getRangeAt(0);
    if (!editorRef.current?.contains(range.startContainer)) { closeMention(); return; }
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) { closeMention(); return; }
    const text = node.textContent || '';
    const before = text.slice(0, range.startOffset);
    const match = before.match(/(^|[\s\u00A0])@([\w-]{0,40})$/);
    if (!match) { closeMention(); return; }
    const rect = getCaretRect();
    if (!rect) return;
    mentionRangeRef.current = range.cloneRange();
    setMentionMenu((m) => ({
      ...m,
      open: true,
      query: match[2],
      top: rect.bottom + 4,
      left: Math.min(rect.left, window.innerWidth - 300),
      activeIndex: 0,
      triggerLen: 1 + match[2].length,
    }));
  }, [closeMention]);

  const emitChange = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const html = normalizeEmptyHtml(el.innerHTML);
    lastHtmlRef.current = html;
    onChange(html);
    detectMentionTrigger();
  }, [detectMentionTrigger, onChange]);

  const insertMention = useCallback((item: MentionItem) => {
    const range = mentionRangeRef.current?.cloneRange() ?? null;
    const triggerLen = mentionMenu.triggerLen;
    closeMention();
    editorRef.current?.focus({ preventScroll: true });
    replaceTriggerAndInsert(triggerLen, mentionHTML(item.type, item.id, item.label), range);
    window.setTimeout(emitChange, 0);
  }, [closeMention, emitChange, mentionMenu.triggerLen]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.key === 'Backspace' || e.key === 'Delete') && removeAdjacentMention(e.key === 'Backspace' ? 'backward' : 'forward', editorRef.current)) {
      e.preventDefault();
      emitChange();
      return;
    }

    if (!mentionMenu.open) return;
    if (e.key === 'Escape') { e.preventDefault(); closeMention(); return; }
    if (!mentionMenu.itemCount) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setMentionMenu((m) => ({ ...m, activeIndex: (m.activeIndex + 1) % m.itemCount }));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setMentionMenu((m) => ({ ...m, activeIndex: (m.activeIndex - 1 + m.itemCount) % m.itemCount }));
    }
  };

  return (
    <div className="relative">
      <style>{`${RICH_TEXT_EDITOR_STYLES}
        .mention-description-editor:empty::before {
          content: attr(data-placeholder);
          color: hsl(var(--muted-foreground) / 0.5);
          pointer-events: none;
        }
      `}</style>
      <div
        ref={editorRef}
        contentEditable
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder}
        onInput={emitChange}
        onKeyDown={handleKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
        className={cn(
          'mention-description-editor rich-text-editor w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary',
          className,
        )}
        style={{ minHeight }}
        suppressContentEditableWarning
      />
      <MentionMenu
        open={mentionMenu.open}
        position={{ top: mentionMenu.top, left: mentionMenu.left }}
        query={mentionMenu.query}
        activeIndex={mentionMenu.activeIndex}
        onActiveIndexChange={(i) => setMentionMenu((m) => ({ ...m, activeIndex: i }))}
        onSelect={insertMention}
        onClose={closeMention}
        onItemsCountChange={(n) => setMentionMenu((m) => (m.itemCount === n ? m : { ...m, itemCount: n }))}
      />
    </div>
  );
};