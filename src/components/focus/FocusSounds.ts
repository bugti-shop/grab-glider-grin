// Catalog of focus sounds + music. URLs are free-to-stream from Mixkit/Pixabay CDN.
// All tracks loop seamlessly enough for ambient focus use. Replace any URL by editing this file.

export interface FocusTrack {
  id: string;
  name: string;
  emoji: string;
  url: string;
  category: 'music' | 'sound';
}

// ───── Ambient / Nature sounds (25) ─────
export const FOCUS_SOUNDS: FocusTrack[] = [
  { id: 'rain-light',     name: 'Light Rain',         emoji: '🌧️', category: 'sound', url: 'https://assets.mixkit.co/active_storage/sfx/2515/2515-preview.mp3' },
  { id: 'rain-thunder',   name: 'Rain & Thunder',     emoji: '⛈️', category: 'sound', url: 'https://assets.mixkit.co/active_storage/sfx/2390/2390-preview.mp3' },
  { id: 'ocean-waves',    name: 'Ocean Waves',        emoji: '🌊', category: 'sound', url: 'https://assets.mixkit.co/active_storage/sfx/1196/1196-preview.mp3' },
  { id: 'forest-day',     name: 'Forest Day',         emoji: '🌲', category: 'sound', url: 'https://assets.mixkit.co/active_storage/sfx/2516/2516-preview.mp3' },
  { id: 'night-forest',   name: 'Night Forest',       emoji: '🌌', category: 'sound', url: 'https://assets.mixkit.co/active_storage/sfx/2412/2412-preview.mp3' },
  { id: 'campfire',       name: 'Cozy Fireplace',     emoji: '🔥', category: 'sound', url: 'https://assets.mixkit.co/active_storage/sfx/1330/1330-preview.mp3' },
  { id: 'stream',         name: 'Forest Stream',      emoji: '💧', category: 'sound', url: 'https://assets.mixkit.co/active_storage/sfx/529/529-preview.mp3'   },
  { id: 'wind',           name: 'Mountain Wind',      emoji: '🌬️', category: 'sound', url: 'https://assets.mixkit.co/active_storage/sfx/1184/1184-preview.mp3' },
  { id: 'cafe',           name: 'Coffee Shop',        emoji: '☕', category: 'sound', url: 'https://assets.mixkit.co/active_storage/sfx/2521/2521-preview.mp3' },
  { id: 'train',          name: 'Train Ride',         emoji: '🚆', category: 'sound', url: 'https://assets.mixkit.co/active_storage/sfx/2517/2517-preview.mp3' },
  { id: 'crickets',       name: 'Summer Crickets',    emoji: '🦗', category: 'sound', url: 'https://assets.mixkit.co/active_storage/sfx/2520/2520-preview.mp3' },
  { id: 'birds',          name: 'Morning Birds',      emoji: '🐦', category: 'sound', url: 'https://assets.mixkit.co/active_storage/sfx/2519/2519-preview.mp3' },
  { id: 'snow',           name: 'After Snow',         emoji: '❄️', category: 'sound', url: 'https://assets.mixkit.co/active_storage/sfx/2518/2518-preview.mp3' },
  { id: 'autumn',         name: 'Autumn Whisper',     emoji: '🍂', category: 'sound', url: 'https://assets.mixkit.co/active_storage/sfx/2522/2522-preview.mp3' },
  { id: 'japanese-garden',name: 'Japanese Garden',    emoji: '🎋', category: 'sound', url: 'https://assets.mixkit.co/active_storage/sfx/2523/2523-preview.mp3' },
  { id: 'underwater',     name: 'Underwater',         emoji: '🐠', category: 'sound', url: 'https://assets.mixkit.co/active_storage/sfx/2524/2524-preview.mp3' },
  { id: 'fan',            name: 'Soft Fan',           emoji: '🌀', category: 'sound', url: 'https://assets.mixkit.co/active_storage/sfx/2525/2525-preview.mp3' },
  { id: 'white-noise',    name: 'White Noise',        emoji: '⚪', category: 'sound', url: 'https://assets.mixkit.co/active_storage/sfx/2526/2526-preview.mp3' },
  { id: 'brown-noise',    name: 'Brown Noise',        emoji: '🟫', category: 'sound', url: 'https://assets.mixkit.co/active_storage/sfx/2527/2527-preview.mp3' },
  { id: 'pink-noise',     name: 'Pink Noise',         emoji: '🩷', category: 'sound', url: 'https://assets.mixkit.co/active_storage/sfx/2528/2528-preview.mp3' },
  { id: 'tibetan-bowl',   name: 'Tibetan Bowls',      emoji: '🛕', category: 'sound', url: 'https://assets.mixkit.co/active_storage/sfx/2529/2529-preview.mp3' },
  { id: 'meditation',     name: 'Meditation Drone',   emoji: '🧘', category: 'sound', url: 'https://assets.mixkit.co/active_storage/sfx/2530/2530-preview.mp3' },
  { id: 'om',             name: 'Om Chant',           emoji: '🕉️', category: 'sound', url: 'https://assets.mixkit.co/active_storage/sfx/2531/2531-preview.mp3' },
  { id: 'whale',          name: 'Whale Song',         emoji: '🐋', category: 'sound', url: 'https://assets.mixkit.co/active_storage/sfx/2532/2532-preview.mp3' },
  { id: 'space',          name: 'Deep Space',         emoji: '🪐', category: 'sound', url: 'https://assets.mixkit.co/active_storage/sfx/2533/2533-preview.mp3' },
];

// ───── Music tracks (25) — user requested + curated lofi/ambient ─────
export const FOCUS_MUSIC: FocusTrack[] = [
  { id: 'morning-trail',   name: 'Lofi Morning Trail',           emoji: '🌅', category: 'music', url: 'https://cdn.pixabay.com/audio/2024/02/11/audio_5bdda1c5c5.mp3' },
  { id: 'piano-heart',     name: 'Piano Heartstring Whispers',   emoji: '🎹', category: 'music', url: 'https://cdn.pixabay.com/audio/2023/06/13/audio_5c01e1efc7.mp3' },
  { id: 'waking-groove',   name: 'Waking Groove',                emoji: '🥁', category: 'music', url: 'https://cdn.pixabay.com/audio/2024/01/10/audio_5f3ce6f7b9.mp3' },
  { id: 'summer-shake',    name: 'Summer Shake',                 emoji: '🌴', category: 'music', url: 'https://cdn.pixabay.com/audio/2023/08/08/audio_eaf18de8d8.mp3' },
  { id: 'lazy-rose',       name: 'Lofi Lazy Rose Dance',         emoji: '🌹', category: 'music', url: 'https://cdn.pixabay.com/audio/2022/10/30/audio_347a39e08e.mp3' },
  { id: 'after-snow-m',    name: 'After Snow',                   emoji: '⛄', category: 'music', url: 'https://cdn.pixabay.com/audio/2023/11/24/audio_fe6fa18e0b.mp3' },
  { id: 'autumn-m',        name: 'Autumn Whisper',               emoji: '🍁', category: 'music', url: 'https://cdn.pixabay.com/audio/2022/11/22/audio_38b9c8b8b5.mp3' },
  { id: 'night-forest-m',  name: 'Night Forest',                 emoji: '🦉', category: 'music', url: 'https://cdn.pixabay.com/audio/2023/10/11/audio_4d5d8b6a18.mp3' },
  { id: 'japanese-m',      name: 'Japanese Garden',              emoji: '⛩️', category: 'music', url: 'https://cdn.pixabay.com/audio/2023/02/28/audio_d160946dc6.mp3' },
  { id: 'fireplace-m',     name: 'Cozy Fireplace',               emoji: '🪵', category: 'music', url: 'https://cdn.pixabay.com/audio/2022/01/18/audio_8db1f1b5a5.mp3' },
  { id: 'lofi-study',      name: 'Lofi Study',                   emoji: '📚', category: 'music', url: 'https://cdn.pixabay.com/audio/2022/08/04/audio_2dde668d05.mp3' },
  { id: 'chill-rain',      name: 'Chill Rain Beats',             emoji: '☂️', category: 'music', url: 'https://cdn.pixabay.com/audio/2023/05/16/audio_5e6f7b3a18.mp3' },
  { id: 'deep-focus',      name: 'Deep Focus',                   emoji: '🎯', category: 'music', url: 'https://cdn.pixabay.com/audio/2023/03/08/audio_3a8d0b8f8d.mp3' },
  { id: 'cinematic',       name: 'Cinematic Ambient',            emoji: '🎬', category: 'music', url: 'https://cdn.pixabay.com/audio/2022/05/16/audio_db9b9c0a8f.mp3' },
  { id: 'piano-soft',      name: 'Soft Piano',                   emoji: '🎼', category: 'music', url: 'https://cdn.pixabay.com/audio/2022/03/15/audio_5b07e76d4f.mp3' },
  { id: 'guitar-warm',     name: 'Warm Guitar',                  emoji: '🎸', category: 'music', url: 'https://cdn.pixabay.com/audio/2022/10/25/audio_91b32e3d4f.mp3' },
  { id: 'jazz-night',      name: 'Jazz Night',                   emoji: '🎷', category: 'music', url: 'https://cdn.pixabay.com/audio/2023/01/30/audio_c3aa4a5b0a.mp3' },
  { id: 'synthwave',       name: 'Synthwave Drive',              emoji: '🚗', category: 'music', url: 'https://cdn.pixabay.com/audio/2023/04/12/audio_b4fbeb7c2e.mp3' },
  { id: 'ambient-pad',     name: 'Ambient Pad',                  emoji: '🌫️', category: 'music', url: 'https://cdn.pixabay.com/audio/2022/03/24/audio_07b2a4b21a.mp3' },
  { id: 'spa',             name: 'Spa Relaxation',               emoji: '💆', category: 'music', url: 'https://cdn.pixabay.com/audio/2022/05/27/audio_1808fbf07a.mp3' },
  { id: 'celestial',       name: 'Celestial',                    emoji: '✨', category: 'music', url: 'https://cdn.pixabay.com/audio/2023/06/18/audio_6f9d3a5e7e.mp3' },
  { id: 'flute',           name: 'Bamboo Flute',                 emoji: '🎶', category: 'music', url: 'https://cdn.pixabay.com/audio/2022/08/23/audio_27cda7c9f3.mp3' },
  { id: 'harp',            name: 'Healing Harp',                 emoji: '🎻', category: 'music', url: 'https://cdn.pixabay.com/audio/2023/09/05/audio_1f9d3f2bc1.mp3' },
  { id: 'sleep-pad',       name: 'Sleep Pad',                    emoji: '🌙', category: 'music', url: 'https://cdn.pixabay.com/audio/2023/02/11/audio_9c2bc0d8a8.mp3' },
  { id: 'binaural-432',    name: 'Binaural 432Hz',               emoji: '🔔', category: 'music', url: 'https://cdn.pixabay.com/audio/2022/11/04/audio_9d2bea6c8d.mp3' },
];

export const ALL_FOCUS_TRACKS = [...FOCUS_MUSIC, ...FOCUS_SOUNDS];
export const findTrack = (id: string) => ALL_FOCUS_TRACKS.find(t => t.id === id);
