import { getTranslation, type Locale } from "../i18n/index";
import { emailHeader, emailOrigin, hostedPaymentUrl, EmailError } from "./config";
import type { BookingMail, EmailType, RenderedEmail, TransactionalEmail } from "./types";

export const EMAIL_TYPES: EmailType[] = ["BOOKING_RECEIVED", "BOOKING_CONFIRMED", "ADMIN_BOOKING_CREATED", "ADMIN_ASSISTED_COPY", "DRIVER_CONFIRMED", "ADMIN_DRIVER_CONFIRMED", "PAYMENT_RECEIPT", "DISPATCH_PAYMENT_LINK", "PASSWORD_RESET", "ADMIN_NO_DRIVER"];
export function emailLocale(value?: string | null): Locale {
  const aliases: Record<string, Locale> = { en: "en", english: "en", sk: "sk", slovak: "sk", de: "de", german: "de", uk: "uk", ukrainian: "uk" };
  return aliases[String(value || "").toLowerCase()] || "sk";
}
export function escapeEmailHtml(value: unknown): string {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
export function localPickup(data: Pick<BookingMail, "pickupAt" | "marketTimezone">, locale: Locale): string {
  const instant = new Date(data.pickupAt);
  if (!Number.isFinite(instant.getTime())) throw new EmailError("EMAIL_PICKUP_INVALID");
  try { return new Intl.DateTimeFormat({ en: "en-GB", sk: "sk-SK", de: "de-DE", uk: "uk-UA" }[locale], { timeZone: data.marketTimezone || "Europe/Bratislava", dateStyle: "medium", timeStyle: "short" }).format(instant); }
  catch { throw new EmailError("EMAIL_TIMEZONE_INVALID"); }
}

export function renderTransactionalEmail(input: TransactionalEmail, env: Readonly<Record<string, string | undefined>> = process.env): RenderedEmail {
  const t = (key: string) => getTranslation(input.locale, "email." + key);
  const title = t(input.type + ".title");
  let intro = t(input.type + ".intro");
  const rows: [string, string][] = [];
  let action: { label: string; url: string } | undefined;
  const data = input.data;
  if ("bookingRef" in data) rows.push([t("reference"), data.bookingRef]);
  if (input.type === "ADMIN_NO_DRIVER") rows.push([getTranslation(input.locale, "dispatch.status"), "DISPATCH_EXHAUSTED"]);
  if ("pickupAt" in data) {
    rows.push([t("pickupTime"), localPickup(data, input.locale)], [t("pickup"), data.pickupAddress], [t("destination"), data.destination], [t("service"), getTranslation(input.locale, "service." + data.serviceType.toUpperCase(), data.serviceType)]);
    if (data.paymentMethod) rows.push([t("payment"), getTranslation(input.locale, "booking.payment" + ({ CASH: "Cash", CARD: "Card", INVOICE: "Invoice" }[data.paymentMethod] || ""), data.paymentMethod)]);
  }
  if ("driverName" in data) {
    intro = intro.replace("{driver}", () => data.driverName);
    rows.push([t("driver"), data.driverName]);
    if (data.vehicle) rows.push([t("vehicle"), data.vehicle]);
    if (data.registration) rows.push([t("registration"), data.registration]);
  }
  if ("amount" in data && data.amount != null) {
    const amount = typeof data.amount === "number" ? new Intl.NumberFormat(input.locale, { style: "currency", currency: "EUR" }).format(data.amount) : data.amount;
    rows.push([t("amount"), amount]);
  }
  if (input.type === "DISPATCH_PAYMENT_LINK") {
    if (!Number.isFinite(new Date(input.data.expiresAt).getTime())) throw new EmailError("EMAIL_EXPIRY_INVALID");
    action = { label: t("pay"), url: hostedPaymentUrl(input.data.url) };
  } else if (input.type === "PASSWORD_RESET") {
    const minutes = Math.max(0, Math.ceil((new Date(input.data.expiresAt).getTime() - Date.now()) / 60_000));
    if (!Number.isFinite(minutes) || minutes <= 0) throw new EmailError("EMAIL_RESET_EXPIRED");
    intro = intro.replace("{minutes}", String(minutes));
    const url = new URL("/passenger/reset", emailOrigin(env));
    url.searchParams.set("token", input.data.token); url.searchParams.set("attempt", input.data.attemptId);
    action = { label: t("reset"), url: url.href };
  } else if (input.type.startsWith("ADMIN_")) action = { label: t("operations"), url: emailOrigin(env) + "/admin/operations" };
  const subject = emailHeader("Drivo — " + title + ("bookingRef" in data ? " — " + data.bookingRef : ""));
  const text = [title, "", intro, "", ...rows.map(([k, v]) => k + ": " + v), "", action ? action.label + ": " + action.url : "", t("footer")].filter((line) => line !== "").join("\n");
  const e = escapeEmailHtml;
  const html = `<!doctype html><html lang="${input.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(title)}</title></head><body style="margin:0;background:#f3f4f6;font-family:Arial,sans-serif;color:#10202f"><table role="presentation" width="100%"><tr><td align="center" style="padding:20px 12px"><table role="presentation" width="100%" style="max-width:640px;background:white"><tr><td style="padding:24px;background:#113f36;color:white"><p>Drivo</p><h1 style="font-size:24px">${e(title)}</h1></td></tr><tr><td style="padding:24px;font-size:16px;line-height:1.6"><p>${e(intro)}</p><table width="100%">${rows.map(([k, v]) => `<tr><th scope="row" align="left" style="padding:8px 12px 8px 0;vertical-align:top">${e(k)}</th><td style="padding:8px 0;overflow-wrap:anywhere">${e(v)}</td></tr>`).join("")}</table>${action ? `<p><a href="${e(action.url)}" style="display:inline-block;padding:14px 20px;background:#087f73;color:white;text-decoration:underline">${e(action.label)}</a></p>` : ""}<p style="font-size:14px">${e(t("footer"))}</p></td></tr></table></td></tr></table></body></html>`;
  return { subject, html, text };
}
