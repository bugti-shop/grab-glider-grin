import { useCallback, useRef, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Subscript,
  Superscript,
  RemoveFormatting,
  Code,
  Minus,
  Quote,
  Link as LinkIcon,
  Image as ImageIcon,
  List,
  ListOrdered,
  Highlighter,
  Undo,
  Redo,
  Type,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Table,
  Paperclip,
  Heading1,
  Link2,
  ZoomIn,
  ZoomOut,
  PilcrowLeft,
  PilcrowRight,
  Plus,
  Mic,
  CheckSquare,
  ChevronDown,
  Indent,
  Outdent,
  Camera,
} from 'lucide-react';
import { EmojiPicker } from './EmojiPicker';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface WordToolbarProps {
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onBold: () => void;
  onItalic: () => void;
  onUnderline: () => void;
  onStrikethrough?: () => void;
  onSubscript?: () => void;
  onSuperscript?: () => void;
  onClearFormatting?: () => void;
  onCodeBlock?: () => void;
  onHorizontalRule?: () => void;
  onBlockquote?: () => void;
  onTextColor: (color: string) => void;
  onHighlight: (color: string) => void;
  onBulletList: () => void;
  onNumberedList: () => void;
  onImageUpload: () => void;
  onTableInsert: (rows: number, cols: number, style?: string) => void;
  onAlignLeft: () => void;
  onAlignCenter: () => void;
  onAlignRight: () => void;
  onAlignJustify: () => void;
  onTextCase: (caseType: 'upper' | 'lower' | 'capitalize') => void;
  onFontFamily?: (font: string) => void;
  onFontSize?: (size: string) => void;
  onGlobalFontSizeChange?: (size: string) => void;
  onHeading: (level: 1 | 2 | 3 | 'p') => void;
  currentFontFamily?: string;
  currentFontSize?: string;
  onInsertLink?: () => void;
  onInsertNoteLink?: () => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  isStickyNote?: boolean;
  allowImages?: boolean;
  showTable?: boolean;
  onComment?: () => void;
  onTextDirection?: (dir: 'ltr' | 'rtl') => void;
  textDirection?: 'ltr' | 'rtl';
  onAttachment?: () => void;
  onVoiceRecord?: () => void;
  onEmojiInsert?: (emoji: string) => void;
  isBold?: boolean;
  isItalic?: boolean;
  isUnderline?: boolean;
  isStrikethrough?: boolean;
  isSubscript?: boolean;
  isSuperscript?: boolean;
  alignment?: 'left' | 'center' | 'right' | 'justify';
  isBulletList?: boolean;
  isNumberedList?: boolean;
  onIndent?: () => void;
  onOutdent?: () => void;
  onChecklist?: () => void;
  isChecklist?: boolean;
  onScan?: () => void;
}

// Toolbar order types
type ToolbarItemId =
  | 'bold' | 'italic' | 'underline' | 'strikethrough' | 'subscript' | 'superscript'
  | 'clearFormatting' | 'codeBlock' | 'horizontalRule' | 'blockquote' | 'emoji'
  | 'bulletList' | 'numberedList' | 'image' | 'table' | 'highlight' | 'textColor'
  | 'undo' | 'redo' | 'alignLeft' | 'alignCenter' | 'alignRight' | 'alignJustify'
  | 'fontFamily' | 'fontSize' | 'headings' | 'textCase' | 'textDirection'
  | 'comment' | 'link' | 'noteLink' | 'attachment' | 'zoom';

const DEFAULT_TOOLBAR_ORDER: ToolbarItemId[] = [
  'bold', 'italic', 'underline', 'fontFamily', 'fontSize', 'highlight', 'textColor',
  'image', 'table', 'bulletList', 'numberedList',
  'strikethrough', 'subscript', 'superscript',
  'clearFormatting', 'codeBlock', 'horizontalRule', 'blockquote', 'emoji',
  'undo', 'redo', 'alignLeft', 'alignCenter', 'alignRight', 'alignJustify',
  'headings', 'textCase', 'textDirection',
  'comment', 'link', 'noteLink', 'attachment', 'zoom'
];

let cachedToolbarOrder: ToolbarItemId[] = [...DEFAULT_TOOLBAR_ORDER];
let cachedToolbarVisibility: Record<ToolbarItemId, boolean> = DEFAULT_TOOLBAR_ORDER.reduce(
  (acc, id) => ({ ...acc, [id]: true }),
  {} as Record<ToolbarItemId, boolean>
);

export const setCachedToolbarOrder = (order: ToolbarItemId[]) => {
  cachedToolbarOrder = [...order];
};

export const getCachedToolbarOrder = (): ToolbarItemId[] => {
  return cachedToolbarOrder;
};

export const setCachedToolbarVisibility = (visibility: Record<ToolbarItemId, boolean>) => {
  cachedToolbarVisibility = visibility;
};

export const isToolbarItemVisible = (itemId: ToolbarItemId): boolean => {
  return cachedToolbarVisibility[itemId] ?? true;
};

// Initialize visibility and order from stored settings
const initToolbarSettings = async () => {
  try {
    const { getSetting } = await import('@/utils/settingsStorage');
    const storedVisibility = await getSetting<Record<string, boolean> | null>('settings_wordToolbarVisibility', null);
    if (storedVisibility && typeof storedVisibility === 'object') {
      cachedToolbarVisibility = { ...cachedToolbarVisibility, ...storedVisibility };
    }
    const storedOrder = await getSetting<string[] | null>('settings_wordToolbarOrder', null);
    if (storedOrder && Array.isArray(storedOrder)) {
      const existing = new Set(storedOrder as string[]);
      const merged = [...storedOrder] as ToolbarItemId[];
      DEFAULT_TOOLBAR_ORDER.forEach(item => {
        if (!existing.has(item)) merged.push(item);
      });
      cachedToolbarOrder = merged;
    }
  } catch {}
};

initToolbarSettings();

const TEXT_COLORS = [
  '#000000', '#1F2937', '#374151', '#4B5563', '#6B7280', '#9CA3AF',
  '#D1D5DB', '#E5E7EB', '#F3F4F6', '#FFFFFF',
  '#7F1D1D', '#991B1B', '#B91C1C', '#DC2626', '#EF4444', '#F87171',
  '#7C2D12', '#9A3412', '#C2410C', '#EA580C', '#F97316', '#FB923C',
  '#713F12', '#A16207', '#CA8A04', '#EAB308', '#FACC15',
  '#14532D', '#166534', '#15803D', '#16A34A', '#22C55E', '#4ADE80', '#86EFAC',
  '#134E4A', '#115E59', '#0D9488', '#14B8A6', '#2DD4BF',
  '#164E63', '#0E7490', '#0891B2', '#06B6D4', '#22D3EE',
  '#1E3A8A', '#1D4ED8', '#2563EB', '#3B82F6', '#60A5FA', '#93C5FD',
  '#312E81', '#4338CA', '#4F46E5', '#6366F1', '#818CF8',
  '#581C87', '#7E22CE', '#9333EA', '#A855F7', '#C084FC',
  '#831843', '#BE185D', '#DB2777', '#EC4899', '#F472B6',
];

const HIGHLIGHT_COLORS = [
  'transparent',
  '#FEF9C3', '#FEF08A', '#FDE047', '#FACC15', '#EAB308', '#CA8A04',
  '#FFEDD5', '#FED7AA', '#FDBA74', '#FB923C', '#F97316', '#EA580C',
  '#FEE2E2', '#FECACA', '#FCA5A5', '#F87171', '#EF4444', '#DC2626',
  '#FFE4E6', '#FECDD3', '#FDA4AF', '#FB7185', '#F43F5E', '#E11D48',
  '#FCE7F3', '#FBCFE8', '#F9A8D4', '#F472B6', '#EC4899', '#DB2777',
  '#FAE8FF', '#F5D0FE', '#F0ABFC', '#E879F9', '#D946EF', '#C026D3',
  '#F3E8FF', '#E9D5FF', '#D8B4FE', '#C084FC', '#A855F7', '#9333EA',
  '#EDE9FE', '#DDD6FE', '#C4B5FD', '#A78BFA', '#8B5CF6', '#7C3AED',
  '#E0E7FF', '#C7D2FE', '#A5B4FC', '#818CF8', '#6366F1', '#4F46E5',
  '#DBEAFE', '#BFDBFE', '#93C5FD', '#60A5FA', '#3B82F6', '#2563EB',
  '#CFFAFE', '#A5F3FC', '#67E8F9', '#22D3EE', '#06B6D4', '#0891B2',
  '#CCFBF1', '#99F6E4', '#5EEAD4', '#2DD4BF', '#14B8A6', '#0D9488',
  '#DCFCE7', '#BBF7D0', '#86EFAC', '#4ADE80', '#22C55E', '#16A34A',
  '#ECFCCB', '#D9F99D', '#BEF264', '#A3E635', '#84CC16', '#65A30D',
];

interface FontCategory {
  label: string;
  fonts: { name: string; value: string }[];
}

const FONT_CATEGORIES: FontCategory[] = [
  {
    label: '✨ Popular',
    fonts: [
      { name: 'Default', value: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
      { name: 'Inter', value: '"Inter", sans-serif' },
      { name: 'Poppins', value: '"Poppins", sans-serif' },
      { name: 'DM Sans', value: '"DM Sans", sans-serif' },
      { name: 'Outfit', value: '"Outfit", sans-serif' },
      { name: 'Manrope', value: '"Manrope", sans-serif' },
      { name: 'Figtree', value: '"Figtree", sans-serif' },
      { name: 'Lexend', value: '"Lexend", sans-serif' },
      { name: 'Nunito', value: '"Nunito", sans-serif' },
      { name: 'Quicksand', value: '"Quicksand", sans-serif' },
    ],
  },
  {
    label: '🔤 Sans Serif',
    fonts: [
      { name: 'Roboto', value: '"Roboto", sans-serif' },
      { name: 'Open Sans', value: '"Open Sans", sans-serif' },
      { name: 'Lato', value: '"Lato", sans-serif' },
      { name: 'Montserrat', value: '"Montserrat", sans-serif' },
      { name: 'Raleway', value: '"Raleway", sans-serif' },
      { name: 'Ubuntu', value: '"Ubuntu", sans-serif' },
      { name: 'Josefin Sans', value: '"Josefin Sans", sans-serif' },
      { name: 'Work Sans', value: '"Work Sans", sans-serif' },
      { name: 'Cabin', value: '"Cabin", sans-serif' },
      { name: 'Karla', value: '"Karla", sans-serif' },
      { name: 'Mulish', value: '"Mulish", sans-serif' },
      { name: 'Rubik', value: '"Rubik", sans-serif' },
      { name: 'Barlow', value: '"Barlow", sans-serif' },
      { name: 'Exo 2', value: '"Exo 2", sans-serif' },
      { name: 'Noto Sans', value: '"Noto Sans", sans-serif' },
      { name: 'PT Sans', value: '"PT Sans", sans-serif' },
      { name: 'Titillium Web', value: '"Titillium Web", sans-serif' },
    ],
  },
  {
    label: '📜 Serif',
    fonts: [
      { name: 'Playfair Display', value: '"Playfair Display", serif' },
      { name: 'Merriweather', value: '"Merriweather", serif' },
      { name: 'Lora', value: '"Lora", serif' },
      { name: 'EB Garamond', value: '"EB Garamond", serif' },
      { name: 'Crimson Text', value: '"Crimson Text", serif' },
      { name: 'Libre Baskerville', value: '"Libre Baskerville", serif' },
      { name: 'Cormorant', value: '"Cormorant", serif' },
      { name: 'Bitter', value: '"Bitter", serif' },
      { name: 'Spectral', value: '"Spectral", serif' },
      { name: 'Noto Serif', value: '"Noto Serif", serif' },
      { name: 'PT Serif', value: '"PT Serif", serif' },
      { name: 'Vollkorn', value: '"Vollkorn", serif' },
      { name: 'Alegreya', value: '"Alegreya", serif' },
    ],
  },
  {
    label: '✍️ Handwriting',
    fonts: [
      { name: 'Caveat', value: '"Caveat", cursive' },
      { name: 'Dancing Script', value: '"Dancing Script", cursive' },
      { name: 'Pacifico', value: '"Pacifico", cursive' },
      { name: 'Satisfy', value: '"Satisfy", cursive' },
      { name: 'Kalam', value: '"Kalam", cursive' },
      { name: 'Patrick Hand', value: '"Patrick Hand", cursive' },
      { name: 'Indie Flower', value: '"Indie Flower", cursive' },
      { name: 'Architects Daughter', value: '"Architects Daughter", cursive' },
      { name: 'Shadows Into Light', value: '"Shadows Into Light", cursive' },
      { name: 'Gloria Hallelujah', value: '"Gloria Hallelujah", cursive' },
      { name: 'Handlee', value: '"Handlee", cursive' },
      { name: 'Covered By Your Grace', value: '"Covered By Your Grace", cursive' },
      { name: 'Nothing You Could Do', value: '"Nothing You Could Do", cursive' },
      { name: 'Rock Salt', value: '"Rock Salt", cursive' },
      { name: 'Homemade Apple', value: '"Homemade Apple", cursive' },
      { name: 'La Belle Aurore', value: '"La Belle Aurore", cursive' },
      { name: 'Reenie Beanie', value: '"Reenie Beanie", cursive' },
      { name: 'Schoolbell', value: '"Schoolbell", cursive' },
      { name: 'Waiting for the Sunrise', value: '"Waiting for the Sunrise", cursive' },
      { name: 'Zeyada', value: '"Zeyada", cursive' },
      { name: 'Loved by the King', value: '"Loved by the King", cursive' },
      { name: 'Neucha', value: '"Neucha", cursive' },
      { name: 'Just Another Hand', value: '"Just Another Hand", cursive' },
      { name: 'Permanent Marker', value: '"Permanent Marker", cursive' },
      { name: 'Amatic SC', value: '"Amatic SC", cursive' },
    ],
  },
  {
    label: '🖋️ Calligraphy',
    fonts: [
      { name: 'Great Vibes', value: '"Great Vibes", cursive' },
      { name: 'Sacramento', value: '"Sacramento", cursive' },
      { name: 'Allura', value: '"Allura", cursive' },
      { name: 'Alex Brush', value: '"Alex Brush", cursive' },
      { name: 'Tangerine', value: '"Tangerine", cursive' },
      { name: 'Yellowtail', value: '"Yellowtail", cursive' },
      { name: 'Marck Script', value: '"Marck Script", cursive' },
      { name: 'Courgette', value: '"Courgette", cursive' },
      { name: 'Cookie', value: '"Cookie", cursive' },
      { name: 'Damion', value: '"Damion", cursive' },
      { name: 'Mr Dafoe', value: '"Mr Dafoe", cursive' },
      { name: 'Niconne', value: '"Niconne", cursive' },
      { name: 'Pinyon Script', value: '"Pinyon Script", cursive' },
      { name: 'Rouge Script', value: '"Rouge Script", cursive' },
    ],
  },
  {
    label: '💻 Monospace',
    fonts: [
      { name: 'JetBrains Mono', value: '"JetBrains Mono", monospace' },
      { name: 'Fira Code', value: '"Fira Code", monospace' },
      { name: 'Source Code Pro', value: '"Source Code Pro", monospace' },
      { name: 'IBM Plex Mono', value: '"IBM Plex Mono", monospace' },
      { name: 'Roboto Mono', value: '"Roboto Mono", monospace' },
      { name: 'Inconsolata', value: '"Inconsolata", monospace' },
      { name: 'Space Mono', value: '"Space Mono", monospace' },
      { name: 'Courier Prime', value: '"Courier Prime", monospace' },
    ],
  },
  {
    label: '🎨 Display',
    fonts: [
      { name: 'Lobster', value: '"Lobster", cursive' },
      { name: 'Bebas Neue', value: '"Bebas Neue", sans-serif' },
      { name: 'Oswald', value: '"Oswald", sans-serif' },
      { name: 'Righteous', value: '"Righteous", cursive' },
      { name: 'Alfa Slab One', value: '"Alfa Slab One", serif' },
      { name: 'Bangers', value: '"Bangers", cursive' },
      { name: 'Russo One', value: '"Russo One", sans-serif' },
      { name: 'Bungee', value: '"Bungee", cursive' },
      { name: 'Passion One', value: '"Passion One", sans-serif' },
      { name: 'Monoton', value: '"Monoton", cursive' },
    ],
  },
];

const FONT_SIZES = ['10', '12', '14', '16', '18', '20', '24', '28', '32', '36', '48'];

export const WordToolbar = ({
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onBold,
  onItalic,
  onUnderline,
  onStrikethrough,
  onSubscript,
  onSuperscript,
  onClearFormatting,
  onCodeBlock,
  onHorizontalRule,
  onBlockquote,
  onTextColor,
  onHighlight,
  onBulletList,
  onNumberedList,
  onImageUpload,
  onTableInsert,
  onAlignLeft,
  onAlignCenter,
  onAlignRight,
  onAlignJustify,
  onTextCase,
  onFontFamily,
  onFontSize,
  onHeading,
  currentFontFamily,
  currentFontSize = '16',
  onInsertLink,
  onInsertNoteLink,
  zoom,
  onZoomChange,
  isStickyNote = false,
  allowImages = true,
  showTable = true,
  onComment,
  onTextDirection,
  textDirection = 'ltr',
  onAttachment,
  onVoiceRecord,
  onEmojiInsert,
  isBold = false,
  isItalic = false,
  isUnderline = false,
  isStrikethrough = false,
  isSubscript = false,
  isSuperscript = false,
  alignment = 'left',
  isBulletList = false,
  isNumberedList = false,
  onIndent,
  onOutdent,
  onChecklist,
  isChecklist = false,
  onScan,
}: WordToolbarProps) => {
  const { t } = useTranslation();
  const [fontSizeOpen, setFontSizeOpen] = useState(false);
  const [fontFamilyOpen, setFontFamilyOpen] = useState(false);
  const [tableRows, setTableRows] = useState(3);
  const [tableCols, setTableCols] = useState(3);
  const [tableOpen, setTableOpen] = useState(false);
  const [textColorOpen, setTextColorOpen] = useState(false);
  const [highlightOpen, setHighlightOpen] = useState(false);
  const [headingOpen, setHeadingOpen] = useState(false);
  const [alignOpen, setAlignOpen] = useState(false);
  const [selectedTextColor, setSelectedTextColor] = useState('#000000');
  const [selectedHighlight, setSelectedHighlight] = useState('transparent');
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const handleVisibilityChange = (event: CustomEvent<{ visibility: Record<ToolbarItemId, boolean> }>) => {
      setCachedToolbarVisibility(event.detail.visibility);
      forceUpdate(n => n + 1);
    };
    const handleOrderChange = (event: CustomEvent<{ order: ToolbarItemId[] }>) => {
      setCachedToolbarOrder(event.detail.order);
      forceUpdate(n => n + 1);
    };

    window.addEventListener('toolbarVisibilityChanged', handleVisibilityChange as EventListener);
    window.addEventListener('toolbarOrderChanged', handleOrderChange as EventListener);
    return () => {
      window.removeEventListener('toolbarVisibilityChanged', handleVisibilityChange as EventListener);
      window.removeEventListener('toolbarOrderChanged', handleOrderChange as EventListener);
    };
  }, []);

  // Get display name for current font
  const getCurrentFontName = () => {
    if (!currentFontFamily) return 'Font';
    for (const cat of FONT_CATEGORIES) {
      const found = cat.fonts.find(f => f.value === currentFontFamily);
      if (found) return found.name;
    }
    return 'Font';
  };

  const IconBtn = ({
    onClick,
    disabled,
    title,
    active = false,
    children,
  }: {
    onClick?: () => void;
    disabled?: boolean;
    title: string;
    active?: boolean;
    children: React.ReactNode;
  }) => (
    <button
      type="button"
      onClick={onClick}
      onMouseDown={(e) => e.preventDefault()}
      onPointerDown={(e) => e.preventDefault()}
      disabled={disabled}
      title={title}
      className={cn(
        "h-[38px] w-[38px] flex items-center justify-center rounded-lg transition-all duration-150 flex-shrink-0",
        "hover:bg-accent/60 active:scale-95",
        active && "bg-primary/12 text-primary shadow-sm",
        disabled && "opacity-30 pointer-events-none"
      )}
    >
      {children}
    </button>
  );

  // Separators removed — uniform gap used instead

  // Helper to stop blinking: prevent focus steal on all popover interactions
  const preventFocus = (e: Event | React.SyntheticEvent) => e.preventDefault();

  const isAndroidNative = typeof document !== 'undefined' && document.body.classList.contains('android-app');

  return (
    <div
      className={cn("mx-3", isAndroidNative ? "mb-0.5" : "mb-2")}
    >
      <div
        className={cn(
          "rounded-full flex items-center gap-0.5 px-3 overflow-x-auto scrollbar-hide h-[48px]",
          isStickyNote ? "bg-card" : "bg-card"
        )}
        style={{
          boxShadow: '0 -3px 12px -2px rgba(0,0,0,0.06), 0 4px 16px -2px rgba(0,0,0,0.12), 0 2px 6px -1px rgba(0,0,0,0.08)',
        }}
        data-tour="word-toolbar"
      >
        
        {/* Group 1: Bold, Italic, Underline */}
        {isToolbarItemVisible('bold') && (
          <IconBtn onClick={onBold} title={t('wordToolbar.bold')} active={isBold}>
            <Bold className="h-[18px] w-[18px]" strokeWidth={2.5} />
          </IconBtn>
        )}
        {isToolbarItemVisible('italic') && (
          <IconBtn onClick={onItalic} title={t('wordToolbar.italic')} active={isItalic}>
            <Italic className="h-[18px] w-[18px]" strokeWidth={2.5} />
          </IconBtn>
        )}
        {isToolbarItemVisible('underline') && (
          <IconBtn onClick={onUnderline} title={t('wordToolbar.underline')} active={isUnderline}>
            <UnderlineIcon className="h-[18px] w-[18px]" strokeWidth={2.5} />
          </IconBtn>
        )}


        {/* Group 2: Text Color & Highlight */}
        {isToolbarItemVisible('textColor') && (
          <Popover open={textColorOpen} onOpenChange={setTextColorOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                title={t('wordToolbar.textColor')}
                onMouseDown={preventFocus}
                onPointerDown={preventFocus}
                className="h-[38px] w-[38px] flex flex-col items-center justify-center gap-0.5 rounded-lg hover:bg-accent/60 active:scale-95 transition-all flex-shrink-0"
              >
                <span className="text-[15px] font-bold leading-none">A</span>
                <div className="h-1 w-4 rounded-full" style={{ backgroundColor: selectedTextColor }} />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-2 max-h-72 overflow-y-auto" align="start" onOpenAutoFocus={preventFocus} onCloseAutoFocus={preventFocus}>
              <div className="grid grid-cols-10 gap-1">
                {TEXT_COLORS.map((color) => (
                  <button key={color} type="button" onPointerDown={(e) => { e.preventDefault(); onTextColor(color); setSelectedTextColor(color); setTextColorOpen(false); }} className={cn("h-6 w-6 rounded-full border border-border/50 hover:scale-110 transition-transform", selectedTextColor === color && "ring-2 ring-primary ring-offset-1", color === '#FFFFFF' && "border-border")} style={{ backgroundColor: color }} title={color} />
                ))}
              </div>
            </PopoverContent>
          </Popover>
        )}

        {isToolbarItemVisible('highlight') && (
          <Popover open={highlightOpen} onOpenChange={setHighlightOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                title={t('wordToolbar.highlight')}
                onMouseDown={preventFocus}
                onPointerDown={preventFocus}
                className="h-[38px] w-[38px] flex items-center justify-center rounded-lg hover:bg-accent/60 active:scale-95 transition-all flex-shrink-0"
              >
                <Highlighter className="h-[18px] w-[18px]" strokeWidth={2.5} />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-2 max-h-64 overflow-y-auto" align="start" onOpenAutoFocus={preventFocus} onCloseAutoFocus={preventFocus}>
              <div className="grid grid-cols-6 gap-1">
                {HIGHLIGHT_COLORS.map((color) => (
                  <button key={color} type="button" onPointerDown={(e) => { e.preventDefault(); onHighlight(color); setSelectedHighlight(color); setHighlightOpen(false); }} className={cn("h-6 w-6 rounded-full border border-border/50 hover:scale-110 transition-transform", color === 'transparent' && "bg-[repeating-linear-gradient(45deg,#ccc,#ccc_2px,#fff_2px,#fff_4px)]", selectedHighlight === color && "ring-2 ring-primary ring-offset-1")} style={{ backgroundColor: color === 'transparent' ? undefined : color }} title={color === 'transparent' ? 'None' : color} />
                ))}
              </div>
            </PopoverContent>
          </Popover>
        )}


        {/* Group 3: Lists */}
        {isToolbarItemVisible('bulletList') && (
          <IconBtn onClick={onBulletList} title={t('wordToolbar.bulletList')} active={isBulletList}>
            <List className="h-[18px] w-[18px]" strokeWidth={2.5} />
          </IconBtn>
        )}
        {isToolbarItemVisible('numberedList') && (
          <IconBtn onClick={onNumberedList} title={t('wordToolbar.numberedList')} active={isNumberedList}>
            <ListOrdered className="h-[18px] w-[18px]" strokeWidth={2.5} />
          </IconBtn>
        )}


        {/* Group 4: Text Direction */}
        {onTextDirection && isToolbarItemVisible('textDirection') && (
          <>
            <IconBtn onClick={() => onTextDirection('ltr')} title={t('wordToolbar.leftToRight')} active={textDirection === 'ltr'}>
              <PilcrowLeft className="h-[18px] w-[18px]" strokeWidth={2.5} />
            </IconBtn>
            <IconBtn onClick={() => onTextDirection('rtl')} title={t('wordToolbar.rightToLeft')} active={textDirection === 'rtl'}>
              <PilcrowRight className="h-[18px] w-[18px]" strokeWidth={2.5} />
            </IconBtn>
          </>
        )}


        {/* Group 5: Strikethrough, Headings, Alignment, etc */}
        {onStrikethrough && isToolbarItemVisible('strikethrough') && (
          <IconBtn onClick={onStrikethrough} title={t('wordToolbar.strikethrough')} active={isStrikethrough}>
            <Strikethrough className="h-[18px] w-[18px]" strokeWidth={2.5} />
          </IconBtn>
        )}

        {isToolbarItemVisible('headings') && (
          <Popover open={headingOpen} onOpenChange={setHeadingOpen}>
            <PopoverTrigger asChild>
              <button type="button" title={t('wordToolbar.headings')} onMouseDown={preventFocus} onPointerDown={preventFocus} className="h-[38px] w-[38px] flex items-center justify-center rounded-lg hover:bg-accent/60 active:scale-95 transition-all flex-shrink-0">
                <Heading1 className="h-[18px] w-[18px]" strokeWidth={2.5} />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-32 p-1" align="start" onOpenAutoFocus={preventFocus} onCloseAutoFocus={preventFocus}>
              <button type="button" onClick={() => { onHeading(1); setHeadingOpen(false); }} onMouseDown={preventFocus} className="w-full px-2 py-1.5 text-left text-lg font-bold rounded hover:bg-muted">{t('wordToolbar.heading1')}</button>
              <button type="button" onClick={() => { onHeading(2); setHeadingOpen(false); }} onMouseDown={preventFocus} className="w-full px-2 py-1.5 text-left text-base font-bold rounded hover:bg-muted">{t('wordToolbar.heading2')}</button>
              <button type="button" onClick={() => { onHeading(3); setHeadingOpen(false); }} onMouseDown={preventFocus} className="w-full px-2 py-1.5 text-left text-sm font-semibold rounded hover:bg-muted">{t('wordToolbar.heading3')}</button>
              <button type="button" onClick={() => { onHeading('p'); setHeadingOpen(false); }} onMouseDown={preventFocus} className="w-full px-2 py-1.5 text-left text-sm rounded hover:bg-muted">{t('wordToolbar.normal')}</button>
            </PopoverContent>
          </Popover>
        )}

        {(isToolbarItemVisible('alignLeft') || isToolbarItemVisible('alignCenter') || isToolbarItemVisible('alignRight') || isToolbarItemVisible('alignJustify')) && (
          <Popover open={alignOpen} onOpenChange={setAlignOpen}>
            <PopoverTrigger asChild>
              <button type="button" title={t('wordToolbar.alignment')} onMouseDown={preventFocus} onPointerDown={preventFocus} className="h-[38px] w-[38px] flex items-center justify-center rounded-lg hover:bg-accent/60 active:scale-95 transition-all flex-shrink-0">
                {alignment === 'left' && <AlignLeft className="h-[18px] w-[18px]" strokeWidth={2.5} />}
                {alignment === 'center' && <AlignCenter className="h-[18px] w-[18px]" strokeWidth={2.5} />}
                {alignment === 'right' && <AlignRight className="h-[18px] w-[18px]" strokeWidth={2.5} />}
                {alignment === 'justify' && <AlignJustify className="h-[18px] w-[18px]" strokeWidth={2.5} />}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-1" align="start" onOpenAutoFocus={preventFocus} onCloseAutoFocus={preventFocus}>
              <div className="flex gap-0.5">
                <IconBtn onClick={() => { onAlignLeft(); setAlignOpen(false); }} title={t('wordToolbar.left')} active={alignment === 'left'}><AlignLeft className="h-[18px] w-[18px]" strokeWidth={2.5} /></IconBtn>
                <IconBtn onClick={() => { onAlignCenter(); setAlignOpen(false); }} title={t('wordToolbar.center')} active={alignment === 'center'}><AlignCenter className="h-[18px] w-[18px]" strokeWidth={2.5} /></IconBtn>
                <IconBtn onClick={() => { onAlignRight(); setAlignOpen(false); }} title={t('wordToolbar.right')} active={alignment === 'right'}><AlignRight className="h-[18px] w-[18px]" strokeWidth={2.5} /></IconBtn>
                <IconBtn onClick={() => { onAlignJustify(); setAlignOpen(false); }} title={t('wordToolbar.justify')} active={alignment === 'justify'}><AlignJustify className="h-[18px] w-[18px]" strokeWidth={2.5} /></IconBtn>
              </div>
            </PopoverContent>
          </Popover>
        )}

        {onChecklist && (
          <IconBtn onClick={onChecklist} title={t('wordToolbar.checklist')} active={isChecklist}>
            <CheckSquare className="h-[18px] w-[18px]" strokeWidth={2.5} />
          </IconBtn>
        )}

        {onOutdent && (
          <IconBtn onClick={onOutdent} title={t('wordToolbar.decreaseIndent')}><Outdent className="h-[18px] w-[18px]" strokeWidth={2.5} /></IconBtn>
        )}
        {onIndent && (
          <IconBtn onClick={onIndent} title={t('wordToolbar.increaseIndent')}><Indent className="h-[18px] w-[18px]" strokeWidth={2.5} /></IconBtn>
        )}

        {showTable && isToolbarItemVisible('table') && (
          <Popover open={tableOpen} onOpenChange={setTableOpen}>
            <PopoverTrigger asChild>
              <button type="button" title={t('wordToolbar.insertTable')} onMouseDown={preventFocus} onPointerDown={preventFocus} className="h-[38px] w-[38px] flex items-center justify-center rounded-lg hover:bg-accent/60 active:scale-95 transition-all flex-shrink-0">
                <Table className="h-[18px] w-[18px]" strokeWidth={2.5} />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-3" align="start" onOpenAutoFocus={preventFocus} onCloseAutoFocus={preventFocus}>
              <div className="space-y-3">
                <p className="text-xs font-medium text-muted-foreground">{t('wordToolbar.insertTable')}</p>
                <div className="flex items-center justify-between text-sm">
                  <span>{t('wordToolbar.rows')}</span>
                  <div className="flex items-center gap-1">
                    <button type="button" onPointerDown={(e) => { e.preventDefault(); setTableRows(Math.max(1, tableRows - 1)); }} className="h-6 w-6 flex items-center justify-center rounded border hover:bg-muted"><Minus className="h-3 w-3" /></button>
                    <span className="w-6 text-center font-semibold">{tableRows}</span>
                    <button type="button" onPointerDown={(e) => { e.preventDefault(); setTableRows(Math.min(10, tableRows + 1)); }} className="h-6 w-6 flex items-center justify-center rounded border hover:bg-muted"><Plus className="h-3 w-3" /></button>
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span>{t('wordToolbar.cols')}</span>
                  <div className="flex items-center gap-1">
                    <button type="button" onPointerDown={(e) => { e.preventDefault(); setTableCols(Math.max(1, tableCols - 1)); }} className="h-6 w-6 flex items-center justify-center rounded border hover:bg-muted"><Minus className="h-3 w-3" /></button>
                    <span className="w-6 text-center font-semibold">{tableCols}</span>
                    <button type="button" onPointerDown={(e) => { e.preventDefault(); setTableCols(Math.min(8, tableCols + 1)); }} className="h-6 w-6 flex items-center justify-center rounded border hover:bg-muted"><Plus className="h-3 w-3" /></button>
                  </div>
                </div>
                <button type="button" onPointerDown={(e) => { e.preventDefault(); onTableInsert(tableRows, tableCols); setTableOpen(false); }} className="w-full h-8 text-sm font-semibold bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors">{t('wordToolbar.insert')}</button>
              </div>
            </PopoverContent>
          </Popover>
        )}

        {allowImages && isToolbarItemVisible('image') && (
          <IconBtn onClick={onImageUpload} title={t('wordToolbar.insertImage')}><ImageIcon className="h-[18px] w-[18px]" strokeWidth={2.5} /></IconBtn>
        )}

        {onHorizontalRule && isToolbarItemVisible('horizontalRule') && (
          <IconBtn onClick={onHorizontalRule} title={t('wordToolbar.horizontalLine')}><Minus className="h-[18px] w-[18px]" strokeWidth={2.5} /></IconBtn>
        )}

        {onSubscript && isToolbarItemVisible('subscript') && (
          <IconBtn onClick={onSubscript} title={t('wordToolbar.subscript')} active={isSubscript}><Subscript className="h-[18px] w-[18px]" strokeWidth={2.5} /></IconBtn>
        )}
        {onSuperscript && isToolbarItemVisible('superscript') && (
          <IconBtn onClick={onSuperscript} title={t('wordToolbar.superscript')} active={isSuperscript}><Superscript className="h-[18px] w-[18px]" strokeWidth={2.5} /></IconBtn>
        )}

        {onCodeBlock && isToolbarItemVisible('codeBlock') && (
          <IconBtn onClick={onCodeBlock} title={t('wordToolbar.codeBlock')}><Code className="h-[18px] w-[18px]" strokeWidth={2.5} /></IconBtn>
        )}

        {onBlockquote && isToolbarItemVisible('blockquote') && (
          <IconBtn onClick={onBlockquote} title={t('wordToolbar.blockquote')}><Quote className="h-[18px] w-[18px]" strokeWidth={2.5} /></IconBtn>
        )}

        {onComment && isToolbarItemVisible('comment') && (
          <IconBtn onClick={onComment} title={t('wordToolbar.comment')}><span className="text-xs font-bold">💬</span></IconBtn>
        )}


        {/* Undo/Redo */}
        {isToolbarItemVisible('undo') && (
          <IconBtn onClick={onUndo} disabled={!canUndo} title={t('wordToolbar.undo')}>
            <Undo className="h-[18px] w-[18px]" strokeWidth={2.5} />
          </IconBtn>
        )}
        {isToolbarItemVisible('redo') && (
          <IconBtn onClick={onRedo} disabled={!canRedo} title={t('wordToolbar.redo')}>
            <Redo className="h-[18px] w-[18px]" strokeWidth={2.5} />
          </IconBtn>
        )}


        {/* Font Family & Font Size at end */}
        {onFontFamily && isToolbarItemVisible('fontFamily') && (
          <Popover open={fontFamilyOpen} onOpenChange={setFontFamilyOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                title={t('wordToolbar.fontFamily')}
                onMouseDown={preventFocus}
                onPointerDown={preventFocus}
                className="h-[38px] px-2.5 flex items-center gap-0.5 rounded-lg hover:bg-accent/60 active:scale-95 transition-all flex-shrink-0"
              >
                <span className="text-[15px] font-bold leading-none">T</span>
                <span className="text-[11px] font-semibold text-muted-foreground leading-none">т</span>
              </button>
            </PopoverTrigger>
            <PopoverContent
              className="w-64 p-0 overflow-hidden"
              align="start"
              onOpenAutoFocus={preventFocus}
              onCloseAutoFocus={preventFocus}
            >
              <div className="max-h-[360px] overflow-y-auto p-1.5">
                {FONT_CATEGORIES.map((category) => (
                  <div key={category.label} className="mb-1">
                    <div className="px-2 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider sticky top-0 bg-popover z-10">
                      {category.label}
                    </div>
                    {category.fonts.map((font) => (
                      <button
                        key={font.name}
                        type="button"
                        onClick={() => { onFontFamily(font.value); setFontFamilyOpen(false); }}
                        onMouseDown={preventFocus}
                        className={cn(
                          "w-full px-2.5 py-2 text-left rounded-lg hover:bg-muted transition-colors flex items-center justify-between",
                          currentFontFamily === font.value && "bg-primary/10"
                        )}
                      >
                        <span className={cn("text-sm", currentFontFamily === font.value && "text-primary font-medium")} style={{ fontFamily: font.value }}>
                          {font.name}
                        </span>
                        {currentFontFamily === font.value && <span className="text-primary text-xs">✓</span>}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        )}

        {onFontSize && isToolbarItemVisible('fontSize') && (
          <div className="flex items-center flex-shrink-0">
            <button
              type="button"
              onMouseDown={preventFocus}
              onPointerDown={(e) => { e.preventDefault(); const idx = FONT_SIZES.indexOf(currentFontSize); if (idx > 0) onFontSize(FONT_SIZES[idx - 1]); }}
              className="h-[38px] w-8 flex items-center justify-center rounded-l-lg hover:bg-accent/60 active:scale-95 transition-all"
              title={t('editor.decrease', 'Decrease')}
            >
              <Minus className="h-4 w-4" strokeWidth={2.5} />
            </button>
            <Popover open={fontSizeOpen} onOpenChange={setFontSizeOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  title={t('wordToolbar.fontSize')}
                  onMouseDown={preventFocus}
                  onPointerDown={preventFocus}
                  className="h-[38px] px-1 flex items-center justify-center hover:bg-accent/60 transition-all text-sm font-bold tabular-nums min-w-[28px]"
                >
                  {currentFontSize}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-20 p-1" align="center" onOpenAutoFocus={preventFocus} onCloseAutoFocus={preventFocus}>
                <div className="max-h-48 overflow-y-auto">
                  {FONT_SIZES.map((size) => (
                    <button key={size} type="button" onClick={() => { onFontSize(size); setFontSizeOpen(false); }} onMouseDown={preventFocus} className={cn("w-full px-2 py-1.5 text-sm text-left rounded hover:bg-muted transition-colors", currentFontSize === size && "bg-primary/10 text-primary font-medium")}>{size}</button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <button
              type="button"
              onMouseDown={preventFocus}
              onPointerDown={(e) => { e.preventDefault(); const idx = FONT_SIZES.indexOf(currentFontSize); if (idx < FONT_SIZES.length - 1) onFontSize(FONT_SIZES[idx + 1]); }}
              className="h-[38px] w-8 flex items-center justify-center rounded-r-lg hover:bg-accent/60 active:scale-95 transition-all"
              title={t('editor.increase', 'Increase')}
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} />
            </button>
          </div>
        )}

        {onScan && (
          <IconBtn onClick={onScan} title={t('scanNote.scan', 'Scan')}>
            <Camera className="h-[18px] w-[18px]" strokeWidth={2.5} />
          </IconBtn>
        )}

        {isToolbarItemVisible('zoom') && (
          <div className="flex items-center gap-0 flex-shrink-0">
            <IconBtn onClick={() => onZoomChange(Math.max(50, zoom - 10))} disabled={zoom <= 50} title={t('wordToolbar.zoomOut')}><ZoomOut className="h-[18px] w-[18px]" strokeWidth={2.5} /></IconBtn>
            <span className="text-sm font-bold w-12 text-center tabular-nums">{zoom}%</span>
            <IconBtn onClick={() => onZoomChange(Math.min(200, zoom + 10))} disabled={zoom >= 200} title={t('wordToolbar.zoomIn')}><ZoomIn className="h-[18px] w-[18px]" strokeWidth={2.5} /></IconBtn>
          </div>
        )}
      </div>
    </div>
  );
};
