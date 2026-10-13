"use client";

import { csrfFetch } from "@/lib/client/csrf-fetch";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { presentStatus } from "@/lib/i18n/status-catalog";
import LanguageSwitcher from "@/components/shared/LanguageSwitcher";

function PaymentSuccessContent() {
  const { t, locale } = useLanguage();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const [paymentStatus, setPaymentStatus] = useState("PROCESSING");
  const titleKey = paymentStatus === "PAID" ? "payment.status.paidTitle"
    : paymentStatus === "FAILED" ? "payment.status.failedTitle"
    : paymentStatus === "EXPIRED" ? "payment.status.expiredTitle"
    : paymentStatus === "RECONCILIATION_REQUIRED" ? "payment.status.reviewTitle"
    : "payment.status.pendingTitle";

  useEffect(() => {
    if (!sessionId) { setPaymentStatus("RECONCILIATION_REQUIRED"); return; }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    const verifyPayment = async () => {
      try {
        const res = await csrfFetch("passenger", "/api/payments/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });

        const data = await res.json();
        const next = res.ok && typeof data.paymentStatus === "string"
          ? data.paymentStatus : "RECONCILIATION_REQUIRED";
        if (!cancelled) setPaymentStatus(next);
        if (!cancelled && next === "PROCESSING" && ++attempts < 12) timer = setTimeout(verifyPayment, 5_000);
      } catch {
        if (!cancelled) setPaymentStatus("RECONCILIATION_REQUIRED");
      }
    };
    void verifyPayment();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [sessionId]);

  return (
    <div className="min-h-screen bg-drivo-bg-soft flex items-center justify-center p-4">
      <div className="absolute right-4 top-4">
        <LanguageSwitcher />
      </div>
      <div className="bg-white rounded-3xl shadow-elevated p-8 md:p-12 max-w-md w-full text-center">
        <div className="w-20 h-20 bg-drivo-bg-soft rounded-full flex items-center justify-center mx-auto mb-6" aria-hidden="true">
          <svg className="h-10 w-10 text-drivo-navy" viewBox="0 0 40 40" fill="none">
            <rect x="5" y="10" width="30" height="21" rx="4" stroke="currentColor" strokeWidth="2" />
            <path d="M5 17h30M11 25h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>

        <h1 className="text-[28px] font-extrabold text-drivo-navy mb-3">
          {t(titleKey)}
        </h1>

        <p className="text-[16px] text-drivo-text-secondary mb-8">
          <span role="status" aria-live="polite">{presentStatus('payment', paymentStatus, locale)}</span>
        </p>

        <div className="bg-drivo-bg-soft rounded-2xl p-4 mb-8">
          <p className="text-[14px] text-drivo-text-secondary">{t("payment.status.noDispatchBeforeVerification")}</p>
        </div>

        <div className="space-y-3">
          <Link href="/" className="btn-primary w-full inline-block">
            {t("common.backHome")}
          </Link>

          <Link href="/book" className="btn-outline w-full inline-block">
            {t("payment.bookAnother")}
          </Link>
        </div>

      </div>
    </div>
  );
}

export default function PaymentSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-drivo-bg-soft flex items-center justify-center">
          <div className="text-drivo-text-secondary" aria-hidden="true" />
        </div>
      }
    >
      <PaymentSuccessContent />
    </Suspense>
  );
}
