// Task completion sound utility — original built-in tones (no copied proprietary app audio).
import { getSetting, setSetting } from '@/utils/settingsStorage';

export type CompletionRingtoneId =
  | 'flowist-bell'
  | 'soft-chime'
  | 'bright-pop'
  | 'zen-bowl'
  | 'focus-pluck'
  | 'retro-blip'
  | 'wood-tap'
  | 'sparkle'
  | 'minimal-click'
  | 'celebration';

export interface CompletionRingtoneOption {
  id: CompletionRingtoneId;
  label: string;
  description: string;
  icon: string;
}

export const COMPLETION_RINGTONE_OPTIONS: CompletionRingtoneOption[] = [
  { id: 'flowist-bell', label: 'Flowist Bell', description: 'Warm bell chord', icon: '🔔' },
  { id: 'soft-chime', label: 'Soft Chime', description: 'Gentle two-note chime', icon: '✨' },
  { id: 'bright-pop', label: 'Bright Pop', description: 'Fast upbeat tick', icon: '⚡' },
  { id: 'zen-bowl', label: 'Zen Bowl', description: 'Calm lingering tone', icon: '🧘' },
  { id: 'focus-pluck', label: 'Focus Pluck', description: 'Short clean pluck', icon: '🎯' },
  { id: 'retro-blip', label: 'Retro Blip', description: 'Tiny game-style blip', icon: '🕹️' },
  { id: 'wood-tap', label: 'Wood Tap', description: 'Natural muted tap', icon: '🪵' },
  { id: 'sparkle', label: 'Sparkle', description: 'Light success shimmer', icon: '💫' },
  { id: 'minimal-click', label: 'Minimal Click', description: 'Quiet productivity click', icon: '✓' },
  { id: 'celebration', label: 'Celebration', description: 'Small completed-task flourish', icon: '🎉' },
];

let soundEnabled = true;
let selectedRingtone: CompletionRingtoneId = 'flowist-bell';
let soundVolume = 0.5;
let soundInitialized = false;

let sharedAudioCtx: AudioContext | null = null;
const getAudioCtx = (): AudioContext => {
  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    sharedAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return sharedAudioCtx;
};

const initSettings = async () => {
  if (soundInitialized) return;
  soundInitialized = true;
  const [enabled, ringtone, volume] = await Promise.all([
    getSetting<boolean>('taskCompletionSound', true),
    getSetting<CompletionRingtoneId>('taskCompletionRingtone', 'flowist-bell'),
    getSetting<number>('taskCompletionVolume', 0.5),
  ]);
  soundEnabled = enabled;
  selectedRingtone = COMPLETION_RINGTONE_OPTIONS.some((o) => o.id === ringtone) ? ringtone : 'flowist-bell';
  soundVolume = Math.max(0, Math.min(1, Number(volume) || 0.5));
};

initSettings();

type OscType = OscillatorType;

const playTone = (
  ctx: AudioContext,
  master: GainNode,
  start: number,
  freq: number,
  duration: number,
  volume: number,
  type: OscType = 'sine',
  endFreq?: number,
) => {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(master);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.start(start);
  osc.stop(start + duration + 0.02);
};

const playNoise = (ctx: AudioContext, master: GainNode, start: number, duration: number, volume: number) => {
  const sampleRate = ctx.sampleRate;
  const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(sampleRate * duration)), sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const source = ctx.createBufferSource();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 900;
  source.buffer = buffer;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.start(start);
  source.stop(start + duration);
};

const createCompletionSound = (ringtone: CompletionRingtoneId): void => {
  try {
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') void ctx.resume();
    const t = ctx.currentTime + 0.005;
    const master = ctx.createGain();
    master.gain.setValueAtTime(Math.max(0.02, Math.min(0.8, soundVolume)), t);
    master.connect(ctx.destination);

    switch (ringtone) {
      case 'soft-chime':
        playTone(ctx, master, t, 880, 0.22, 0.22);
        playTone(ctx, master, t + 0.07, 1174, 0.26, 0.15);
        break;
      case 'bright-pop':
        playTone(ctx, master, t, 660, 0.07, 0.23, 'triangle', 1320);
        playNoise(ctx, master, t, 0.045, 0.035);
        break;
      case 'zen-bowl':
        playTone(ctx, master, t, 523, 0.65, 0.2);
        playTone(ctx, master, t + 0.015, 784, 0.58, 0.08);
        playTone(ctx, master, t + 0.03, 1046, 0.5, 0.035);
        break;
      case 'focus-pluck':
        playTone(ctx, master, t, 740, 0.12, 0.24, 'triangle');
        playTone(ctx, master, t + 0.035, 987, 0.1, 0.1, 'triangle');
        break;
      case 'retro-blip':
        playTone(ctx, master, t, 523, 0.06, 0.14, 'square', 1046);
        playTone(ctx, master, t + 0.055, 1046, 0.08, 0.11, 'square');
        break;
      case 'wood-tap':
        playTone(ctx, master, t, 210, 0.08, 0.16, 'triangle');
        playNoise(ctx, master, t, 0.06, 0.08);
        break;
      case 'sparkle':
        playTone(ctx, master, t, 1318, 0.12, 0.11);
        playTone(ctx, master, t + 0.045, 1760, 0.15, 0.09);
        playTone(ctx, master, t + 0.09, 2349, 0.18, 0.055);
        break;
      case 'minimal-click':
        playTone(ctx, master, t, 1200, 0.035, 0.09, 'triangle');
        playNoise(ctx, master, t, 0.018, 0.025);
        break;
      case 'celebration':
        playTone(ctx, master, t, 784, 0.14, 0.15, 'triangle');
        playTone(ctx, master, t + 0.055, 988, 0.16, 0.13, 'triangle');
        playTone(ctx, master, t + 0.11, 1318, 0.22, 0.12, 'triangle');
        playNoise(ctx, master, t + 0.03, 0.09, 0.03);
        break;
      case 'flowist-bell':
      default:
        playTone(ctx, master, t, 1047, 0.25, 0.35);
        playTone(ctx, master, t + 0.04, 1319, 0.2, 0.2);
        playTone(ctx, master, t + 0.08, 1568, 0.3, 0.15);
        playTone(ctx, master, t + 0.05, 2093, 0.15, 0.05);
        break;
    }
  } catch (error) {
    console.error('Error playing completion sound:', error);
  }
};

export const playCompletionSound = (): void => {
  if (!soundEnabled) return;
  createCompletionSound(selectedRingtone);
};

export const previewCompletionRingtone = (ringtone: CompletionRingtoneId): void => {
  createCompletionSound(ringtone);
};

export const setCompletionSoundEnabled = (enabled: boolean): void => {
  soundEnabled = enabled;
  void setSetting('taskCompletionSound', enabled);
};

export const isCompletionSoundEnabled = async (): Promise<boolean> => {
  soundEnabled = await getSetting<boolean>('taskCompletionSound', true);
  return soundEnabled;
};

export const setCompletionRingtone = (ringtone: CompletionRingtoneId): void => {
  selectedRingtone = COMPLETION_RINGTONE_OPTIONS.some((o) => o.id === ringtone) ? ringtone : 'flowist-bell';
  void setSetting('taskCompletionRingtone', selectedRingtone);
};

export const getCompletionRingtone = async (): Promise<CompletionRingtoneId> => {
  const ringtone = await getSetting<CompletionRingtoneId>('taskCompletionRingtone', 'flowist-bell');
  selectedRingtone = COMPLETION_RINGTONE_OPTIONS.some((o) => o.id === ringtone) ? ringtone : 'flowist-bell';
  return selectedRingtone;
};

export const setCompletionSoundVolume = (volume: number): void => {
  soundVolume = Math.max(0, Math.min(1, volume));
  void setSetting('taskCompletionVolume', soundVolume);
};