import { useState, useEffect, useRef } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useGoogleAuth } from '@/contexts/GoogleAuthContext';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Send, Trash2, Pencil, X, Check } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  addTaskComment,
  deleteTaskComment,
  editTaskComment,
  onTaskCommentsChanged,
  type TaskComment,
} from '@/utils/taskCommentsStorage';

interface TaskCommentSheetProps {
  isOpen: boolean;
  onClose: () => void;
  teamId: string;
  taskId: string;
  taskTitle: string;
}

const formatTime = (timestamp: string): string => {
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
};

export const TaskCommentSheet = ({ isOpen, onClose, teamId, taskId, taskTitle }: TaskCommentSheetProps) => {
  const { t } = useTranslation();
  const { user } = useGoogleAuth();
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [sending, setSending] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen || !teamId || !taskId) return;
    const unsub = onTaskCommentsChanged(teamId, taskId, (data) => {
      setComments(data);
      // Auto-scroll to bottom on new comments
      setTimeout(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
      }, 100);
    });
    return unsub;
  }, [isOpen, teamId, taskId]);

  useEffect(() => {
    if (isOpen) {
      setNewComment('');
      setEditingId(null);
    }
  }, [isOpen]);

  const handleSend = async () => {
    if (!user || !newComment.trim()) return;
    try {
      setSending(true);
      await addTaskComment(teamId, taskId, user.uid, user.name || user.email, newComment, user.picture);
      setNewComment('');
    } catch (e: any) {
      toast.error(e.message || 'Failed to send comment');
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    try {
      await deleteTaskComment(teamId, taskId, commentId);
    } catch (e: any) {
      toast.error(e.message || 'Failed to delete comment');
    }
  };

  const handleEdit = async (commentId: string) => {
    if (!editText.trim()) return;
    try {
      await editTaskComment(teamId, taskId, commentId, editText);
      setEditingId(null);
      setEditText('');
    } catch (e: any) {
      toast.error(e.message || 'Failed to edit comment');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="h-[80vh] flex flex-col p-0">
        <SheetHeader className="px-4 pt-4 pb-2 border-b border-border">
          <SheetTitle className="text-base">
            {t('sharedTasks.comments', 'Comments')}
          </SheetTitle>
          <p className="text-xs text-muted-foreground truncate">{taskTitle}</p>
        </SheetHeader>

        {/* Comments list */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {comments.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center gap-2 py-12">
              <p className="text-sm text-muted-foreground">
                {t('sharedTasks.noComments', 'No comments yet. Start the discussion!')}
              </p>
            </div>
          ) : (
            comments.map((comment) => {
              const isOwn = comment.authorUid === user?.uid;
              const isEditing = editingId === comment.id;

              return (
                <div
                  key={comment.id}
                  className={cn(
                    "flex gap-2.5 group",
                    isOwn && "flex-row-reverse",
                  )}
                >
                  <Avatar className="h-7 w-7 flex-shrink-0 mt-0.5">
                    <AvatarImage src={comment.authorPhoto} />
                    <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                      {comment.authorName?.[0]?.toUpperCase() || '?'}
                    </AvatarFallback>
                  </Avatar>

                  <div className={cn("max-w-[75%] min-w-0", isOwn && "items-end")}>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[11px] font-medium text-foreground">
                        {isOwn ? t('common.you', 'You') : comment.authorName?.split(' ')[0]}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {formatTime(comment.createdAt)}
                      </span>
                      {comment.editedAt && (
                        <span className="text-[10px] text-muted-foreground italic">
                          ({t('common.edited', 'edited')})
                        </span>
                      )}
                    </div>

                    {isEditing ? (
                      <div className="flex items-center gap-1">
                        <Input
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          className="h-8 text-sm"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleEdit(comment.id);
                            if (e.key === 'Escape') { setEditingId(null); setEditText(''); }
                          }}
                        />
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleEdit(comment.id)}>
                          <Check className="h-3.5 w-3.5 text-primary" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingId(null); setEditText(''); }}>
                          <X className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      </div>
                    ) : (
                      <div className={cn(
                        "rounded-xl px-3 py-2 text-sm relative",
                        isOwn
                          ? "bg-primary text-primary-foreground rounded-tr-sm"
                          : "bg-muted text-foreground rounded-tl-sm",
                      )}>
                        <p className="whitespace-pre-wrap break-words">{comment.text}</p>

                        {/* Edit/delete actions for own comments */}
                        {isOwn && (
                          <div className="absolute -left-16 top-1/2 -translate-y-1/2 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => { setEditingId(comment.id); setEditText(comment.text); }}
                              className="p-1 rounded hover:bg-muted"
                            >
                              <Pencil className="h-3 w-3 text-muted-foreground" />
                            </button>
                            <button
                              onClick={() => handleDelete(comment.id)}
                              className="p-1 rounded hover:bg-destructive/10"
                            >
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Input bar */}
        <div className="border-t border-border px-4 py-3 flex items-center gap-2">
          <Input
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder={t('sharedTasks.writeComment', 'Write a comment...')}
            className="flex-1 h-10"
            onKeyDown={handleKeyDown}
            disabled={sending}
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={sending || !newComment.trim()}
            className="h-10 w-10 flex-shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};
