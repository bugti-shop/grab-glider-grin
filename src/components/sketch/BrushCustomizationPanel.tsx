import { useRef, useState, useCallback, useEffect } from 'react';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { ImagePlus, Trash2, RotateCw } from 'lucide-react';
import type { BrushSettings, DrawToolType } from './SketchTypes';
import { DEFAULT_BRUSH_SETTINGS } from './SketchTypes';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

interface BrushCustomizationPanelProps {
  tool: DrawToolType;
  strokeWidth: number;
  onStrokeWidthChange: (w: number) => void;
  toolOpacity: number;
  onToolOpacityChange: (o: number) => void;
  brushSettings: BrushSettings;
  onBrushSettingChange: (key: keyof BrushSettings, value: number | string | undefined) => void;
  currentColor: string;
}

const CUSTOM_BRUSH_STORAGE_KEY = 'sketch-custom-brush-tips';

const loadSavedBrushTips = (): { id: string; name: string; dataUrl: string }[] => {
  // Sync fallback - actual async load happens in component useEffect
  return [];
};

const saveBrushTips = (tips: { id: string; name: string; dataUrl: string }[]) => {
  import('@/utils/settingsStorage').then(({ setSetting }) => {
    setSetting(CUSTOM_BRUSH_STORAGE_KEY, tips).catch(console.error);
  });
};

/** Convert a B&W image to an alpha-based brush tip data URL */
const imageToAlphaBrush = (img: HTMLImageElement, size = 64): string => {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, size, size);
  const imageData = ctx.getImageData(0, 0, size, size);
  const data = imageData.data;
  // Convert brightness to alpha: darker = more opaque
  for (let i = 0; i < data.length; i += 4) {
    const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
    const alpha = 255 - brightness; // Invert: black=opaque, white=transparent
    data[i] = 0;     // R
    data[i + 1] = 0; // G
    data[i + 2] = 0; // B
    data[i + 3] = alpha;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
};

export const BrushCustomizationPanel = ({
  tool,
  strokeWidth,
  onStrokeWidthChange,
  toolOpacity,
  onToolOpacityChange,
  brushSettings,
  onBrushSettingChange,
  currentColor,
}: BrushCustomizationPanelProps) => {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [savedTips, setSavedTips] = useState(() => loadSavedBrushTips());
  const spacing = brushSettings.spacing ?? 0;
  const activeTip = brushSettings.customBrushTip;

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const tipDataUrl = imageToAlphaBrush(img);
        const newTip = {
          id: `tip-${Date.now()}`,
          name: file.name.replace(/\.[^.]+$/, ''),
          dataUrl: tipDataUrl,
        };
        const updated = [...savedTips, newTip];
        setSavedTips(updated);
        saveBrushTips(updated);
        onBrushSettingChange('customBrushTip', tipDataUrl);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }, [savedTips, onBrushSettingChange]);

  const deleteTip = useCallback((id: string) => {
    const updated = savedTips.filter(t => t.id !== id);
    setSavedTips(updated);
    saveBrushTips(updated);
    if (activeTip) {
      const deleted = savedTips.find(t => t.id === id);
      if (deleted && deleted.dataUrl === activeTip) {
        onBrushSettingChange('customBrushTip', undefined);
      }
    }
  }, [savedTips, activeTip, onBrushSettingChange]);

  // Live brush preview
  const previewRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Draw preview dots/stroke
    ctx.globalAlpha = toolOpacity;
    const dotSize = Math.min(strokeWidth * 2, h * 0.6);
    const effectiveSpacing = spacing > 0 ? dotSize * (0.5 + spacing * 0.05) : dotSize * 0.3;
    const y = h / 2;

    if (activeTip) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, w, h);
        ctx.globalAlpha = toolOpacity;
        let x = dotSize;
        while (x < w - dotSize) {
          ctx.drawImage(img, x - dotSize / 2, y - dotSize / 2, dotSize, dotSize);
          x += Math.max(effectiveSpacing, 2);
        }
      };
      img.src = activeTip;
    } else {
      ctx.fillStyle = currentColor;
      let x = dotSize;
      while (x < w - dotSize) {
        ctx.beginPath();
        ctx.arc(x, y, dotSize / 2, 0, Math.PI * 2);
        ctx.fill();
        x += Math.max(effectiveSpacing, 2);
      }
    }
  }, [strokeWidth, toolOpacity, spacing, activeTip, currentColor]);

  return (
    <div className="space-y-3 min-w-[240px]">
      {/* Live preview */}
      <div className="rounded-lg border border-border bg-muted/30 overflow-hidden">
        <canvas ref={previewRef} width={240} height={48} className="w-full h-12" />
      </div>

      {/* Brush Size */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <p className="text-[10px] text-muted-foreground font-medium">
            {t('sketch.brushSize', 'Brush Size')}
          </p>
          <span className="text-[10px] font-mono text-foreground bg-muted rounded px-1.5 py-0.5">{strokeWidth}px</span>
        </div>
        <Slider min={1} max={50} step={1} value={[strokeWidth]} onValueChange={([v]) => onStrokeWidthChange(v)} />
      </div>

      {/* Opacity */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <p className="text-[10px] text-muted-foreground font-medium">
            {t('sketch.opacity', 'Opacity')}
          </p>
          <span className="text-[10px] font-mono text-foreground bg-muted rounded px-1.5 py-0.5">{Math.round(toolOpacity * 100)}%</span>
        </div>
        <Slider min={5} max={100} step={5} value={[Math.round(toolOpacity * 100)]} onValueChange={([v]) => onToolOpacityChange(v / 100)} />
      </div>

      {/* Spacing */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <p className="text-[10px] text-muted-foreground font-medium">
            {t('sketch.brushSpacing', 'Spacing')}
          </p>
          <span className="text-[10px] font-mono text-foreground bg-muted rounded px-1.5 py-0.5">{spacing}%</span>
        </div>
        <Slider min={0} max={100} step={1} value={[spacing]} onValueChange={([v]) => onBrushSettingChange('spacing', v)} />
      </div>

      {/* Custom Brush Tips */}
      <div className="pt-2 border-t border-border">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-semibold text-foreground">
            {t('sketch.customBrushTips', 'Custom Brush Tips')}
          </p>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => fileInputRef.current?.click()}
            title={t('sketch.importBrushTip', 'Import brush from image')}
          >
            <ImagePlus className="h-3.5 w-3.5" />
          </Button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageUpload}
        />

        <div className="flex gap-1.5 flex-wrap">
          {/* Default (no custom tip) */}
          <button
            className={cn(
              'w-10 h-10 rounded-lg border-2 transition-all flex items-center justify-center bg-muted/50',
              !activeTip ? 'border-primary scale-105 shadow-sm' : 'border-border/50 hover:scale-105'
            )}
            onClick={() => onBrushSettingChange('customBrushTip', undefined)}
            title={t('sketch.defaultBrush', 'Default')}
          >
            <div className="w-4 h-4 rounded-full bg-foreground" />
          </button>

          {savedTips.map((tip) => (
            <div key={tip.id} className="relative group">
              <button
                className={cn(
                  'w-10 h-10 rounded-lg border-2 transition-all overflow-hidden bg-white',
                  activeTip === tip.dataUrl ? 'border-primary scale-105 shadow-sm' : 'border-border/50 hover:scale-105'
                )}
                onClick={() => onBrushSettingChange('customBrushTip', tip.dataUrl)}
                title={tip.name}
              >
                <img src={tip.dataUrl} alt={tip.name} className="w-full h-full object-contain invert dark:invert-0" />
              </button>
              <button
                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => { e.stopPropagation(); deleteTip(tip.id); }}
              >
                <Trash2 className="h-2.5 w-2.5" />
              </button>
            </div>
          ))}
        </div>

        {savedTips.length === 0 && (
          <p className="text-[9px] text-muted-foreground mt-1">
            {t('sketch.importBrushHint', 'Import a black & white image to create a custom brush tip')}
          </p>
        )}
      </div>
    </div>
  );
};
