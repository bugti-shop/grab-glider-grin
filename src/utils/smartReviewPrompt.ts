/**
 * Smart Review Prompt — triggers an in-app review request at peak happiness moments.
 * Tracks prompt history to avoid annoying users.
 */

import { getSetting, setSetting } from './settingsStorage';
import { Capacitor } from '@capacitor/core';

const STORAGE_KEY = 'flowist_review_prompt';

interface ReviewPromptData {
  lastPromptDate: string | null;   // ISO date
  totalPrompts: number;
  hasRated: boolean;                // user tapped "Rate Now"
  dismissCount: number;
  lastDismissDate: string | null;
}

const getDefault = (): ReviewPromptData => ({
  lastPromptDate: null,
  totalPrompts: 0,
  hasRated: false,
  dismissCount: 0,
  lastDismissDate: null,
});

export const loadReviewData = async (): Promise<ReviewPromptData> => {
  return getSetting<ReviewPromptData>(STORAGE_KEY, getDefault());
};

const saveReviewData = async (data: ReviewPromptData) => {
  await setSetting(STORAGE_KEY, data);
};

/**
 * Determine if we should show the review prompt.
 * Rules:
 * - Never if user already tapped "Rate Now"
 * - Max 3 total prompts ever
 * - At least 30 days between prompts
 * - At least 7 days after a dismiss
 * - Only on milestones >= 7 days (skip the 3-day one)
 */
export const shouldShowReviewPrompt = async (milestone: number): Promise<boolean> => {
  if (milestone < 7) return false;

  const data = await loadReviewData();

  if (data.hasRated) return false;
  if (data.totalPrompts >= 3) return false;

  const now = Date.now();

  if (data.lastPromptDate) {
    const daysSincePrompt = (now - new Date(data.lastPromptDate).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSincePrompt < 30) return false;
  }

  if (data.lastDismissDate) {
    const daysSinceDismiss = (now - new Date(data.lastDismissDate).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceDismiss < 7) return false;
  }

  return true;
};

/**
 * Record that we showed the prompt.
 */
export const recordPromptShown = async () => {
  const data = await loadReviewData();
  data.lastPromptDate = new Date().toISOString();
  data.totalPrompts += 1;
  await saveReviewData(data);
};

/**
 * Record the user tapped "Rate Now".
 */
export const recordRated = async () => {
  const data = await loadReviewData();
  data.hasRated = true;
  await saveReviewData(data);
};

/**
 * Record the user dismissed the prompt.
 */
export const recordDismissed = async () => {
  const data = await loadReviewData();
  data.dismissCount += 1;
  data.lastDismissDate = new Date().toISOString();
  await saveReviewData(data);
};

/**
 * Open the Play Store listing for the app.
 */
export const openPlayStoreReview = async () => {
  const appId = 'nota.npd.com';
  
  if (Capacitor.isNativePlatform()) {
    try {
      const { Browser } = await import('@capacitor/browser');
      await Browser.open({
        url: `https://play.google.com/store/apps/details?id=${appId}`,
      });
    } catch {
      window.open(`https://play.google.com/store/apps/details?id=${appId}`, '_blank');
    }
  } else {
    window.open(`https://play.google.com/store/apps/details?id=${appId}`, '_blank');
  }
};
