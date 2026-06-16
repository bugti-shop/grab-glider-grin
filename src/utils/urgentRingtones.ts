// Urgent reminder ringtone generator using Web Audio API

export type RingtoneType = 'alarm' | 'beacon' | 'pulse' | 'siren';

let activeAudioContext: AudioContext | null = null;
let activeNodes: AudioNode[] = [];
let isPlaying = false;

export const stopRingtone = () => {
  isPlaying = false;
  activeNodes.forEach(node => {
    try { node.disconnect(); } catch {}
  });
  activeNodes = [];
  if (activeAudioContext) {
    try { activeAudioContext.close(); } catch {}
    activeAudioContext = null;
  }
};

const createContext = (): AudioContext => {
  stopRingtone();
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  activeAudioContext = ctx;
  isPlaying = true;
  return ctx;
};

// Classic alarm clock - rapid beeping
const playAlarm = (ctx: AudioContext) => {
  const playBeep = (time: number) => {
    if (!isPlaying) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    activeNodes.push(osc, gain);
    
    osc.frequency.value = 880;
    osc.type = 'square';
    gain.gain.setValueAtTime(0.3, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.15);
    osc.start(time);
    osc.stop(time + 0.15);
  };

  // Repeat pattern: beep-beep-pause
  for (let cycle = 0; cycle < 8; cycle++) {
    const base = ctx.currentTime + cycle * 0.8;
    playBeep(base);
    playBeep(base + 0.2);
    playBeep(base + 0.4);
  }
};

// Beacon - gentle rising tone
const playBeacon = (ctx: AudioContext) => {
  for (let i = 0; i < 4; i++) {
    if (!isPlaying) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    activeNodes.push(osc, gain);
    
    const start = ctx.currentTime + i * 1.5;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, start);
    osc.frequency.exponentialRampToValueAtTime(880, start + 0.5);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.3, start + 0.25);
    gain.gain.linearRampToValueAtTime(0, start + 1.2);
    osc.start(start);
    osc.stop(start + 1.2);
  }
};

// Pulse - heartbeat-like thump
const playPulse = (ctx: AudioContext) => {
  const thump = (time: number, freq: number) => {
    if (!isPlaying) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    activeNodes.push(osc, gain);
    
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.4, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.3);
    osc.start(time);
    osc.stop(time + 0.3);
  };

  for (let i = 0; i < 6; i++) {
    const base = ctx.currentTime + i * 1.0;
    thump(base, 120);
    thump(base + 0.2, 90);
  }
};

// Siren - alternating two-tone
const playSiren = (ctx: AudioContext) => {
  for (let i = 0; i < 3; i++) {
    if (!isPlaying) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    activeNodes.push(osc, gain);
    
    const start = ctx.currentTime + i * 2;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, start);
    osc.frequency.linearRampToValueAtTime(900, start + 0.5);
    osc.frequency.linearRampToValueAtTime(600, start + 1.0);
    osc.frequency.linearRampToValueAtTime(900, start + 1.5);
    osc.frequency.linearRampToValueAtTime(600, start + 2.0);
    gain.gain.setValueAtTime(0.25, start);
    gain.gain.setValueAtTime(0.25, start + 1.8);
    gain.gain.linearRampToValueAtTime(0, start + 2.0);
    osc.start(start);
    osc.stop(start + 2.0);
  }
};

export const playRingtone = (type: RingtoneType) => {
  const ctx = createContext();
  switch (type) {
    case 'alarm': playAlarm(ctx); break;
    case 'beacon': playBeacon(ctx); break;
    case 'pulse': playPulse(ctx); break;
    case 'siren': playSiren(ctx); break;
  }
};

export const RINGTONE_OPTIONS: { value: RingtoneType; label: string; icon: string }[] = [
  { value: 'alarm', label: 'Alarm', icon: '⏰' },
  { value: 'beacon', label: 'Beacon', icon: '🔔' },
  { value: 'pulse', label: 'Pulse', icon: '💓' },
  { value: 'siren', label: 'Siren', icon: '🚨' },
];
