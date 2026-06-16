import { useState, useEffect, useCallback } from 'react';
import { getSetting, setSetting } from '@/utils/settingsStorage';

export interface UserProfile {
  name: string;
  avatarUrl: string;
  coverUrl: string;
}

const PROFILE_KEY = 'flowist_user_profile';

const DEFAULT_PROFILE: UserProfile = { name: '', avatarUrl: '', coverUrl: '' };

const sanitizeUserProfile = (value: unknown): UserProfile => {
  if (!value || typeof value !== 'object') {
    return DEFAULT_PROFILE;
  }

  const raw = value as Partial<UserProfile>;
  return {
    name: typeof raw.name === 'string' ? raw.name : '',
    avatarUrl: typeof raw.avatarUrl === 'string' ? raw.avatarUrl : '',
    coverUrl: typeof raw.coverUrl === 'string' ? raw.coverUrl : '',
  };
};

export const loadUserProfile = async (): Promise<UserProfile> => {
  const stored = await getSetting<UserProfile | null>(PROFILE_KEY, DEFAULT_PROFILE);
  return sanitizeUserProfile(stored);
};

export const saveUserProfile = async (profile: UserProfile): Promise<void> => {
  const sanitized = sanitizeUserProfile(profile);
  await setSetting(PROFILE_KEY, sanitized);
  window.dispatchEvent(new CustomEvent('userProfileUpdated', { detail: sanitized }));
};

export const useUserProfile = () => {
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadUserProfile()
      .then((p) => {
        setProfile(sanitizeUserProfile(p));
        setIsLoading(false);
      })
      .catch(() => {
        setProfile(DEFAULT_PROFILE);
        setIsLoading(false);
      });

    const handler = (e: CustomEvent<UserProfile>) => setProfile(sanitizeUserProfile(e.detail));
    window.addEventListener('userProfileUpdated', handler as EventListener);
    return () => window.removeEventListener('userProfileUpdated', handler as EventListener);
  }, []);

  const updateProfile = useCallback(async (updates: Partial<UserProfile>) => {
    const updated = sanitizeUserProfile({ ...profile, ...updates });
    setProfile(updated);
    await saveUserProfile(updated);
  }, [profile]);

  return { profile, isLoading, updateProfile };
};
