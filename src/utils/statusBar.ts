import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

/**
 * HSL background hex colors for each theme — must match index.css --background values.
 * light = 0 0% 100% → #ffffff
 * dark/forest = 140 30% 12% → #152518
 * ocean = 210 50% 10% → #0d1a26
 * sunset = 15 30% 10% → #211a14
 * rose = 340 25% 12% → #261520
 * midnight = 250 30% 10% → #121026
 * minimal = 220 10% 12% → #1c1e21
 * nebula = 280 35% 10% → #1a0d26
 * obsidian = 230 20% 8% → #101420
 * graphite = 200 15% 10% → #161c1e
 * onyx = 0 0% 8% → #141414
 * charcoal = 30 8% 10% → #1c1a18
 */
const THEME_STATUS_BAR_COLORS: Record<string, string> = {
  light: '#ffffff',
  dark: '#152518',
  forest: '#152518',
  ocean: '#0d1a26',
  sunset: '#211a14',
  rose: '#261520',
  midnight: '#121026',
  minimal: '#1c1e21',
  nebula: '#1a0d26',
  obsidian: '#101420',
  graphite: '#161c1e',
  onyx: '#141414',
  charcoal: '#1c1a18',
};

/**
 * Configure the Android/iOS status bar to blend seamlessly with the app.
 *
 * Capacitor Style enum:
 *   Style.Dark  → dark (black) icons — use on LIGHT backgrounds
 *   Style.Light → light (white) icons — use on DARK backgrounds
 */
export const configureStatusBar = async (isDarkMode: boolean, themeId?: string) => {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const platform = Capacitor.getPlatform();

    // Both iOS and Android: overlay content behind status bar for seamless look
    await StatusBar.setOverlaysWebView({ overlay: true });

    await StatusBar.setStyle({
      style: isDarkMode ? Style.Light : Style.Dark,
    });

    if (platform === 'android') {
      // Transparent status bar — app content extends behind it
      await StatusBar.setBackgroundColor({ color: '#00000000' });
    }

    console.log('[StatusBar] Configured for theme:', themeId || (isDarkMode ? 'dark' : 'light'));
  } catch (error) {
    console.warn('[StatusBar] Configuration failed:', error);
  }
};

/**
 * Update status bar style when theme changes
 */
export const updateStatusBarStyle = async (isDarkMode: boolean, themeId?: string) => {
  if (!Capacitor.isNativePlatform()) return;

  try {
    await StatusBar.setStyle({
      style: isDarkMode ? Style.Light : Style.Dark,
    });

    if (Capacitor.getPlatform() === 'android') {
      // Keep transparent so app extends behind status bar
      await StatusBar.setBackgroundColor({ color: '#00000000' });
    }
  } catch (error) {
    console.warn('[StatusBar] Style update failed:', error);
  }
};
