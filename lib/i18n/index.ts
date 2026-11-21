import sk from "./translations/sk";
import de from "./translations/de";
import en from "./translations/en";
import uk from "./translations/uk";
import { m3, m3Validation } from "./translations/m3";
import { m4 } from "./translations/m4";
import { m5 } from "./translations/m5";
import { phase3 } from "./translations/phase3";
import { phase4 } from "./translations/phase4";
import { phase42 } from "./translations/phase42";
import { phase43 } from "./translations/phase43";
import { UI_LOCALES, type UiLocale } from "./locale-resolution";

export type Locale = UiLocale;

export const locales: Locale[] = [...UI_LOCALES];

export const localeNames: Record<Locale, string> = {
  sk: "Slovak",
  de: "German",
  uk: "Ukrainian",
  en: "English",
};

export const localeShort: Record<Locale, string> = {
  sk: "SK",
  de: "DE",
  uk: "UK",
  en: "EN",
};

export const localeFlags: Record<Locale, string> = {
  sk: "SK",
  de: "DE",
  uk: "UK",
  en: "EN",
};

const translations: Record<Locale, Record<string, string>> = {
  sk: { ...sk, ...m3.sk, ...m3Validation.sk, ...m4.sk, ...m5.sk, ...phase3.sk, ...phase4.sk, ...phase42.sk, ...phase43.sk },
  de: { ...de, ...m3.de, ...m3Validation.de, ...m4.de, ...m5.de, ...phase3.de, ...phase4.de, ...phase42.de, ...phase43.de },
  en: { ...en, ...m3.en, ...m3Validation.en, ...m4.en, ...m5.en, ...phase3.en, ...phase4.en, ...phase42.en, ...phase43.en },
  uk: { ...uk, ...m3.uk, ...m3Validation.uk, ...m4.uk, ...m5.uk, ...phase3.uk, ...phase4.uk, ...phase42.uk, ...phase43.uk },
};

export function getTranslation(
  locale: Locale,
  key: string,
  fallback?: string
): string {
  const translated = translations[locale]?.[key];
  if (translated) return translated;
  // An English caller fallback is safe only for the English interface. A missing
  // key in another locale must not silently turn the page into mixed-language UI.
  if (locale === "en" && fallback) return fallback;
  return translations[locale]?.["common.unavailable"] || translations.sk["common.unavailable"];
}

export default translations;
