"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { type Locale, getTranslation } from "./index";
import { isPublicMetadataRoute, openGraphLocales, publicMetadataCopy, rootMetadataCopy } from "./metadata";
import { FEATURE_FLAGS } from "../feature-flags";
import {
  isUiLocale,
  LOCALE_STORAGE_KEY,
  localeCookieValue,
  resolveClientLocale,
} from "./locale-resolution";

interface LanguageContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, fallback?: string) => string;
}

const LanguageContext = createContext<LanguageContextType>({
  locale: "sk",
  setLocale: () => {},
  t: (key) => key,
});

let selectedInThisTab: Locale | null = null;

function getClientLocale(): Locale {
  if (typeof window === "undefined") return "sk";
  if (selectedInThisTab) return selectedInThisTab;
  let saved: string | null = null;
  try {
    saved = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  } catch {}
  // The cookie wins because it is the server-visible presentation preference.
  // localStorage remains a fallback for browsers that predate the cookie.
  return resolveClientLocale({
    selected: saved,
    cookie: document.cookie,
    browserLanguages: window.navigator.languages?.length
      ? window.navigator.languages : [window.navigator.language],
  });
}

function subscribeToLocale(callback: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === LOCALE_STORAGE_KEY || event.key === null) {
      selectedInThisTab = null;
      callback();
    }
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener("drivo-language-change", callback);

  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("drivo-language-change", callback);
  };
}

export function LanguageProvider({ children, initialLocale }: { children: ReactNode; initialLocale: Locale }) {
  const pathname = usePathname();
  const locale = useSyncExternalStore(
    subscribeToLocale,
    getClientLocale,
    () => initialLocale
  );

  // Reconcile a legacy localStorage-only preference after hydration. Never
  // persist the server snapshot before the client has selected its winner.
  useEffect(() => {
    const preferred = getClientLocale();
    if (preferred !== locale) {
      selectedInThisTab = preferred;
      window.dispatchEvent(new Event("drivo-language-change"));
      return;
    }
    document.documentElement.lang = locale;
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {}
    try {
      document.cookie = localeCookieValue(locale, window.location.protocol === "https:");
    } catch {}
  }, [locale]);

  // Keep the current head in sync without remounting an in-progress booking.
  // Next may apply a prefetched metadata payload after this effect; repair that
  // stale locale too, without refreshing the route or changing form state.
  useEffect(() => {
    if (pathname === "/children" && !FEATURE_FLAGS.childrenTransport) return;
    const content = isPublicMetadataRoute(pathname)
      ? pathname === "/" ? rootMetadataCopy(locale, FEATURE_FLAGS.childrenTransport) : publicMetadataCopy(pathname, locale)
      : rootMetadataCopy(locale, FEATURE_FLAGS.childrenTransport);
    const title = pathname === "/" || !isPublicMetadataRoute(pathname)
      ? content.title : `${content.title} | Drivo Bratislava`;
    const update = () => {
      const setContent = (selector: string, value: string) => {
        const element = document.head.querySelector<HTMLMetaElement>(selector);
        if (element && element.content !== value) element.content = value;
      };
      if (document.title !== title) document.title = title;
      setContent('meta[name="description"]', content.description);
      setContent('meta[property="og:title"]', content.title);
      setContent('meta[property="og:description"]', content.description);
      setContent('meta[property="og:locale"]', openGraphLocales[locale]);
      setContent('meta[name="twitter:title"]', content.title);
      setContent('meta[name="twitter:description"]', content.description);
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.head, { childList: true, subtree: true, attributes: true, attributeFilter: ["content"] });
    return () => observer.disconnect();
  }, [locale, pathname]);

  const setLocale = useCallback((newLocale: Locale) => {
    if (!isUiLocale(newLocale)) return;
    selectedInThisTab = newLocale;
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, newLocale);
    } catch {}
    try {
      document.cookie = localeCookieValue(newLocale, window.location.protocol === "https:");
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
