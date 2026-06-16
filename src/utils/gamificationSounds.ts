// Gamification sound effects for achievements, level ups, and rewards
import { getSetting, setSetting } from '@/utils/settingsStorage';

let gamificationSoundsEnabled = true;
let soundsInitialized = false;

// Initialize settings from IndexedDB
const initSettings = async () => {
  if (soundsInitialized) return;
  soundsInitialized = true;
  gamificationSoundsEnabled = await getSetting<boolean>('gamificationSounds', true);
};

initSettings();

/**
 * Play a celebratory level up sound
 */
export const playLevelUpSound = (): void => {
  if (!gamificationSoundsEnabled) return;
  
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Create ascending arpeggio for level up
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    
    notes.forEach((freq, i) => {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.setValueAtTime(freq, audioContext.currentTime + i * 0.1);
      oscillator.type = 'sine';
      
      const startTime = audioContext.currentTime + i * 0.1;
      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(0.3, startTime + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.3);
      
      oscillator.start(startTime);
      oscillator.stop(startTime + 0.3);
    });
    
    // Add a final triumphant chord
    setTimeout(() => {
      const chord = [523.25, 659.25, 783.99, 1046.50];
      chord.forEach((freq) => {
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        
        osc.connect(gain);
        gain.connect(audioContext.destination);
        
        osc.frequency.setValueAtTime(freq, audioContext.currentTime);
        osc.type = 'triangle';
        
        gain.gain.setValueAtTime(0.15, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.8);
        
        osc.start(audioContext.currentTime);
        osc.stop(audioContext.currentTime + 0.8);
      });
    }, 400);
    
    setTimeout(() => audioContext.close(), 1500);
  } catch (error) {
    console.error('Error playing level up sound:', error);
  }
};

/**
 * Play achievement unlock sound
 */
export const playAchievementSound = (): void => {
  if (!gamificationSoundsEnabled) return;
  
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Sparkle/chime sound for achievements
    const frequencies = [1318.51, 1567.98, 2093.00]; // E6, G6, C7
    
    frequencies.forEach((freq, i) => {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      const startTime = audioContext.currentTime + i * 0.08;
      oscillator.frequency.setValueAtTime(freq, startTime);
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(0.25, startTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.4);
      
      oscillator.start(startTime);
      oscillator.stop(startTime + 0.4);
    });
    
    // Add shimmer effect
    for (let i = 0; i < 3; i++) {
      const shimmer = audioContext.createOscillator();
      const shimmerGain = audioContext.createGain();
      
      shimmer.connect(shimmerGain);
      shimmerGain.connect(audioContext.destination);
      
      const startTime = audioContext.currentTime + 0.3 + i * 0.1;
      shimmer.frequency.setValueAtTime(2500 + i * 200, startTime);
      shimmer.type = 'sine';
      
      shimmerGain.gain.setValueAtTime(0.1, startTime);
      shimmerGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.15);
      
      shimmer.start(startTime);
      shimmer.stop(startTime + 0.15);
    }
    
    setTimeout(() => audioContext.close(), 1000);
  } catch (error) {
    console.error('Error playing achievement sound:', error);
  }
};

/**
 * Play challenge complete sound
 */
export const playChallengeCompleteSound = (): void => {
  if (!gamificationSoundsEnabled) return;
  
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Victory fanfare - short and punchy
    const notes = [392.00, 523.25, 659.25]; // G4, C5, E5
    
    notes.forEach((freq, i) => {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      const startTime = audioContext.currentTime + i * 0.12;
      oscillator.frequency.setValueAtTime(freq, startTime);
      oscillator.type = 'square';
      
      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(0.15, startTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.25);
      
      oscillator.start(startTime);
      oscillator.stop(startTime + 0.25);
    });
    
    setTimeout(() => audioContext.close(), 800);
  } catch (error) {
    console.error('Error playing challenge complete sound:', error);
  }
};

/**
 * Play combo hit sound — pitch escalates with combo level.
 * Duolingo-style ascending tones.
 */
export const playComboSound = (multiplier: number): void => {
  if (!gamificationSoundsEnabled) return;
  
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const t = audioContext.currentTime;
    
    // Base frequency rises with combo level
    const baseFreq = 600 + (multiplier - 2) * 200; // 2x=600, 3x=800, 4x=1000, 5x=1200
    
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.connect(gain);
    gain.connect(audioContext.destination);
    
    osc.frequency.setValueAtTime(baseFreq, t);
    osc.frequency.linearRampToValueAtTime(baseFreq * 1.5, t + 0.15);
    osc.type = 'sine';
    
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.25, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
    
    osc.start(t);
    osc.stop(t + 0.2);
    
    // Add power chord for high combos
    if (multiplier >= 4) {
      const osc2 = audioContext.createOscillator();
      const gain2 = audioContext.createGain();
      osc2.connect(gain2);
      gain2.connect(audioContext.destination);
      osc2.frequency.setValueAtTime(baseFreq * 1.5, t + 0.05);
      osc2.type = 'triangle';
      gain2.gain.setValueAtTime(0.12, t + 0.05);
      gain2.gain.exponentialRampToValueAtTime(0.01, t + 0.25);
      osc2.start(t + 0.05);
      osc2.stop(t + 0.25);
    }
    
    setTimeout(() => audioContext.close(), 500);
  } catch (error) {
    console.error('Error playing combo sound:', error);
  }
};

/**
 * Play milestone celebration sound — triumphant fanfare.
 */
export const playMilestoneSound = (): void => {
  if (!gamificationSoundsEnabled) return;
  
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const t = audioContext.currentTime;
    
    // Triumphant ascending fanfare
    const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51]; // C5→E6
    
    notes.forEach((freq, i) => {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.connect(gain);
      gain.connect(audioContext.destination);
      
      const start = t + i * 0.08;
      osc.frequency.setValueAtTime(freq, start);
      osc.type = i < 3 ? 'sine' : 'triangle';
      
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.2, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.01, start + 0.4);
      
      osc.start(start);
      osc.stop(start + 0.4);
    });
    
    setTimeout(() => audioContext.close(), 1000);
  } catch (error) {
    console.error('Error playing milestone sound:', error);
  }
};

/**
 * Play XP gain sound (subtle)
 */
export const playXpGainSound = (): void => {
  if (!gamificationSoundsEnabled) return;
  
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    // Quick ascending blip
    oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
    oscillator.frequency.linearRampToValueAtTime(1200, audioContext.currentTime + 0.1);
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.15);
    
    setTimeout(() => audioContext.close(), 300);
  } catch (error) {
    console.error('Error playing XP gain sound:', error);
  }
};

/**
 * Play streak milestone sound
 */
export const playStreakMilestoneSound = (): void => {
  if (!gamificationSoundsEnabled) return;
  
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Fire crackling effect with triumphant notes
    const notes = [440, 554.37, 659.25, 880]; // A4, C#5, E5, A5
    
    notes.forEach((freq, i) => {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      const startTime = audioContext.currentTime + i * 0.08;
      oscillator.frequency.setValueAtTime(freq, startTime);
      oscillator.type = 'sawtooth';
      
      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(0.12, startTime + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.3);
      
      oscillator.start(startTime);
      oscillator.stop(startTime + 0.3);
    });
    
    setTimeout(() => audioContext.close(), 800);
  } catch (error) {
    console.error('Error playing streak milestone sound:', error);
  }
};

/**
 * Enable or disable gamification sounds
 */
export const setGamificationSoundsEnabled = async (enabled: boolean): Promise<void> => {
  gamificationSoundsEnabled = enabled;
  await setSetting('gamificationSounds', enabled);
};

/**
 * Check if gamification sounds are enabled
 */
export const isGamificationSoundsEnabled = async (): Promise<boolean> => {
  gamificationSoundsEnabled = await getSetting<boolean>('gamificationSounds', true);
  return gamificationSoundsEnabled;
};
