// Catalog of focus sounds. Curated minimal set.

export interface FocusTrack {
  id: string;
  name: string;
  emoji: string;
  url: string;
  category: 'music' | 'sound';
}

// ───── Ambient / Nature sounds ─────
export const FOCUS_SOUNDS: FocusTrack[] = [
  { id: 'rain-light',   name: 'Light Rain',     emoji: '🌧️', category: 'sound', url: 'https://assets.mixkit.co/active_storage/sfx/2515/2515-preview.mp3' },
  { id: 'rain-thunder', name: 'Rain & Thunder', emoji: '⛈️', category: 'sound', url: 'https://assets.mixkit.co/active_storage/sfx/2390/2390-preview.mp3' },
  { id: 'ocean-waves',  name: 'Ocean Waves',    emoji: '🌊', category: 'sound', url: 'https://assets.mixkit.co/active_storage/sfx/1196/1196-preview.mp3' },
  { id: 'forest-day',   name: 'Forest Day',     emoji: '🌲', category: 'sound', url: 'https://assets.mixkit.co/active_storage/sfx/2516/2516-preview.mp3' },
  { id: 'night-forest', name: 'Night Forest',   emoji: '🌌', category: 'sound', url: 'https://assets.mixkit.co/active_storage/sfx/2412/2412-preview.mp3' },
  { id: 'campfire',     name: 'Cozy Fireplace', emoji: '🔥', category: 'sound', url: 'https://assets.mixkit.co/active_storage/sfx/1330/1330-preview.mp3' },
  { id: 'white-noise',  name: 'White Noise',    emoji: '⚪', category: 'sound', url: 'https://assets.mixkit.co/active_storage/sfx/2526/2526-preview.mp3' },
];

// ───── Music tracks (removed per user request) ─────
export const FOCUS_MUSIC: FocusTrack[] = [];

export const ALL_FOCUS_TRACKS = [...FOCUS_MUSIC, ...FOCUS_SOUNDS];
export const findTrack = (id: string) => ALL_FOCUS_TRACKS.find(t => t.id === id);
