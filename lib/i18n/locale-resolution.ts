export const UI_LOCALES = ["sk", "de", "uk", "en"] as const;
export type UiLocale = (typeof UI_LOCALES)[number];

export const LOCALE_STORAGE_KEY = "drivo-language";
export const LOCALE_COOKIE_KEY = "drivo-language";
export const MARKET_TIME_ZONE = "Europe/Bratislava";

export function isUiLocale(value: unknown): value is UiLocale {
  return typeof value === "string" && UI_LOCALES.includes(value as UiLocale);
}

/** Historical booking preferences are read-only compatibility aliases, not UI options. */
export function normalizeStoredLocale(value: unknown): UiLocale | null {
  if (isUiLocale(value)) return value;
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "cs" || normalized === "slovak") return "sk";
  return isUiLocale(normalized) ? normalized : null;
}

export function browserLocale(languages: readonly string[] = []): UiLocale | null {
  for (const candidate of languages) {
    const language = candidate.toLowerCase().split("-")[0];
    const resolved = normalizeStoredLocale(language);
    if (resolved) return resolved;
  }
  return null;
}

/** Negotiate a public UI locale without trusting arbitrary request-header text. */
export function acceptLanguageLocale(header: string | null | undefined): UiLocale | null {
  if (!header) return null;
  const candidates = header.slice(0, 512).split(",").slice(0, 32).flatMap((entry, index) => {
    const [tag, ...parameters] = entry.trim().split(";").map((part) => part.trim());
    if (!/^[a-z]{2,8}(?:-[a-z0-9]{1,8})*$/i.test(tag)) return [];
    if (parameters.length > 1) return [];
    const quality = parameters.length
      ? /^q=(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/i.test(parameters[0])
        ? Number(parameters[0].slice(2))
        : 0
      : 1;
    if (quality <= 0) return [];
    const locale = normalizeStoredLocale(tag.split("-")[0]);
    return locale ? [{ locale, quality, index }] : [];
  });
  candidates.sort((a, b) => b.quality - a.quality || a.index - b.index);
  return candidates[0]?.locale ?? null;
}

export function resolveServerLocale(input: {
  cookie?: string | null;
  acceptLanguage?: string | null;
}): UiLocale {
  return normalizeStoredLocale(input.cookie)
    ?? acceptLanguageLocale(input.acceptLanguage)
    ?? "sk";
}

export function cookieLocale(cookieHeader: string | null | undefined): UiLocale | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== LOCALE_COOKIE_KEY) continue;
    try {
      return normalizeStoredLocale(decodeURIComponent(part.slice(separator + 1).trim()));
    } catch {
      return null;
    }
  }
  return null;
}

export function resolveClientLocale(input: {
  selected?: unknown;
  cookie?: string | null;
  browserLanguages?: readonly string[];
}): UiLocale {
  return cookieLocale(input.cookie)
    ?? normalizeStoredLocale(input.selected)
    ?? browserLocale(input.browserLanguages)
    ?? "sk";
}

export function localeCookieValue(locale: UiLocale, secure: boolean): string {
  return `${LOCALE_COOKIE_KEY}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax${secure ? "; Secure" : ""}`;
}
