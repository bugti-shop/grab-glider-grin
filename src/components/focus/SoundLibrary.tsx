import { useState } from 'react';
import { X, Music2, Waves, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FOCUS_MUSIC, FOCUS_SOUNDS, FocusTrack } from './FocusSounds';

interface SoundLibraryProps {
  open: boolean;
  onClose: () => void;
  selectedId: string | null;
  onSelect: (track: FocusTrack | null) => void;
  volume: number;
  muted: boolean;
  onVolumeChange: (v: number) => void;
  onMuteToggle: () => void;
}

export const SoundLibrary = ({
  open, onClose, selectedId, onSelect, volume, muted, onVolumeChange, onMuteToggle,
}: SoundLibraryProps) => {
  const [tab, setTab] = useState<'music' | 'sound'>('sound');
  if (!open) return null;
  const list = tab === 'music' ? FOCUS_MUSIC : FOCUS_SOUNDS;

  return (
    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-end z-20" onClick={onClose}>
      <div
        className="w-full bg-background text-foreground rounded-t-3xl p-5 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold">Sound Library</h3>
          <button onClick={onClose} className="text-muted-foreground"><X className="h-5 w-5" /></button>
        </div>

        {/* Tabs */}
        {FOCUS_MUSIC.length > 0 && (
          <div className="flex gap-2 p-1 bg-muted rounded-xl mb-3">
            <button
              onClick={() => setTab('sound')}
              className={cn('flex-1 py-2 text-xs font-medium rounded-lg flex items-center justify-center gap-1.5',
                tab === 'sound' ? 'bg-background shadow-sm' : 'text-muted-foreground')}
            >
              <Waves className="h-4 w-4" /> Sounds ({FOCUS_SOUNDS.length})
            </button>
            <button
              onClick={() => setTab('music')}
              className={cn('flex-1 py-2 text-xs font-medium rounded-lg flex items-center justify-center gap-1.5',
                tab === 'music' ? 'bg-background shadow-sm' : 'text-muted-foreground')}
            >
              <Music2 className="h-4 w-4" /> Music ({FOCUS_MUSIC.length})
            </button>
          </div>
        )}

        {/* Volume */}
        <div className="flex items-center gap-3 mb-4 px-1">
          <button onClick={onMuteToggle} className="h-9 w-9 grid place-items-center rounded-full bg-muted hover:bg-muted/70" aria-label={muted ? 'Unmute' : 'Mute'}>
            {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>
          <input
            type="range" min={0} max={100}
            value={Math.round(volume * 100)}
            onChange={(e) => onVolumeChange(Number(e.target.value) / 100)}
            className="flex-1 accent-primary"
          />
          <span className="text-xs tabular-nums w-8 text-right text-muted-foreground">{muted ? 0 : Math.round(volume * 100)}</span>
        </div>

        {/* Off */}
        <button
          onClick={() => { onSelect(null); }}
          className={cn(
            'w-full mb-2 px-3 py-2.5 rounded-xl border text-sm font-medium text-left transition-colors',
            !selectedId ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted border-transparent hover:bg-muted/70'
          )}
        >
          🔇 No sound (off)
        </button>

        {/* Grid */}
        <div className="grid grid-cols-2 gap-2">
          {list.map(t => (
            <button
              key={t.id}
              onClick={() => onSelect(t)}
              className={cn(
                'flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium text-left transition-colors',
                selectedId === t.id
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-muted border-transparent hover:bg-muted/70'
              )}
            >
              <span className="text-lg shrink-0">{t.emoji}</span>
              <span className="truncate">{t.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
