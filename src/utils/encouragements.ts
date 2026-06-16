/**
 * Duolingo-style encouragement messages and milestone celebrations.
 * Fires custom events that the UI picks up to show animated overlays.
 */

const ENCOURAGEMENTS = [
  { min: 1, max: 1, messages: ['Nice! 👍', 'Good start! ✨', '+1 Done! ✅'] },
  { min: 2, max: 3, messages: ['Keep going! 🔥', 'On a roll! 💫', 'Great work! ⭐'] },
  { min: 4, max: 6, messages: ['Amazing! 🚀', 'Crushing it! 💪', 'Fantastic! 🌟'] },
  { min: 7, max: 9, messages: ['On fire! 🔥🔥', 'Unstoppable! ⚡', 'Incredible! 🏆'] },
  { min: 10, max: 99, messages: ['LEGENDARY! 👑', 'BEAST MODE! 🦁', 'ABSOLUTE UNIT! 💎'] },
];

const MILESTONE_MESSAGES: Record<number, { title: string; subtitle: string; icon: string }> = {
  5:  { title: 'High Five! ✋', subtitle: '5 tasks completed today!', icon: '🎯' },
  10: { title: 'Double Digits! 🔟', subtitle: '10 tasks done — incredible!', icon: '🌟' },
  15: { title: 'Task Machine! ⚙️', subtitle: '15 tasks — you\'re on fire!', icon: '🔥' },
  20: { title: 'LEGENDARY! 👑', subtitle: '20 tasks in one day — WOW!', icon: '💎' },
  25: { title: 'GODLIKE! 🏆', subtitle: '25 tasks — absolutely insane!', icon: '🦁' },
};

let dailyCount = 0;
let dailyDate = '';

const getTodayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

/**
 * Call on every task completion. Returns an encouragement message
 * and fires milestone events when applicable.
 */
export const getEncouragement = (): { message: string; isMilestone: boolean; milestone?: typeof MILESTONE_MESSAGES[5] } => {
  const today = getTodayStr();
  if (dailyDate !== today) {
    dailyDate = today;
    dailyCount = 0;
  }
  dailyCount++;

  // Check milestone
  const milestone = MILESTONE_MESSAGES[dailyCount];
  if (milestone) {
    window.dispatchEvent(new CustomEvent('taskMilestone', { detail: { count: dailyCount, ...milestone } }));
  }

  // Pick encouragement
  const tier = ENCOURAGEMENTS.find(t => dailyCount >= t.min && dailyCount <= t.max) 
    || ENCOURAGEMENTS[ENCOURAGEMENTS.length - 1];
  const message = tier.messages[Math.floor(Math.random() * tier.messages.length)];

  // Fire encouragement event
  window.dispatchEvent(new CustomEvent('taskEncouragement', { detail: { message, count: dailyCount } }));

  return { message, isMilestone: !!milestone, milestone };
};

/**
 * Reset daily count (e.g., when loading stored data).
 */
export const setDailyCompletionCount = (count: number) => {
  dailyDate = getTodayStr();
  dailyCount = count;
};
