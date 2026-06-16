import { useState, useRef, useCallback } from 'react';
import { TodoItem } from '@/types/note';
import { resolveTaskMediaUrl } from '@/utils/todoItemsStorage';

const VOICE_PLAYBACK_SPEEDS = [0.5, 1, 1.5, 2];

export const useVoicePlayback = () => {
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [voiceProgress, setVoiceProgress] = useState(0);
  const [voiceCurrentTime, setVoiceCurrentTime] = useState(0);
  const [voiceDuration, setVoiceDuration] = useState<Record<string, number>>({});
  const [voicePlaybackSpeed, setVoicePlaybackSpeed] = useState(1);
  const [resolvedVoiceUrls, setResolvedVoiceUrls] = useState<Record<string, string>>({});
  const flatAudioRef = useRef<HTMLAudioElement | null>(null);

  const resolveVoiceUrls = useCallback(async (items: TodoItem[]) => {
    const voiceItems = items.filter(item => item.voiceRecording?.audioUrl);
    for (const item of voiceItems) {
      if (item.voiceRecording && !resolvedVoiceUrls[item.id]) {
        const url = await resolveTaskMediaUrl(item.voiceRecording.audioUrl);
        if (url) setResolvedVoiceUrls(prev => ({ ...prev, [item.id]: url }));
      }
    }
  }, [resolvedVoiceUrls]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleFlatVoicePlay = useCallback(async (item: TodoItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!item.voiceRecording) return;
    if (playingVoiceId === item.id && flatAudioRef.current) {
      flatAudioRef.current.pause();
      flatAudioRef.current = null;
      setPlayingVoiceId(null);
      setVoiceProgress(0);
      setVoiceCurrentTime(0);
      return;
    }
    if (flatAudioRef.current) {
      flatAudioRef.current.pause();
      flatAudioRef.current = null;
    }
    const audioUrl = await resolveTaskMediaUrl(item.voiceRecording.audioUrl);
    if (!audioUrl) return;
    const audio = new Audio(audioUrl);
    audio.playbackRate = voicePlaybackSpeed;
    flatAudioRef.current = audio;
    audio.ontimeupdate = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        setVoiceProgress((audio.currentTime / audio.duration) * 100);
        setVoiceCurrentTime(audio.currentTime);
      }
    };
    audio.onloadedmetadata = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        setVoiceDuration(prev => ({ ...prev, [item.id]: Math.round(audio.duration) }));
      }
    };
    audio.onended = () => {
      setPlayingVoiceId(null);
      setVoiceProgress(0);
      setVoiceCurrentTime(0);
      flatAudioRef.current = null;
    };
    audio.play();
    setPlayingVoiceId(item.id);
  }, [playingVoiceId, voicePlaybackSpeed]);

  const cycleVoicePlaybackSpeed = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const currentIndex = VOICE_PLAYBACK_SPEEDS.indexOf(voicePlaybackSpeed);
    const nextIndex = (currentIndex + 1) % VOICE_PLAYBACK_SPEEDS.length;
    const newSpeed = VOICE_PLAYBACK_SPEEDS[nextIndex];
    setVoicePlaybackSpeed(newSpeed);
    if (flatAudioRef.current) flatAudioRef.current.playbackRate = newSpeed;
  }, [voicePlaybackSpeed]);

  const handleVoiceSeek = useCallback((e: React.MouseEvent<HTMLDivElement>, item: TodoItem) => {
    e.stopPropagation();
    if (!flatAudioRef.current || playingVoiceId !== item.id) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const duration = flatAudioRef.current.duration || voiceDuration[item.id] || item.voiceRecording?.duration || 0;
    if (duration && !isNaN(duration)) {
      flatAudioRef.current.currentTime = percentage * duration;
      setVoiceProgress(percentage * 100);
      setVoiceCurrentTime(percentage * duration);
    }
  }, [playingVoiceId, voiceDuration]);

  const seekToPercent = useCallback((percent: number, item: TodoItem) => {
    if (flatAudioRef.current && playingVoiceId === item.id) {
      const duration = flatAudioRef.current.duration || voiceDuration[item.id] || item.voiceRecording?.duration || 0;
      if (duration && !isNaN(duration)) {
        flatAudioRef.current.currentTime = (percent / 100) * duration;
        setVoiceProgress(percent);
        setVoiceCurrentTime((percent / 100) * duration);
      }
    }
  }, [playingVoiceId, voiceDuration]);

  return {
    playingVoiceId,
    voiceProgress,
    voiceCurrentTime,
    voiceDuration,
    voicePlaybackSpeed,
    resolvedVoiceUrls,
    flatAudioRef,
    resolveVoiceUrls,
    formatDuration,
    handleFlatVoicePlay,
    cycleVoicePlaybackSpeed,
    handleVoiceSeek,
    seekToPercent,
  };
};
