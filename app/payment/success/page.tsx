"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import LanguageSwitcher from "@/components/shared/LanguageSwitcher";

function PaymentSuccessContent() {
  const { t } = useLanguage();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const [verifying, setVerifying] = useState(true);
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      setVerifying(false);
      return;
    }

    const verifyPayment = async () => {
      try {
        const res = await fetch("/api/payments/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });

        const data = await res.json();
        if (data.success && data.paymentStatus === "paid") {
          setVerified(true);
        }
      } catch (error) {
        console.error("Payment verification error:", error);
      } finally {
        setVerifying(false);
      }
    };

    verifyPayment();
  }, [sessionId]);

  return (
    <div className="min-h-screen bg-drivo-bg-soft flex items-center justify-center p-4">
      <div className="absolute right-4 top-4">
        <LanguageSwitcher />
      </div>
      <div className="bg-white rounded-3xl shadow-elevated p-8 md:p-12 max-w-md w-full text-center">
        <div className="w-20 h-20 bg-drivo-green/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <span className="text-5xl">OK</span>
        </div>

        <h1 className="text-[28px] font-extrabold text-drivo-navy mb-3">
          {t("payment.successTitle")}
        </h1>

        <p className="text-[16px] text-drivo-text-secondary mb-8">
          {t("payment.successMessage")}
        </p>

        <div className="bg-drivo-bg-soft rounded-2xl p-4 mb-8">
          <p className="text-[14px] text-drivo-text-secondary">{t("payment.driverSoon")}</p>
        </div>

        <div className="space-y-3">
          <Link href="/" className="btn-primary w-full inline-block">
            {t("common.backHome")}
          </Link>

          <Link href="/book" className="btn-outline w-full inline-block">
            {t("payment.bookAnother")}
          </Link>
        </div>

        {sessionId && (
          <p className="text-[12px] text-drivo-text-muted mt-6">
            Session ID: {sessionId}
          </p>
        )}
        {!verifying && verified && (
          <p className="text-[12px] text-drivo-green mt-3">{t("confirmation.confirmed")}</p>
        )}
      </div>
    </div>
  );
}

export default function PaymentSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-drivo-bg-soft flex items-center justify-center">
          <div className="text-drivo-text-secondary">Loading...</div>
        </div>
      }
    >
      <PaymentSuccessContent />
    </Suspense>
  );
}
