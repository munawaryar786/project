"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useState } from "react";
import Header from "@/components/layout/Header";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { csrfFetch } from "@/lib/client/csrf-fetch";
import { presentMessage } from "@/lib/i18n/message-catalog";
import {
  clearBookingDraft, clearBookingOperationId, clearBookingSubmissionUncertain,
  clearGuestDraftTransition, completeGuestDraftTransition,
  hasPassengerHistoryInTab, hasUncertainBookingSubmission,
  markBookingSubmissionUncertain, notePassengerHistoryInTab,
  readBookingDraft, readBookingOperationId, readGuestDraftTransition,
  scopeForPassenger,
} from "@/lib/booking-draft";

function PassengerResetContent() {
  const { t, locale } = useLanguage();
  const params = useSearchParams();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<{ key?: string; code?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const token = params.get("token") || "";
  const attempt = params.get("attempt") || "";

  async function requestReset(event: React.FormEvent) {
    event.preventDefault(); setLoading(true); setStatus(null);
    const email = new FormData(event.currentTarget as HTMLFormElement).get("email");
    try {
      await csrfFetch("passenger", "/api/passenger/password-reset/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, locale }) });
      setStatus({ key: "passenger.resetRequested" });
    } catch { setStatus({ key: "passenger.resetRequested" }); } finally { setLoading(false); }
  }

  async function completeReset(event: React.FormEvent) {
    event.preventDefault(); setLoading(true); setStatus(null);
    try {
      const previousAccountInTab = hasPassengerHistoryInTab();
      let sameTabGuestIntent = false;
      if (readGuestDraftTransition()?.state === "awaitingAuth") {
        try {
          const current = await csrfFetch("passenger", "/api/passenger/me", { cache: "no-store", credentials: "include" });
          sameTabGuestIntent = window.opener === null && current.status === 401;
        } catch { sameTabGuestIntent = false; }
        if (!sameTabGuestIntent) { clearGuestDraftTransition(); clearBookingDraft(); }
      }
      const res = await csrfFetch("passenger", "/api/passenger/password-reset/complete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ passwordResetProofToken: token, resetAttemptId: attempt, password, confirmPassword, rememberDevice: true }) });
      const data = await res.json();
      if (!res.ok) { setStatus({ code: res.status === 429 ? "RATE_LIMITED_GENERIC" : typeof data?.code === "string" ? data.code : "PASSWORD_RESET_VALIDATION_FAILED" }); return; }
      const hadUncertainOutcome = hasUncertainBookingSubmission() || Boolean(readBookingOperationId());
      clearBookingOperationId();
      const warning = res.headers.get("X-Drivo-Booking-Recovery");
      if (warning || hadUncertainOutcome) { notePassengerHistoryInTab(); clearGuestDraftTransition(); clearBookingDraft(); markBookingSubmissionUncertain(); setStatus({ key: warning === "BOOKING_CREATED" ? "phase42.transitionCreated" : "phase42.transitionReview" }); return; }
      clearBookingSubmissionUncertain();
      const continueBooking = sameTabGuestIntent && completeGuestDraftTransition(data?.passenger, "reset");
      if (!continueBooking) {
        notePassengerHistoryInTab(); clearGuestDraftTransition();
        const scope = scopeForPassenger(data?.passenger);
        if (previousAccountInTab || !scope) clearBookingDraft(); else readBookingDraft(scope);
      }
      router.push(continueBooking ? "/book" : "/passenger/dashboard");
    } catch { setStatus({ key: "passenger.resetFailed" }); } finally { setLoading(false); }
  }

  return <><Header forceSolid /><main className="min-h-screen bg-drivo-bg-soft px-4 pb-16 pt-32"><div className="mx-auto max-w-md rounded-[28px] border border-drivo-border-light bg-white p-6 shadow-soft"><h1 className="text-2xl font-black text-drivo-navy">{t("passenger.resetTitle", "Reset your password")}</h1><p className="mt-2 text-sm text-drivo-text-secondary">{t("passenger.resetDescription", "Use your registered email. The reset link expires and can be used once.")}</p>{status && <div role="status" aria-live="polite" className="mt-4 rounded-2xl border border-drivo-border-light bg-drivo-bg-soft p-3 text-sm font-semibold text-drivo-text-secondary">{status.code ? presentMessage(status.code, locale) : t(status.key || "passenger.resetFailed")}</div>}{token && attempt ? <form onSubmit={completeReset} className="mt-6 space-y-4"><label className="block text-sm font-bold text-drivo-text">{t("passenger.newPassword", "New password")}<input className="input mt-2" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={12} /></label><label className="block text-sm font-bold text-drivo-text">{t("passenger.confirmPassword", "Confirm password")}<input className="input mt-2" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={12} /></label><button className="btn-primary w-full justify-center" disabled={loading}>{loading ? t("passenger.loading", "Loading...") : t("passenger.resetContinue", "Reset Password & Continue")}</button></form> : <form onSubmit={requestReset} className="mt-6 space-y-4"><label className="block text-sm font-bold text-drivo-text">{t("passenger.email", "Email")}<input className="input mt-2" type="email" name="email" autoComplete="email" required /></label><button className="btn-primary w-full justify-center" disabled={loading}>{loading ? t("passenger.loading", "Loading...") : t("passenger.sendResetEmail", "Send reset email")}</button></form>}{status?.key?.startsWith("phase42.") && <button type="button" className="mt-4 min-h-11 font-semibold text-drivo-green underline" onClick={() => router.push("/passenger/dashboard")}>{t("phase42.continueDashboard")}</button>}</div></main></>;
}

export default function PassengerResetPage() {
  return <Suspense fallback={<main className="min-h-screen bg-drivo-bg-soft px-4 pb-16 pt-32" />}><PassengerResetContent /></Suspense>;
}
