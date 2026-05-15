"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { type Locale, getTranslation } from "./index";

interface LanguageContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, fallback?: string) => string;
}

const supportedLocales: Locale[] = ["sk", "de", "uk", "en"];

const LanguageContext = createContext<LanguageContextType>({
  locale: "sk",
  setLocale: () => {},
  t: (key) => key,
});

function isSupportedLocale(value: string | null): value is Locale {
  return supportedLocales.includes(value as Locale);
}

function getClientLocale(): Locale {
  if (typeof window === "undefined") return "sk";

  try {
    const saved = window.localStorage.getItem("drivo-language");
    if (isSupportedLocale(saved)) return saved;
  } catch {
    return "sk";
  }

  const browserLocales = window.navigator.languages?.length
    ? window.navigator.languages
    : [window.navigator.language];

  for (const browserLocale of browserLocales) {
    const language = browserLocale.toLowerCase().split("-")[0];
    if (language === "cs") return "sk";
    if (isSupportedLocale(language)) return language;
  }

  return "sk";
}

function subscribeToLocale(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("drivo-language-change", callback);

  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("drivo-language-change", callback);
  };
}

function getServerLocale(): Locale {
  return "sk";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(
    subscribeToLocale,
    getClientLocale,
    getServerLocale
  );

  // First visit follows supported browser language, then manual selection is saved.
  useEffect(() => {
    document.documentElement.lang = locale;
    try {
      localStorage.setItem("drivo-language", locale);
    } catch {}
  }, [locale]);

  const setLocale = useCallback((newLocale: Locale) => {
    try {
      localStorage.setItem("drivo-language", newLocale);
    } catch {}
    window.dispatchEvent(new Event("drivo-language-change"));
  }, []);

  const t = useCallback(
    (key: string, fallback?: string) => {
      return getTranslation(locale, key, fallback);
    },
    [locale]
  );

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }
  return context;
}

export { LanguageContext };
