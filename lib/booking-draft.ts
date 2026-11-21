import { isCustomerServiceEnabled } from "./feature-flags";

// This is presentation state only. It is never evidence of a booking, payment,
// authenticated identity, address verification, or booking ownership.
const DRAFT_KEY = "drivo_booking_draft_v1";
const LEGACY_DRAFT_KEY = "drivo_booking_draft";
const SUBMISSION_KEY = "drivo_booking_submission_uncertain_v1";
const OPERATION_KEY = "drivo_booking_operation_v1";
const GUEST_TRANSITION_KEY = "drivo_guest_draft_transition_v1";
const AUTH_HISTORY_KEY = "drivo_passenger_seen_in_tab_v1";
const MAX_AGE_MS = 2 * 60 * 60 * 1000;
const MAX_BYTES = 4096;

export type DraftScope = "guest" | `passenger:${string}`;
export type DraftService = "standard" | "accessible" | "children" | "airport";
export type DraftBookingLanguage = "sk" | "de" | "uk" | "en" | "cs";

export type BookingDraftFields = {
  step: 1;
  serviceType: DraftService;
  passengers: number;
  smallBags: number;
  largeBags: number;
  pickupAddress: string;
  dropoffAddress: string;
  rideMode: "now" | "schedule";
  scheduledDate: string;
  scheduledTime: string;
  airline: "" | "Ryanair" | "Wizz Air" | "Austrian" | "Other";
  waitAndGreet: boolean;
  bookingLanguage: DraftBookingLanguage | null;
};

export type BookingDraft = {
  version: 1;
  savedAt: number;
  scope: DraftScope;
  fields: BookingDraftFields;
};

export type DraftReadResult =
  | { status: "ready"; draft: BookingDraft; scheduleNeedsCorrection: boolean }
  | { status: "empty" | "expired" | "invalid" | "accountChanged" | "unavailable" };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function safeText(value: unknown): value is string {
  return typeof value === "string" && value.length <= 256 && !/[\u0000-\u001f\u007f]/.test(value);
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function marketWallNow(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Bratislava", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

function validScope(value: unknown): value is DraftScope {
  return value === "guest" || (typeof value === "string" && /^passenger:[a-f\d]{24}$/i.test(value));
}

export function scopeForPassenger(passenger: unknown): DraftScope | null {
  if (!record(passenger) || typeof passenger.id !== "string" || !/^[a-f\d]{24}$/i.test(passenger.id)) return null;
  return `passenger:${passenger.id.toLowerCase()}` as DraftScope;
}

function validFields(value: unknown): value is BookingDraftFields {
  if (!record(value) || !exactKeys(value, [
    "step", "serviceType", "passengers", "smallBags", "largeBags", "pickupAddress",
    "dropoffAddress", "rideMode", "scheduledDate", "scheduledTime", "airline", "waitAndGreet", "bookingLanguage",
  ])) return false;
  const service = value.serviceType;
  if (value.step !== 1 || typeof service !== "string" ||
      !["standard", "accessible", "children", "airport"].includes(service) ||
      !isCustomerServiceEnabled(service)) return false;
  if (typeof value.passengers !== "number" || !Number.isInteger(value.passengers) || value.passengers < 1 || value.passengers > 6) return false;
  if (typeof value.smallBags !== "number" || !Number.isInteger(value.smallBags) || value.smallBags < 0 || value.smallBags > 12) return false;
  if (typeof value.largeBags !== "number" || !Number.isInteger(value.largeBags) || value.largeBags < 0 || value.largeBags > 12) return false;
  if (service === "children" && (value.smallBags !== 0 || value.largeBags !== 0)) return false;
  if (!safeText(value.pickupAddress) || !safeText(value.dropoffAddress)) return false;
  if (value.rideMode !== "now" && value.rideMode !== "schedule") return false;
  if (service === "children" && value.rideMode !== "schedule") return false;
  if (typeof value.scheduledDate !== "string" || typeof value.scheduledTime !== "string") return false;
  if (value.rideMode === "schedule" && value.scheduledDate && !validDate(value.scheduledDate)) return false;
  if (value.rideMode === "schedule" && value.scheduledTime && !validTime(value.scheduledTime)) return false;
  if (value.rideMode === "now" && (value.scheduledDate || value.scheduledTime)) return false;
  if (typeof value.airline !== "string" || !["", "Ryanair", "Wizz Air", "Austrian", "Other"].includes(value.airline)) return false;
  if (service !== "airport" && value.airline) return false;
  if (typeof value.waitAndGreet !== "boolean") return false;
  if (service !== "airport" && value.waitAndGreet) return false;
  if (value.bookingLanguage !== null && (typeof value.bookingLanguage !== "string" ||
      !["sk", "de", "uk", "en", "cs"].includes(value.bookingLanguage))) return false;
  return true;
}

function session(): Storage | null {
  try { return typeof window === "undefined" ? null : window.sessionStorage; }
  catch { return null; }
}

export function removeLegacyBookingDraft(): void {
  // The old unversioned localStorage object was unvalidated and may contain
  // location information. Never migrate or display it.
  try { window.localStorage.removeItem(LEGACY_DRAFT_KEY); } catch {}
}

export function clearBookingDraft(): void {
  try { session()?.removeItem(DRAFT_KEY); } catch {}
}

export function readBookingDraft(scope: DraftScope, now = Date.now()): DraftReadResult {
  const storage = session();
  if (!storage) return { status: "unavailable" };
  let raw: string | null;
  try { raw = storage.getItem(DRAFT_KEY); } catch { return { status: "unavailable" }; }
  if (!raw) return { status: "empty" };
  if (raw.length > MAX_BYTES || new TextEncoder().encode(raw).length > MAX_BYTES) {
    clearBookingDraft(); return { status: "invalid" };
  }
  try {
    const value: unknown = JSON.parse(raw);
    if (!record(value) || !exactKeys(value, ["version", "savedAt", "scope", "fields"]) ||
        value.version !== 1 || typeof value.savedAt !== "number" || !Number.isSafeInteger(value.savedAt) ||
        !validScope(value.scope) || !validFields(value.fields) || value.savedAt > now + 60_000) {
      clearBookingDraft();
      return { status: "invalid" };
    }
    if (now - value.savedAt > MAX_AGE_MS) {
      clearBookingDraft();
      return { status: "expired" };
    }
    if (value.scope !== scope) {
      clearBookingDraft();
      return { status: "accountChanged" };
    }
    const draft: BookingDraft = {
      version: 1, savedAt: value.savedAt, scope: value.scope, fields: value.fields,
    };
    const fields = draft.fields;
    const scheduled = fields.rideMode === "schedule";
    const marketNow = marketWallNow(new Date(now));
    const scheduleNeedsCorrection = scheduled && Boolean(fields.scheduledDate && (
      fields.scheduledDate < marketNow.slice(0, 10) ||
      (fields.scheduledTime && `${fields.scheduledDate}T${fields.scheduledTime}` <= marketNow)
    ));
    return { status: "ready", draft, scheduleNeedsCorrection };
  } catch {
    clearBookingDraft();
    return { status: "invalid" };
  }
}

export function saveBookingDraft(scope: DraftScope, fields: BookingDraftFields): boolean {
  if (!validScope(scope) || !validFields(fields)) return false;
  const storage = session();
  if (!storage) return false;
  const raw = JSON.stringify({ version: 1, savedAt: Date.now(), scope, fields });
  if (new TextEncoder().encode(raw).length > MAX_BYTES) return false;
  try { storage.setItem(DRAFT_KEY, raw); return true; } catch { return false; }
}

type GuestDraftTransition =
  | { version: 1; startedAt: number; state: "awaitingAuth" }
  | { version: 1; startedAt: number; state: "authenticated"; passengerScope: `passenger:${string}`; via: "login" | "reset" };

export function hasPassengerHistoryInTab(): boolean {
  try { return session()?.getItem(AUTH_HISTORY_KEY) === "1"; } catch { return true; }
}

export function notePassengerHistoryInTab(): void {
  try { session()?.setItem(AUTH_HISTORY_KEY, "1"); } catch {}
}

export function clearGuestDraftTransition(): void {
  try { session()?.removeItem(GUEST_TRANSITION_KEY); } catch {}
}

export function readGuestDraftTransition(now = Date.now()): GuestDraftTransition | null {
  const storage = session();
  if (!storage) return null;
  try {
    const raw = storage.getItem(GUEST_TRANSITION_KEY);
    if (!raw) return null;
    if (raw.length > 256) throw new Error("Invalid transition size");
    const value: unknown = JSON.parse(raw);
    if (!record(value) || value.version !== 1 ||
        typeof value.startedAt !== "number" || !Number.isSafeInteger(value.startedAt) ||
        value.startedAt > now + 60_000 || now - value.startedAt > MAX_AGE_MS ||
        (value.state !== "awaitingAuth" && value.state !== "authenticated") ||
        (value.state === "awaitingAuth" && !exactKeys(value, ["version", "startedAt", "state"])) ||
        (value.state === "authenticated" && (!exactKeys(value, ["version", "startedAt", "state", "passengerScope", "via"]) ||
          !validScope(value.passengerScope) || value.passengerScope === "guest" ||
          (value.via !== "login" && value.via !== "reset")))) throw new Error("Invalid transition");
    return value as GuestDraftTransition;
  } catch { clearGuestDraftTransition(); return null; }
}

export function beginGuestDraftTransition(): boolean {
  const storage = session();
  if (!storage || hasPassengerHistoryInTab() || hasUncertainBookingSubmission() || readBookingOperationId()) return false;
  if (readBookingDraft("guest").status !== "ready") return false;
  try {
    storage.setItem(GUEST_TRANSITION_KEY, JSON.stringify({ version: 1, startedAt: Date.now(), state: "awaitingAuth" }));
    return true;
  } catch { return false; }
}

// This marks only a local presentation transition. It grants no booking access.
export function completeGuestDraftTransition(passenger: unknown, via: "login" | "reset"): boolean {
  const storage = session();
  const transition = readGuestDraftTransition();
  const scope = scopeForPassenger(passenger);
  const eligible = Boolean(storage && scope && transition?.state === "awaitingAuth" &&
    !hasPassengerHistoryInTab() && !hasUncertainBookingSubmission() && !readBookingOperationId() &&
    readBookingDraft("guest").status === "ready");
  notePassengerHistoryInTab();
  if (!eligible || !storage || !scope || !transition) {
    clearGuestDraftTransition();
    clearBookingDraft();
    return false;
  }
  try {
    storage.setItem(GUEST_TRANSITION_KEY, JSON.stringify({
      version: 1, startedAt: transition.startedAt, state: "authenticated", passengerScope: scope, via,
    }));
    return true;
  } catch {
    clearGuestDraftTransition();
    clearBookingDraft();
    return false;
  }
}

export function eligibleGuestDraftForPassenger(passenger: unknown): DraftReadResult | null {
  const transition = readGuestDraftTransition();
  const scope = scopeForPassenger(passenger);
  if (!scope || transition?.state !== "authenticated" || transition.passengerScope !== scope ||
      hasUncertainBookingSubmission() || readBookingOperationId()) return null;
  const result = readBookingDraft("guest");
  return result.status === "ready" ? result : null;
}

export function markBookingSubmissionUncertain(): void {
  try { session()?.setItem(SUBMISSION_KEY, String(Date.now())); } catch {}
}

// Only a public operation identifier is stored here. Its guest credential is
// HttpOnly and never copied into browser storage.
export function saveBookingOperationId(id: string): boolean {
  if (!/^[A-Za-z0-9_-]{43}$/.test(id)) return false;
  try { const storage = session(); if (!storage) return false; storage.setItem(OPERATION_KEY, id); return true; }
  catch { return false; }
}
export function readBookingOperationId(): string | null {
  try { const id = session()?.getItem(OPERATION_KEY); return id && /^[A-Za-z0-9_-]{43}$/.test(id) ? id : null; }
  catch { return null; }
}
export function clearBookingOperationId(): void {
  try { session()?.removeItem(OPERATION_KEY); } catch {}
}

export function clearBookingSubmissionUncertain(): void {
  try { session()?.removeItem(SUBMISSION_KEY); } catch {}
}

export function hasUncertainBookingSubmission(now = Date.now()): boolean {
  const storage = session();
  if (!storage) return false;
  try {
    const raw = storage.getItem(SUBMISSION_KEY);
    if (!raw) return false;
    const when = Number(raw);
    // Unlike a draft, an unknown server outcome must block another automatic
    // attempt for the entire tab session until a confirmed response clears it.
    if (!Number.isSafeInteger(when) || when > now + 60_000) {
      storage.removeItem(SUBMISSION_KEY);
      return false;
    }
    return true;
  } catch { return false; }
}
