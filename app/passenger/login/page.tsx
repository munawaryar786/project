"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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

export default function PassengerLoginPage() {
  const { t, locale } = useLanguage();
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [recoveryWarning, setRecoveryWarning] = useState("");

  async function loginPassword(event: React.FormEvent) {
    event.preventDefault();
    setErrorCode(null);
    setLoading(true);
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
      const res = await csrfFetch("passenger", "/api/passenger/login/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier, password }) });
      const data = await res.json();
      if (!res.ok) { setErrorCode(res.status === 429 ? "RATE_LIMITED_GENERIC" : typeof data?.code === "string" ? data.code : res.status === 401 ? "AUTH_INVALID_CREDENTIALS" : "SERVICE_UNAVAILABLE"); return; }
      const hadUncertainOutcome = hasUncertainBookingSubmission() || Boolean(readBookingOperationId());
      clearBookingOperationId();
      const warning = res.headers.get("X-Drivo-Booking-Recovery");
      if (warning || hadUncertainOutcome) {
        notePassengerHistoryInTab(); clearGuestDraftTransition(); clearBookingDraft();
        markBookingSubmissionUncertain();
        setRecoveryWarning(warning === "BOOKING_CREATED" ? "phase42.transitionCreated" : "phase42.transitionReview");
        return;
      }
      clearBookingSubmissionUncertain();
      const continueBooking = sameTabGuestIntent && completeGuestDraftTransition(data?.passenger, "login");
      if (!continueBooking) {
        notePassengerHistoryInTab(); clearGuestDraftTransition();
        const scope = scopeForPassenger(data?.passenger);
        if (previousAccountInTab || !scope) clearBookingDraft(); else readBookingDraft(scope);
      }
      router.push(continueBooking ? "/book" : "/passenger/dashboard");
    } catch {
      setErrorCode("SERVICE_UNAVAILABLE");
    } finally {
      setLoading(false);
    }
  }

  return <>
    <Header forceSolid />
    <main className="min-h-screen bg-drivo-bg-soft px-4 pb-16 pt-32">
      <div className="mx-auto max-w-md rounded-[28px] border border-drivo-border-light bg-white p-6 shadow-soft">
        <h1 className="text-2xl font-black text-drivo-navy">{t("passenger.loginTitle")}</h1>
        <p className="mt-2 text-sm text-drivo-text-secondary">{t("passenger.phoneOrEmail", "Mobile or email")} + {t("passenger.password")}</p>
        {errorCode && <div id="passenger-login-error" role="alert" className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{presentMessage(errorCode, locale)}</div>}
        {recoveryWarning && <div role="alert" className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm"><p>{t(recoveryWarning)}</p><button type="button" className="mt-3 min-h-11 font-semibold text-drivo-green underline" onClick={() => router.push("/passenger/dashboard")}>{t("phase42.continueDashboard")}</button></div>}
        <form onSubmit={loginPassword} className="mt-6 space-y-4">
          <label htmlFor="passenger-login-identifier" className="block text-sm font-bold text-drivo-text">{t("passenger.phoneOrEmail", "Mobile or email")}
            <input id="passenger-login-identifier" className="input mt-2 w-full" type="text" autoComplete="username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required aria-describedby={errorCode ? "passenger-login-error" : undefined} />
          </label>
          <label htmlFor="passenger-login-password" className="block text-sm font-bold text-drivo-text">{t("passenger.password")}
            <input id="passenger-login-password" className="input mt-2 w-full" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          <button className="btn-primary w-full justify-center" disabled={loading}>{loading ? t("passenger.loading") : t("passenger.signIn")}</button>
          <a href="/passenger/reset" className="block text-center text-sm font-semibold text-drivo-green hover:underline">{t("passenger.forgotPassword", "Forgot password?")}</a>
          <p className="text-center text-xs text-drivo-text-secondary">{t("passenger.registrationPrompt", "First time? Verify your mobile during booking to create an account.")}</p>
        </form>
      </div>
    </main>
  </>;
}
