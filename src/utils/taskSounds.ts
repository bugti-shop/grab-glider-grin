// Task completion sound utility - like Todoist
import { getSetting, setSetting } from '@/utils/settingsStorage';

// Base64 encoded completion sound (a pleasant "ding" sound)
const COMPLETION_SOUND_BASE64 = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYQrF1GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//tQZAAP8AAAaQAAAAgAAA0gAAABAAAAGkAAAAIAAANIAAAAQAAANIAAAAQRMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV';

let completionAudio: HTMLAudioElement | null = null;
let soundEnabled = true;
let soundInitialized = false;

// Initialize the audio element
const initAudio = () => {
  if (!completionAudio) {
    completionAudio = new Audio(COMPLETION_SOUND_BASE64);
    completionAudio.volume = 0.5;
  }
};

// Initialize settings from IndexedDB
const initSettings = async () => {
  if (soundInitialized) return;
  soundInitialized = true;
  soundEnabled = await getSetting<boolean>('taskCompletionSound', true);
};

// Call init on module load
initSettings();

// Reusable AudioContext for lower latency
let sharedAudioCtx: AudioContext | null = null;
const getAudioCtx = (): AudioContext => {
  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    sharedAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return sharedAudioCtx;
};

/**
 * Rich, satisfying completion sound with three harmonics and reverb-like tail.
 * Designed to feel as addictive as a social media "like" sound.
 */
const createCompletionSound = (): void => {
  try {
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') ctx.resume();
    const t = ctx.currentTime;

    const master = ctx.createGain();
    master.gain.setValueAtTime(0.25, t);
    master.connect(ctx.destination);

    // Note 1: bell strike (C6 = 1047 Hz)
    const makeOsc = (freq: number, vol: number, dur: number, delay: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(master);
      osc.frequency.setValueAtTime(freq, t);
      osc.type = 'sine';
      gain.gain.setValueAtTime(0, t + delay);
      gain.gain.linearRampToValueAtTime(vol, t + delay + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, t + delay + dur);
      osc.start(t + delay);
      osc.stop(t + delay + dur);
    };

    // Three-note ascending chord for satisfying feel
    makeOsc(1047, 0.35, 0.25, 0);       // C6
    makeOsc(1319, 0.2, 0.2, 0.04);      // E6
    makeOsc(1568, 0.15, 0.3, 0.08);     // G6 — lingers longer

    // Subtle shimmer overtone
    makeOsc(2093, 0.05, 0.15, 0.05);    // C7 very quiet

  } catch (error) {
    console.error('Error playing completion sound:', error);
  }
};

/**
 * Play the task completion sound
 */
export const playCompletionSound = (): void => {
  if (!soundEnabled) return;
  
  // Use Web Audio API for a more reliable cross-platform sound
  createCompletionSound();
};

/**
 * Enable or disable completion sounds
 */
export const setCompletionSoundEnabled = (enabled: boolean): void => {
  soundEnabled = enabled;
  setSetting('taskCompletionSound', enabled);
};

/**
 * Check if completion sound is enabled
 */
export const isCompletionSoundEnabled = async (): Promise<boolean> => {
  soundEnabled = await getSetting<boolean>('taskCompletionSound', true);
  return soundEnabled;
};

/**
 * Set the completion sound volume (0-1)
 */
export const setCompletionSoundVolume = (volume: number): void => {
  initAudio();
  if (completionAudio) {
    completionAudio.volume = Math.max(0, Math.min(1, volume));
  }
  setSetting('taskCompletionVolume', volume);
};
