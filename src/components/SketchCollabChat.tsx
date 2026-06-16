import { memo, useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageSquare, Send, X, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CollabChatMessage } from '@/utils/sketchCollaboration';

interface SketchCollabChatProps {
  messages: CollabChatMessage[];
  unreadCount: number;
  myUserId: string;
  onSend: (text: string) => void;
  onOpen: () => void;
}

export const SketchCollabChat = memo(({ messages, unreadCount, myUserId, onSend, onOpen }: SketchCollabChatProps) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, isOpen]);

  const handleOpen = useCallback(() => {
    setIsOpen(true);
    onOpen();
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [onOpen]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  const handleSend = useCallback(() => {
    if (!input.trim()) return;
    onSend(input.trim());
    setInput('');
  }, [input, onSend]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (!isOpen) {
    return (
      <button
        onClick={handleOpen}
        className="fixed bottom-20 right-3 z-50 h-11 w-11 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
      >
        <MessageSquare className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 h-5 min-w-5 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="fixed bottom-16 right-2 z-50 w-72 max-h-[60vh] flex flex-col bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold text-foreground">Chat</span>
          <span className="text-[10px] text-muted-foreground">({messages.length})</span>
        </div>
        <button onClick={handleClose} className="h-6 w-6 rounded-full flex items-center justify-center hover:bg-muted transition-colors">
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-2 min-h-[120px] max-h-[40vh]">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <MessageSquare className="h-8 w-8 text-muted-foreground/30 mb-2" />
            <p className="text-[11px] text-muted-foreground">No messages yet</p>
            <p className="text-[10px] text-muted-foreground/60">Start chatting with collaborators!</p>
          </div>
        )}
        {messages.map((msg, i) => {
          const isMe = msg.userId === myUserId;
          const showName = !isMe && (i === 0 || messages[i - 1]?.userId !== msg.userId);
          return (
            <div key={msg.id || i} className={cn('flex flex-col', isMe ? 'items-end' : 'items-start')}>
              {showName && (
                <span className="text-[10px] font-medium mb-0.5 px-1" style={{ color: msg.userColor }}>
                  {msg.userName}
                </span>
              )}
              <div
                className={cn(
                  'px-2.5 py-1.5 rounded-2xl max-w-[85%] text-xs leading-relaxed break-words',
                  isMe
                    ? 'bg-primary text-primary-foreground rounded-br-md'
                    : 'bg-muted text-foreground rounded-bl-md'
                )}
                style={!isMe ? { borderLeft: `2px solid ${msg.userColor}` } : undefined}
              >
                {msg.text}
              </div>
              <span className="text-[9px] text-muted-foreground/50 mt-0.5 px-1">
                {formatTime(msg.timestamp)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Input */}
      <div className="px-2 py-2 border-t border-border bg-muted/20">
        <div className="flex items-center gap-1.5">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('collab.typeMessage', 'Type a message...')}
            className="flex-1 h-8 px-3 rounded-full text-xs bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            maxLength={500}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className={cn(
              'h-8 w-8 rounded-full flex items-center justify-center transition-all',
              input.trim()
                ? 'bg-primary text-primary-foreground hover:scale-105 active:scale-95'
                : 'bg-muted text-muted-foreground cursor-not-allowed'
            )}
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
});

SketchCollabChat.displayName = 'SketchCollabChat';
