import { cookies, headers } from "next/headers";
import { LOCALE_COOKIE_KEY, resolveServerLocale, type UiLocale } from "./locale-resolution";

/** Request-scoped presentation choice. Never use it for authentication. */
export async function requestLocale(): Promise<UiLocale> {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  return resolveServerLocale({
    cookie: cookieStore.get(LOCALE_COOKIE_KEY)?.value,
    acceptLanguage: headerStore.get("accept-language"),
  });
}
