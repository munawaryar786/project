export class EmailError extends Error {
  constructor(readonly code: string, readonly retryable = false) { super(code); }
}

export function emailAddress(value: string): string {
  if (/[\r\n]/.test(value)) throw new EmailError("EMAIL_INVALID_ADDRESS");
  const normalized = value.trim();
  if (normalized.length > 254 || !/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(normalized)) throw new EmailError("EMAIL_INVALID_ADDRESS");
  return normalized;
}

export function emailHeader(value: string): string {
  if (/[\r\n\x00]/.test(value) || value.length > 998) throw new EmailError("EMAIL_INVALID_HEADER");
  return value;
}

export function senderAddress(value: string): string {
  emailHeader(value);
  return emailAddress(value.match(/^[^<>]*<([^<>]+)>$/)?.[1] || value);
}

// Read configuration names only; never interpolate configuration into errors.
export function emailOrigin(env: Readonly<Record<string, string | undefined>> = process.env): string {
  const value = env.APP_ORIGIN || env.NEXT_PUBLIC_SITE_URL || env.PUBLIC_SITE_URL || env.APP_URL || env.NEXT_PUBLIC_BASE_URL;
  if (!value) throw new EmailError("EMAIL_ORIGIN_MISSING");
  try {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
      (url.protocol !== "https:" && !(env.NODE_ENV !== "production" && url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))) throw new Error();
    if (env.NODE_ENV === "production" && ["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error();
    return url.origin;
  } catch { throw new EmailError("EMAIL_ORIGIN_INVALID"); }
}

export function hostedPaymentUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.hostname !== "checkout.stripe.com") throw new Error();
    return url.href;
  } catch { throw new EmailError("EMAIL_PAYMENT_URL_INVALID"); }
}

export function providerFailure(error: unknown): EmailError {
  if (error instanceof EmailError) return error;
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (code.startsWith("CERT_") || ["UNABLE_TO_VERIFY_LEAF_SIGNATURE", "DEPTH_ZERO_SELF_SIGNED_CERT"].includes(code)) return new EmailError("EMAIL_TLS_INVALID");
  if (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name)) return new EmailError("EMAIL_PROVIDER_TIMEOUT", true);
  if (["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "EAI_AGAIN"].includes(code)) return new EmailError("EMAIL_CONNECTION_FAILED", true);
  return new EmailError("EMAIL_PROVIDER_FAILED", true);
}
