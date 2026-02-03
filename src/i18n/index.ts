import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en";
import zh from "./locales/zh";

const LANGUAGE_STORAGE_KEY = "codexmonitor.language";

const getStoredLanguage = (): string => {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored && (stored === "zh" || stored === "en")) {
      return stored;
    }
  } catch {
    // localStorage not available
  }
  return "zh"; // Default to Chinese
};

export const saveLanguage = (lang: string): void => {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  } catch {
    // localStorage not available
  }
};

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    zh: { translation: zh },
  },
  lng: getStoredLanguage(),
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
