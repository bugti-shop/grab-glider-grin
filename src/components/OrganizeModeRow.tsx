import { useEffect, useState } from 'react';
import { Folder, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  getOrganizeMode,
  setOrganizeMode,
  type OrganizeMode,
  type OrganizeScope,
} from '@/utils/organizeMode';

interface Props {
  scope: OrganizeScope;
}

/** Compact segmented control for choosing Folders vs Tags as the primary
 *  organization scheme. Reused from both Notes and Tasks settings sheets. */
export const OrganizeModeRow = ({ scope }: Props) => {
  const { t } = useTranslation();
  const [mode, setMode] = useState<OrganizeMode>('folders');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    getOrganizeMode(scope).then((m) => alive && setMode(m));
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ scope: OrganizeScope; mode: OrganizeMode }>).detail;
      if (detail?.scope === scope) setMode(detail.mode);
    };
    window.addEventListener('organizeModeChanged', handler);
    return () => {
      alive = false;
      window.removeEventListener('organizeModeChanged', handler);
    };
  }, [scope]);

  const choose = async (next: OrganizeMode) => {
    if (next === mode || busy) return;
    setBusy(true);
    try {
      await setOrganizeMode(scope, next);
      setMode(next);
      if (next === 'tags') {
        toast.success(
          t(
            'settings.organize.switchedToTags',
            'Switched to Tags — folder names were mirrored as tags.',
          ),
        );
      } else {
        toast.success(
          t('settings.organize.switchedToFolders', 'Switched back to Folders.'),
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const labelFolders = t('settings.organize.folders', 'Folders');
  const labelTags = t('settings.organize.tags', 'Tags');

  return (
    <div className="px-4 py-3 border-b border-border/50">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <span className="text-foreground text-sm block">
            {t('settings.organize.title', 'Organize by')}
          </span>
          <span className="text-xs text-muted-foreground">
            {t(
              'settings.organize.desc',
              'Default is Folders. Switch to Tags to filter by labels instead — your folders stay safe and you can switch back anytime.',
            )}
          </span>
        </div>
      </div>
      <div className="mt-3 inline-flex rounded-lg border border-border p-0.5 bg-muted/40">
        <button
          type="button"
          disabled={busy}
          onClick={() => choose('folders')}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
            mode === 'folders'
              ? 'bg-background shadow-sm text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Folder className="h-3.5 w-3.5" />
          {labelFolders}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => choose('tags')}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
            mode === 'tags'
              ? 'bg-background shadow-sm text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Tag className="h-3.5 w-3.5" />
          {labelTags}
        </button>
      </div>
    </div>
  );
};
