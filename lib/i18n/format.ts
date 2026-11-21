import { MARKET_TIME_ZONE, type UiLocale } from "./locale-resolution";

const intlLocale: Record<UiLocale, string> = {
  sk: "sk-SK", de: "de-DE", uk: "uk-UA", en: "en-GB",
};

function validDate(value: Date | string | number): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function formatMarketDate(value: Date | string | number, locale: UiLocale, timeZone = MARKET_TIME_ZONE): string {
  const date = validDate(value);
  return date ? new Intl.DateTimeFormat(intlLocale[locale], { dateStyle: "medium", timeZone }).format(date) : "";
}

export function formatMarketTime(value: Date | string | number, locale: UiLocale, timeZone = MARKET_TIME_ZONE): string {
  const date = validDate(value);
  return date ? new Intl.DateTimeFormat(intlLocale[locale], { timeStyle: "short", timeZone }).format(date) : "";
}

export function formatMarketDateTime(value: Date | string | number, locale: UiLocale, timeZone = MARKET_TIME_ZONE): string {
  const date = validDate(value);
  return date ? new Intl.DateTimeFormat(intlLocale[locale], { dateStyle: "medium", timeStyle: "short", timeZone }).format(date) : "";
}

// Legacy booking APIs expose a Bratislava wall date and time rather than an
// absolute pickup instant. Format those fields without interpreting them in
// the viewer's device time zone or changing the authoritative booking time.
export function formatMarketWallDateTime(dateValue: string, timeValue: string, locale: UiLocale): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue) || !/^\d{2}:\d{2}$/.test(timeValue)) return "";
  const wall = new Date(`${dateValue}T${timeValue}:00Z`);
  if (!Number.isFinite(wall.getTime()) || wall.toISOString().slice(0, 16) !== `${dateValue}T${timeValue}`) return "";
  return new Intl.DateTimeFormat(intlLocale[locale], { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(wall);
}

export function formatEuro(value: number, locale: UiLocale): string {
  return Number.isFinite(value)
    ? new Intl.NumberFormat(intlLocale[locale], { style: "currency", currency: "EUR" }).format(value)
    : "";
}

export function formatNumber(value: number, locale: UiLocale): string {
  return Number.isFinite(value) ? new Intl.NumberFormat(intlLocale[locale]).format(value) : "";
}

export function pluralCategory(value: number, locale: UiLocale): Intl.LDMLPluralRule {
  return new Intl.PluralRules(intlLocale[locale]).select(value);
}
