import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Only load English eagerly — all other languages load on demand
import en from './locales/en.json';

// Lazy locale loaders — only fetched when user switches language
const lazyLocales: Record<string, () => Promise<any>> = {
  es: () => import('./locales/es.json'),
  fr: () => import('./locales/fr.json'),
  de: () => import('./locales/de.json'),
  pt: () => import('./locales/pt.json'),
  ar: () => import('./locales/ar.json'),
  he: () => import('./locales/he.json'),
  ko: () => import('./locales/ko.json'),
  it: () => import('./locales/it.json'),
  zh: () => import('./locales/zh.json'),
  hi: () => import('./locales/hi.json'),
  ur: () => import('./locales/ur.json'),
  tr: () => import('./locales/tr.json'),
  ja: () => import('./locales/ja.json'),
  bn: () => import('./locales/bn.json'),
  ru: () => import('./locales/ru.json'),
  id: () => import('./locales/id.json'),
  mr: () => import('./locales/mr.json'),
  te: () => import('./locales/te.json'),
  ta: () => import('./locales/ta.json'),
};

// RTL languages
const rtlLanguages = ['ar', 'he', 'ur'];

const supportedLngs = ['en', 'es', 'fr', 'de', 'pt', 'ar', 'he', 'ko', 'it', 'zh', 'hi', 'ur', 'tr', 'ja', 'bn', 'ru', 'id', 'mr', 'te', 'ta'];

// Detect saved language before init so we can preload it
const savedLng = (() => {
  try { return localStorage.getItem('flowist_language') || 'en'; } catch { return 'en'; }
})();

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
    },
    fallbackLng: 'en',
    detection: {
      order: ['localStorage'],
      caches: ['localStorage'],
      lookupLocalStorage: 'flowist_language',
    },
    supportedLngs,
    interpolation: {
      escapeValue: false,
    },
  });

// Load the user's saved language if it's not English
async function loadLanguage(lng: string) {
  if (lng === 'en' || !lazyLocales[lng]) return;
  if (i18n.hasResourceBundle(lng, 'translation')) return;
  try {
    const mod = await lazyLocales[lng]();
    i18n.addResourceBundle(lng, 'translation', mod.default, true, true);
  } catch (e) {
    console.warn('Failed to load locale:', lng, e);
  }
}

// Preload saved language immediately (non-blocking)
if (savedLng !== 'en') {
  loadLanguage(savedLng).then(() => {
    i18n.changeLanguage(savedLng);
  });
}

// Auto-load language bundle when user switches
i18n.on('languageChanged', (lng) => {
  loadLanguage(lng);
  const isRtl = rtlLanguages.includes(lng);
  document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
  document.documentElement.lang = lng;
});

// Set initial direction
const isRtl = rtlLanguages.includes(i18n.language);
document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
document.documentElement.lang = i18n.language;

export default i18n;

export const languages = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', rtl: true },
  { code: 'he', name: 'Hebrew', nativeName: 'עברית', rtl: true },
  { code: 'ko', name: 'Korean', nativeName: '한국어' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano' },
  { code: 'zh', name: 'Chinese', nativeName: '中文' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
  { code: 'ur', name: 'Urdu', nativeName: 'اردو', rtl: true },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский' },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia' },
  { code: 'mr', name: 'Marathi', nativeName: 'मराठी' },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்' },
];

export const isRtlLanguage = (langCode: string) => rtlLanguages.includes(langCode);
