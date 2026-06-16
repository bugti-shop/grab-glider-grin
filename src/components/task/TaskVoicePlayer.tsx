import { useState, useRef, useEffect } from 'react';
import { Play, Pause } from 'lucide-react';
import { WaveformProgressBar } from '@/components/WaveformProgressBar';
import { resolveTaskMediaUrl } from '@/utils/todoItemsStorage';

const PLAYBACK_SPEEDS = [0.5, 1, 1.5, 2];

interface TaskVoicePlayerProps {
  audioUrl: string;
  duration: number;
}

const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const TaskVoicePlayer = ({ audioUrl, duration }: TaskVoicePlayerProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(duration);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    resolveTaskMediaUrl(audioUrl).then(url => {
      if (url) setResolvedUrl(url);
    });
  }, [audioUrl]);

  const handlePlay = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setIsPlaying(false);
      setProgress(0);
      setCurrentTime(0);
      return;
    }

    const url = await resolveTaskMediaUrl(audioUrl);
    if (!url) return;

    const audio = new Audio(url);
    audio.playbackRate = playbackSpeed;
    audioRef.current = audio;

    audio.ontimeupdate = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        setProgress((audio.currentTime / audio.duration) * 100);
        setCurrentTime(audio.currentTime);
      }
    };
    audio.onloadedmetadata = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        setAudioDuration(Math.round(audio.duration));
      }
    };
    audio.onended = () => {
      setIsPlaying(false);
      setProgress(0);
      setCurrentTime(0);
      audioRef.current = null;
    };

    audio.play();
    setIsPlaying(true);
  };

  const cycleSpeed = (e: React.MouseEvent) => {
    e.stopPropagation();
    const idx = PLAYBACK_SPEEDS.indexOf(playbackSpeed);
    const newSpeed = PLAYBACK_SPEEDS[(idx + 1) % PLAYBACK_SPEEDS.length];
    setPlaybackSpeed(newSpeed);
    if (audioRef.current) audioRef.current.playbackRate = newSpeed;
  };

  const handleSeek = (percent: number) => {
    if (audioRef.current) {
      const dur = audioRef.current.duration || audioDuration || duration;
      if (dur && !isNaN(dur)) {
        audioRef.current.currentTime = (percent / 100) * dur;
        setProgress(percent);
        setCurrentTime((percent / 100) * dur);
      }
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handlePlay}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 hover:bg-primary/20 transition-colors min-w-0 flex-1"
      >
        {isPlaying ? (
          <Pause className="h-4 w-4 text-primary flex-shrink-0" />
        ) : (
          <Play className="h-4 w-4 text-primary flex-shrink-0" />
        )}
        <div className="flex-1 flex flex-col gap-0.5 min-w-0">
          {resolvedUrl ? (
            <WaveformProgressBar
              audioUrl={resolvedUrl}
              progress={progress}
              duration={audioDuration || duration}
              isPlaying={isPlaying}
              onSeek={handleSeek}
              height={12}
            />
          ) : (
            <div className="relative h-1.5 bg-primary/20 rounded-full overflow-hidden">
              <div
                className="absolute h-full bg-primary rounded-full transition-all duration-100"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-primary font-medium">
              {isPlaying ? formatDuration(Math.round(currentTime)) : '0:00'}
            </span>
            <span className="text-primary/70">
              {formatDuration(audioDuration || duration)}
            </span>
          </div>
        </div>
      </button>
      <button
        onClick={cycleSpeed}
        className="px-2 py-1 text-xs font-semibold rounded-md bg-muted hover:bg-muted/80 transition-colors min-w-[40px]"
      >
        {playbackSpeed}x
      </button>
    </div>
  );
};
