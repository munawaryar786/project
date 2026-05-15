import sk from "./translations/sk";
import de from "./translations/de";
import en from "./translations/en";
import uk from "./translations/uk";

export type Locale = "sk" | "de" | "en" | "uk";

export const locales: Locale[] = ["sk", "de", "uk", "en"];

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
  sk,
  de,
  en,
  uk,
};

export function getTranslation(
  locale: Locale,
  key: string,
  fallback?: string
): string {
  return translations[locale]?.[key] || translations.sk?.[key] || fallback || key;
}

export default translations;
