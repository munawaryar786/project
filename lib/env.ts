const MIN_SECRET_LENGTH = 32;

export type ServerEnvironment = {
  databaseUrl: string;
  authSigningSecret: string;
  csrfHmacSecret: string;
  appOrigin: string;
};

let cachedEnvironment: ServerEnvironment | null = null;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required server environment variable: ${name}`);
  return value;
}

function validateSecret(name: string, value: string) {
  if (value.length < MIN_SECRET_LENGTH) {
    throw new Error(`${name} must contain at least ${MIN_SECRET_LENGTH} characters`);
  }
}

function parseOrigin(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("APP_ORIGIN must be a valid absolute URL origin");
  }
  if (url.origin !== value.replace(/\/$/, "") || url.username || url.password) {
    throw new Error("APP_ORIGIN must contain only scheme, host, and optional port");
  }
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error("APP_ORIGIN must use HTTPS in production");
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new Error("APP_ORIGIN must use HTTPS except on local development hosts");
  }
  return url.origin;
}

export function getServerEnvironment(): ServerEnvironment {
  if (cachedEnvironment) return cachedEnvironment;
  const production = process.env.NODE_ENV === "production";
  const authSigningSecret = production
    ? required("AUTH_SIGNING_SECRET")
    : process.env.AUTH_SIGNING_SECRET?.trim() || process.env.JWT_SECRET?.trim() || "";
  const csrfHmacSecret = production
    ? required("CSRF_HMAC_SECRET")
    : process.env.CSRF_HMAC_SECRET?.trim() || authSigningSecret;
  const appOrigin = production
    ? required("APP_ORIGIN")
    : process.env.APP_ORIGIN?.trim() || "http://localhost:3000";
  if (!authSigningSecret) throw new Error("Missing required server environment variable: AUTH_SIGNING_SECRET");
  if (!csrfHmacSecret) throw new Error("Missing required server environment variable: CSRF_HMAC_SECRET");
  validateSecret("AUTH_SIGNING_SECRET", authSigningSecret);
  validateSecret("CSRF_HMAC_SECRET", csrfHmacSecret);
  cachedEnvironment = {
    databaseUrl: required("DATABASE_URL"),
    authSigningSecret,
    csrfHmacSecret,
    appOrigin: parseOrigin(appOrigin),
  };
  return cachedEnvironment;
}

export function validateEnvironment() {
  const errors: string[] = [];
  try { getServerEnvironment(); }
  catch (error) { errors.push(error instanceof Error ? error.message : "Invalid server environment"); }
  return { valid: errors.length === 0, errors, warnings: [] as string[] };
}

export function getConfiguredOrigin() {
  return getServerEnvironment().appOrigin;
}

export function isAllowedOrigin(origin: string | null) {
  if (!origin) return false;
  if (origin === getConfiguredOrigin()) return true;
  if (process.env.NODE_ENV !== "production" && process.env.DRIVO_ALLOW_LOCALHOST_ORIGIN === "true") {
    try {
      const candidate = new URL(origin);
      return candidate.origin === origin && candidate.protocol === "http:" &&
        (candidate.hostname === "localhost" || candidate.hostname === "127.0.0.1");
    } catch { return false; }
  }
  return false;
}
