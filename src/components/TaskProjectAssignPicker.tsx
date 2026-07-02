import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Users, Plus, Check, User as UserIcon, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProjects, useProjectMembers } from '@/hooks/useProjects';
import { useHasTeamPlan } from '@/hooks/useHasTeamPlan';
import { toast } from 'sonner';

interface Props {
  projectId?: string;
  assigneeId?: string;
  onChange: (patch: { projectId?: string; assigneeId?: string }) => void;
  compact?: boolean;
  /** When true, assignment requires Teams/Family plan. Triggers upsell otherwise. */
  gateAssignBehindTeamPlan?: boolean;
}

/**
 * Compact chip-style picker used inside TaskInputSheet + TaskDetailPage.
 * Lets the user pick which team project a task belongs to and who it's assigned to.
 */
export function TaskProjectAssignPicker({ projectId, assigneeId, onChange, compact, gateAssignBehindTeamPlan }: Props) {
  const { projects, createProject } = useProjects();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const hasTeamPlan = useHasTeamPlan();
  const navigate = useNavigate();
  const assignLocked = !!gateAssignBehindTeamPlan && !hasTeamPlan;

  const currentProject = useMemo(() => projects.find((p) => p.id === projectId), [projects, projectId]);
  const { members } = useProjectMembers(projectId ?? null);
  const assignee = members.find((m) => m.user_id === assigneeId);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      const proj = await createProject(name);
      onChange({ projectId: proj.id, assigneeId: undefined });
      setNewName(''); setCreating(false);
    } catch { /* ignore */ }
  };

  return (
    <div className={cn('flex gap-2 flex-wrap', compact && 'gap-1')}>
      <Popover>
        <PopoverTrigger asChild>
          <button className={cn(
            'relative flex items-center gap-1.5 px-3 py-2 rounded-md border transition-all whitespace-nowrap',
            projectId ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30' : 'border-border bg-card hover:bg-muted',
          )}>
            <Users className={cn('h-4 w-4', projectId ? 'text-indigo-500' : 'text-muted-foreground')} />
            <span className={cn('text-sm truncate max-w-[140px]', projectId ? 'text-indigo-600 dark:text-indigo-400' : 'text-muted-foreground')}>
              {currentProject?.name ?? 'Project'}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-2" align="start">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground px-2 py-1">Team projects</div>
          <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted text-sm"
            onClick={() => onChange({ projectId: undefined, assigneeId: undefined })}>
            <UserIcon className="h-4 w-4" /> Personal (no project)
            {!projectId && <Check className="h-4 w-4 ml-auto" />}
          </button>
          {projects.map((p) => (
            <button key={p.id}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted text-sm"
              onClick={() => onChange({ projectId: p.id, assigneeId: undefined })}>
              <span className="h-2 w-2 rounded-full" style={{ background: p.color ?? '#6366f1' }} />
              <span className="truncate">{p.name}</span>
              {p.id === projectId && <Check className="h-4 w-4 ml-auto" />}
            </button>
          ))}
          <div className="border-t my-1" />
          {creating ? (
            <div className="flex gap-1 px-1 pt-1">
              <Input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                placeholder="Project name" className="h-8 text-sm" />
              <Button size="sm" className="h-8" onClick={handleCreate}>Create</Button>
            </div>
          ) : (
            <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted text-sm text-primary"
              onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> New project
            </button>
          )}
        </PopoverContent>
      </Popover>

      {projectId && (
        assignLocked ? (
          <button
            type="button"
            onClick={() => {
              toast.info('Assigning tasks is a Teams/Family plan feature.');
              navigate('/premium');
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-dashed border-amber-400 bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 hover:bg-amber-100/70 transition-all whitespace-nowrap"
          >
            <Lock className="h-3.5 w-3.5" />
            <span className="text-sm">Assign · Teams</span>
          </button>
        ) : (
        <Popover>
          <PopoverTrigger asChild>
            <button className={cn(
              'flex items-center gap-1.5 px-3 py-2 rounded-md border transition-all whitespace-nowrap',
              assigneeId ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30' : 'border-border bg-card hover:bg-muted',
            )}>
              {assignee ? (
                <Avatar className="h-4 w-4">
                  {assignee.avatar_url && <AvatarImage src={assignee.avatar_url} />}
                  <AvatarFallback className="text-[9px]">
                    {(assignee.display_name || assignee.email || '?').charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              ) : (
                <UserIcon className="h-4 w-4 text-muted-foreground" />
              )}
              <span className={cn('text-sm truncate max-w-[110px]', assigneeId ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')}>
                {assignee ? (assignee.display_name || assignee.email || 'Member') : 'Assign'}
              </span>
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2" align="start">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground px-2 py-1">Assign to</div>
            <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted text-sm"
              onClick={() => onChange({ projectId, assigneeId: undefined })}>
              <UserIcon className="h-4 w-4" /> Unassigned
              {!assigneeId && <Check className="h-4 w-4 ml-auto" />}
            </button>
            {members.map((m) => (
              <button key={m.user_id}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted text-sm"
                onClick={() => onChange({ projectId, assigneeId: m.user_id })}>
                <Avatar className="h-5 w-5">
                  {m.avatar_url && <AvatarImage src={m.avatar_url} />}
                  <AvatarFallback className="text-[9px]">
                    {(m.display_name || m.email || '?').charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="truncate">{m.display_name || m.email || m.user_id.slice(0, 8)}</span>
                {m.user_id === assigneeId && <Check className="h-4 w-4 ml-auto" />}
              </button>
            ))}
          </PopoverContent>
        </Popover>
        )
      )}
    </div>
  );
}
