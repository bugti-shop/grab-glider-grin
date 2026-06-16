// All constants and helper functions for the RichTextEditor

import { getSetting, setSetting } from '@/utils/settingsStorage';

// File helpers
export const getMimeType = (filename: string): string => {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const mimeTypes: Record<string, string> = {
    'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'gif': 'image/gif',
    'mp3': 'audio/mpeg', 'wav': 'audio/wav', 'mp4': 'video/mp4', 'pdf': 'application/pdf',
    'doc': 'application/msword', 'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'txt': 'text/plain', 'zip': 'application/zip',
  };
  return mimeTypes[ext] || 'application/octet-stream';
};

export const getFileCategory = (filename: string): 'image' | 'audio' | 'video' | 'document' | 'other' => {
  const mimeType = getMimeType(filename);
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.startsWith('text/')) return 'document';
  return 'other';
};

export const downloadFile = (dataUrl: string, filename: string) => {
  const parts = dataUrl.split(',');
  const mimeMatch = parts[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
  const b64 = atob(parts[1]);
  const u8arr = new Uint8Array(b64.length);
  for (let i = 0; i < b64.length; i++) u8arr[i] = b64.charCodeAt(i);
  const blob = new Blob([u8arr], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// Favorites storage helpers
const FAVORITES_KEY = 'note-font-favorites';
export const getFavorites = async (): Promise<string[]> => {
  return getSetting<string[]>(FAVORITES_KEY, []);
};
export const saveFavorites = (favorites: string[]) => {
  setSetting(FAVORITES_KEY, favorites);
};

export const COLORS = [
  // Neutrals
  { name: 'Black', value: '#000000' },
  { name: 'Dark Gray', value: '#374151' },
  { name: 'Gray', value: '#6B7280' },
  { name: 'Light Gray', value: '#9CA3AF' },
  { name: 'White', value: '#FFFFFF' },
  // Reds
  { name: 'Red', value: '#EF4444' },
  { name: 'Dark Red', value: '#B91C1C' },
  { name: 'Rose', value: '#F43F5E' },
  { name: 'Crimson', value: '#DC2626' },
  // Oranges
  { name: 'Orange', value: '#F97316' },
  { name: 'Dark Orange', value: '#EA580C' },
  { name: 'Amber', value: '#F59E0B' },
  // Yellows
  { name: 'Yellow', value: '#EAB308' },
  { name: 'Gold', value: '#CA8A04' },
  // Greens
  { name: 'Green', value: '#10B981' },
  { name: 'Dark Green', value: '#059669' },
  { name: 'Lime', value: '#84CC16' },
  { name: 'Emerald', value: '#34D399' },
  { name: 'Teal', value: '#14B8A6' },
  // Blues
  { name: 'Blue', value: '#3B82F6' },
  { name: 'Dark Blue', value: '#1D4ED8' },
  { name: 'Sky Blue', value: '#0EA5E9' },
  { name: 'Cyan', value: '#06B6D4' },
  { name: 'Navy', value: '#1E3A8A' },
  // Purples
  { name: 'Purple', value: '#8B5CF6' },
  { name: 'Dark Purple', value: '#7C3AED' },
  { name: 'Violet', value: '#A855F7' },
  { name: 'Indigo', value: '#6366F1' },
  // Pinks
  { name: 'Pink', value: '#EC4899' },
  { name: 'Hot Pink', value: '#DB2777' },
  { name: 'Fuchsia', value: '#D946EF' },
  // Browns
  { name: 'Brown', value: '#92400E' },
  { name: 'Tan', value: '#A8A29E' },
];

export const HIGHLIGHT_COLORS = [
  // Yellows
  { name: 'Yellow', value: '#FEF08A' },
  { name: 'Light Yellow', value: '#FEF9C3' },
  { name: 'Amber', value: '#FDE68A' },
  { name: 'Gold', value: '#FCD34D' },
  // Greens
  { name: 'Green', value: '#BBF7D0' },
  { name: 'Light Green', value: '#DCFCE7' },
  { name: 'Lime', value: '#D9F99D' },
  { name: 'Emerald', value: '#A7F3D0' },
  { name: 'Teal', value: '#99F6E4' },
  // Blues
  { name: 'Blue', value: '#BFDBFE' },
  { name: 'Light Blue', value: '#DBEAFE' },
  { name: 'Sky Blue', value: '#BAE6FD' },
  { name: 'Cyan', value: '#A5F3FC' },
  // Purples
  { name: 'Purple', value: '#E9D5FF' },
  { name: 'Light Purple', value: '#F3E8FF' },
  { name: 'Violet', value: '#DDD6FE' },
  { name: 'Indigo', value: '#C7D2FE' },
  // Pinks & Reds
  { name: 'Pink', value: '#FBCFE8' },
  { name: 'Light Pink', value: '#FCE7F3' },
  { name: 'Rose', value: '#FECDD3' },
  { name: 'Red', value: '#FECACA' },
  { name: 'Fuchsia', value: '#F5D0FE' },
  // Oranges
  { name: 'Orange', value: '#FED7AA' },
  { name: 'Light Orange', value: '#FFEDD5' },
  { name: 'Peach', value: '#FED7D7' },
  // Neutrals
  { name: 'Gray', value: '#E5E7EB' },
  { name: 'Light Gray', value: '#F3F4F6' },
];

export const FONT_CATEGORIES = [
  {
    category: 'Popular',
    fonts: [
      { name: 'Default', value: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', sample: 'Clean & Modern' },
      { name: 'Roboto', value: '"Roboto", sans-serif', sample: 'Most Popular' },
      { name: 'Open Sans', value: '"Open Sans", sans-serif', sample: 'Web Favorite' },
      { name: 'Lato', value: '"Lato", sans-serif', sample: 'Elegant Sans' },
      { name: 'Montserrat', value: '"Montserrat", sans-serif', sample: 'Bold & Modern' },
      { name: 'Poppins', value: '"Poppins", sans-serif', sample: 'Geometric Style' },
      { name: 'Playfair Display', value: '"Playfair Display", serif', sample: 'Classic Elegance' },
      { name: 'Dancing Script', value: '"Dancing Script", cursive', sample: 'Beautiful Script' },
    ]
  },
  {
    category: 'Sans Serif',
    fonts: [
      { name: 'Inter', value: '"Inter", sans-serif', sample: 'Modern UI Font' },
      { name: 'Raleway', value: '"Raleway", sans-serif', sample: 'Thin & Stylish' },
      { name: 'Nunito', value: '"Nunito", sans-serif', sample: 'Rounded & Friendly' },
      { name: 'Ubuntu', value: '"Ubuntu", sans-serif', sample: 'Tech Friendly' },
      { name: 'Quicksand', value: '"Quicksand", sans-serif', sample: 'Light & Airy' },
      { name: 'Josefin Sans', value: '"Josefin Sans", sans-serif', sample: 'Vintage Modern' },
      { name: 'Work Sans', value: '"Work Sans", sans-serif', sample: 'Professional' },
      { name: 'PT Sans', value: '"PT Sans", sans-serif', sample: 'Readable Sans' },
      { name: 'Cabin', value: '"Cabin", sans-serif', sample: 'Humanist Style' },
      { name: 'Oswald', value: '"Oswald", sans-serif', sample: 'CONDENSED STYLE' },
      { name: 'Archivo', value: '"Archivo", sans-serif', sample: 'Grotesque Sans' },
      { name: 'Rubik', value: '"Rubik", sans-serif', sample: 'Rounded Corners' },
      { name: 'Karla', value: '"Karla", sans-serif', sample: 'Grotesque Style' },
      { name: 'Mulish', value: '"Mulish", sans-serif', sample: 'Clean Reading' },
      { name: 'DM Sans', value: '"DM Sans", sans-serif', sample: 'Low Contrast' },
      { name: 'Manrope', value: '"Manrope", sans-serif', sample: 'Modern Geometric' },
      { name: 'Outfit', value: '"Outfit", sans-serif', sample: 'Variable Width' },
      { name: 'Lexend', value: '"Lexend", sans-serif', sample: 'Easy Reading' },
      { name: 'Figtree', value: '"Figtree", sans-serif', sample: 'Friendly Sans' },
      { name: 'Source Sans Pro', value: '"Source Sans Pro", sans-serif', sample: 'Adobe Classic' },
      { name: 'Noto Sans', value: '"Noto Sans", sans-serif', sample: 'Universal' },
      { name: 'Barlow', value: '"Barlow", sans-serif', sample: 'Slightly Rounded' },
      { name: 'Exo 2', value: '"Exo 2", sans-serif', sample: 'Geometric Tech' },
      { name: 'Titillium Web', value: '"Titillium Web", sans-serif', sample: 'Academic Style' },
    ]
  },
  {
    category: 'Serif',
    fonts: [
      { name: 'Merriweather', value: '"Merriweather", serif', sample: 'Reading Comfort' },
      { name: 'Crimson Text', value: '"Crimson Text", serif', sample: 'Book Typography' },
      { name: 'Noto Serif', value: '"Noto Serif", serif', sample: 'Classic Style' },
      { name: 'Lora', value: '"Lora", serif', sample: 'Contemporary Serif' },
      { name: 'Libre Baskerville', value: '"Libre Baskerville", serif', sample: 'Web Optimized' },
      { name: 'EB Garamond', value: '"EB Garamond", serif', sample: 'Old Style' },
      { name: 'Cormorant', value: '"Cormorant", serif', sample: 'Display Serif' },
      { name: 'Bitter', value: '"Bitter", serif', sample: 'Slab Serif' },
      { name: 'Spectral', value: '"Spectral", serif', sample: 'Screen Reading' },
      { name: 'PT Serif', value: '"PT Serif", serif', sample: 'Russian Serif' },
      { name: 'Vollkorn', value: '"Vollkorn", serif', sample: 'Body Text' },
      { name: 'Alegreya', value: '"Alegreya", serif', sample: 'Literary Style' },
    ]
  },
  {
    category: 'Handwritten',
    fonts: [
      { name: 'Pacifico', value: '"Pacifico", cursive', sample: 'Fun & Playful' },
      { name: 'Indie Flower', value: '"Indie Flower", cursive', sample: 'Hand Written' },
      { name: 'Shadows Into Light', value: '"Shadows Into Light", cursive', sample: 'Sketchy Notes' },
      { name: 'Permanent Marker', value: '"Permanent Marker", cursive', sample: 'Bold Marker' },
      { name: 'Caveat', value: '"Caveat", cursive', sample: 'Quick Notes' },
      { name: 'Satisfy', value: '"Satisfy", cursive', sample: 'Brush Script' },
      { name: 'Kalam', value: '"Kalam", cursive', sample: 'Handwritten Style' },
      { name: 'Patrick Hand', value: '"Patrick Hand", cursive', sample: 'Friendly Notes' },
      { name: 'Architects Daughter', value: '"Architects Daughter", cursive', sample: 'Blueprint Style' },
      { name: 'Amatic SC', value: '"Amatic SC", cursive', sample: 'CONDENSED HAND' },
      { name: 'Covered By Your Grace', value: '"Covered By Your Grace", cursive', sample: 'Casual Script' },
      { name: 'Gloria Hallelujah', value: '"Gloria Hallelujah", cursive', sample: 'Comic Hand' },
      { name: 'Handlee', value: '"Handlee", cursive', sample: 'Loose Handwriting' },
      { name: 'Just Another Hand', value: '"Just Another Hand", cursive', sample: 'Quick Scribble' },
      { name: 'Neucha', value: '"Neucha", cursive', sample: 'Russian Hand' },
      { name: 'Nothing You Could Do', value: '"Nothing You Could Do", cursive', sample: 'Casual Flow' },
      { name: 'Reenie Beanie', value: '"Reenie Beanie", cursive', sample: 'Quick Note' },
      { name: 'Rock Salt', value: '"Rock Salt", cursive', sample: 'Rough Marker' },
      { name: 'Schoolbell', value: '"Schoolbell", cursive', sample: 'Classroom Style' },
      { name: 'Waiting for the Sunrise', value: '"Waiting for the Sunrise", cursive', sample: 'Dreamy Script' },
      { name: 'Zeyada', value: '"Zeyada", cursive', sample: 'Artistic Hand' },
      { name: 'Homemade Apple', value: '"Homemade Apple", cursive', sample: 'Natural Writing' },
      { name: 'Loved by the King', value: '"Loved by the King", cursive', sample: 'Royal Script' },
      { name: 'La Belle Aurore', value: '"La Belle Aurore", cursive', sample: 'French Elegance' },
      { name: 'Sacramento', value: '"Sacramento", cursive', sample: 'Elegant Script' },
      { name: 'Great Vibes', value: '"Great Vibes", cursive', sample: 'Formal Script' },
      { name: 'Allura', value: '"Allura", cursive', sample: 'Wedding Style' },
      { name: 'Alex Brush', value: '"Alex Brush", cursive', sample: 'Brush Lettering' },
      { name: 'Tangerine', value: '"Tangerine", cursive', sample: 'Calligraphy' },
      { name: 'Yellowtail', value: '"Yellowtail", cursive', sample: 'Retro Script' },
      { name: 'Marck Script', value: '"Marck Script", cursive', sample: 'Casual Elegant' },
      { name: 'Courgette', value: '"Courgette", cursive', sample: 'Medium Weight' },
      { name: 'Cookie', value: '"Cookie", cursive', sample: 'Sweet Script' },
      { name: 'Damion', value: '"Damion", cursive', sample: 'Bold Script' },
      { name: 'Mr Dafoe', value: '"Mr Dafoe", cursive', sample: 'Signature Style' },
      { name: 'Niconne', value: '"Niconne", cursive', sample: 'Romantic' },
      { name: 'Norican', value: '"Norican", cursive', sample: 'Flowing Script' },
      { name: 'Pinyon Script', value: '"Pinyon Script", cursive', sample: 'Formal Cursive' },
      { name: 'Rouge Script', value: '"Rouge Script", cursive', sample: 'Vintage Hand' },
    ]
  },
  {
    category: 'Display & Decorative',
    fonts: [
      { name: 'Bebas Neue', value: '"Bebas Neue", cursive', sample: 'BOLD HEADLINES' },
      { name: 'Lobster', value: '"Lobster", cursive', sample: 'Retro Script' },
      { name: 'Righteous', value: '"Righteous", cursive', sample: 'Groovy Display' },
      { name: 'Alfa Slab One', value: '"Alfa Slab One", serif', sample: 'Heavy Slab' },
      { name: 'Fredoka One', value: '"Fredoka One", cursive', sample: 'Rounded Fun' },
      { name: 'Bangers', value: '"Bangers", cursive', sample: 'COMIC STYLE' },
      { name: 'Russo One', value: '"Russo One", sans-serif', sample: 'Sporty Bold' },
      { name: 'Bungee', value: '"Bungee", cursive', sample: 'VERTICAL DISPLAY' },
      { name: 'Passion One', value: '"Passion One", cursive', sample: 'BOLD IMPACT' },
      { name: 'Monoton', value: '"Monoton", cursive', sample: 'NEON STYLE' },
    ]
  },
  {
    category: 'Monospace',
    fonts: [
      { name: 'Courier Prime', value: '"Courier Prime", monospace', sample: 'const code = true;' },
      { name: 'Space Mono', value: '"Space Mono", monospace', sample: 'function() {}' },
      { name: 'Fira Code', value: '"Fira Code", monospace', sample: '=> !== ===' },
      { name: 'Source Code Pro', value: '"Source Code Pro", monospace', sample: 'console.log()' },
      { name: 'JetBrains Mono', value: '"JetBrains Mono", monospace', sample: 'let x = 42;' },
      { name: 'IBM Plex Mono', value: '"IBM Plex Mono", monospace', sample: 'import { }' },
      { name: 'Roboto Mono', value: '"Roboto Mono", monospace', sample: 'async await' },
      { name: 'Inconsolata', value: '"Inconsolata", monospace', sample: 'if (true) {}' },
    ]
  }
];

export const getAllFonts = () => {
  return FONT_CATEGORIES.flatMap(cat => cat.fonts);
};

export const FONT_WEIGHTS = [
  { name: 'Light', value: '300' },
  { name: 'Regular', value: '400' },
  { name: 'Medium', value: '500' },
  { name: 'Semi Bold', value: '600' },
  { name: 'Bold', value: '700' },
];

export const FONT_SIZES = [
  { name: 'Extra Small', value: '12px' },
  { name: 'Small', value: '14px' },
  { name: 'Medium', value: '16px' },
  { name: 'Large', value: '20px' },
  { name: 'Extra Large', value: '24px' },
  { name: 'Huge', value: '32px' },
];

export const LETTER_SPACINGS = [
  { name: 'Tight', value: '-0.05em', sample: 'Compressed' },
  { name: 'Normal', value: '0em', sample: 'Default spacing' },
  { name: 'Wide', value: '0.05em', sample: 'Slightly spaced' },
  { name: 'Wider', value: '0.1em', sample: 'More spacing' },
  { name: 'Widest', value: '0.2em', sample: 'Maximum space' },
];

export const LINE_HEIGHTS = [
  { name: 'Compact', value: '1.2', sample: 'Tight lines' },
  { name: 'Normal', value: '1.5', sample: 'Default height' },
  { name: 'Relaxed', value: '1.75', sample: 'More breathing room' },
  { name: 'Loose', value: '2', sample: 'Double spaced' },
  { name: 'Extra Loose', value: '2.5', sample: 'Maximum space' },
];
