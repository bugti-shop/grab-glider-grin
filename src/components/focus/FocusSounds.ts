// Catalog of focus sounds. Curated minimal set.
// All tracks are multi-hour continuous recordings (4h–11h) hosted on the
// Internet Archive so playback never has audible loop seams / interruptions.
// Source: https://archive.org/details/relaxingsounds (public domain)

export interface FocusTrack {
  id: string;
  name: string;
  emoji: string;
  url: string;
  category: 'music' | 'sound';
}

const IA = (file: string) =>
  `https://archive.org/download/relaxingsounds/${encodeURIComponent(file)}`;

// ───── Ambient / Nature sounds (long-form, 4h+) ─────
export const FOCUS_SOUNDS: FocusTrack[] = [
  { id: 'rain-light',   name: 'Light Rain',     emoji: '🌧️', category: 'sound', url: IA('Rain 6 (Light) 10h on Tent Canvas,(MediumGentle)-no thunder.mp3') },
  { id: 'rain-thunder', name: 'Rain & Thunder', emoji: '⛈️', category: 'sound', url: IA('Rain 2 (Med.+) 10h LowGentleThunder, Downpour.mp3') },
  { id: 'ocean-waves',  name: 'Ocean Waves',    emoji: '🌊', category: 'sound', url: IA('Waves 3 10h Night Beach-Gentle, NO GULLS.mp3') },
  { id: 'forest-day',   name: 'Forest Day',     emoji: '🌲', category: 'sound', url: IA('Cicadas 1 4h- Locust swells,Gentle Birds-SE Texas-RGD.mp3') },
  { id: 'night-forest', name: 'Night Forest',   emoji: '🌌', category: 'sound', url: IA('Crickets 8h RiverBubbling,Owls,NightSounds-Woods.mp3') },
  { id: 'campfire',     name: 'Cozy Fireplace', emoji: '🔥', category: 'sound', url: IA('FIRE 1 10h CracklingCampfire,Crickets,RainOrRiver-Night.mp3') },
  { id: 'white-noise',  name: 'White Noise',    emoji: '⚪', category: 'sound', url: IA('FAN 2 10h Gentle,Oscillating Fan.mp3') },
];

// ───── Music tracks (removed per user request) ─────
export const FOCUS_MUSIC: FocusTrack[] = [];

export const ALL_FOCUS_TRACKS = [...FOCUS_MUSIC, ...FOCUS_SOUNDS];
export const findTrack = (id: string) => ALL_FOCUS_TRACKS.find(t => t.id === id);
