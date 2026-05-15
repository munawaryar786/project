"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { WHATSAPP_URL } from "@/lib/constants";
import LanguageSwitcher from "@/components/shared/LanguageSwitcher";

function PaymentCancelContent() {
  const { t } = useLanguage();
  const searchParams = useSearchParams();
  const bookingId = searchParams.get("booking_id");

  return (
    <div className="min-h-screen bg-drivo-bg-soft flex items-center justify-center p-4">
      <div className="absolute right-4 top-4">
        <LanguageSwitcher />
      </div>
      <div className="bg-white rounded-3xl shadow-elevated p-8 md:p-12 max-w-md w-full text-center">
        <div className="w-20 h-20 bg-drivo-red/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <span className="text-5xl">!</span>
        </div>

        <h1 className="text-[28px] font-extrabold text-drivo-navy mb-3">
          {t("payment.cancelTitle")}
        </h1>

        <p className="text-[16px] text-drivo-text-secondary mb-8">
          {t("payment.cancelMessage")}
        </p>

        <div className="bg-drivo-bg-soft rounded-2xl p-4 mb-8">
          <p className="text-[14px] text-drivo-text-secondary">{t("payment.needHelp")}</p>
        </div>

        <div className="space-y-3">
          <Link
            href={bookingId ? `/book?booking_id=${bookingId}` : "/book"}
            className="btn-primary w-full inline-block"
          >
            {t("payment.retry")}
          </Link>

          <a href={WHATSAPP_URL} className="btn-outline w-full inline-block">
            {t("common.whatsapp")}
          </a>

          <Link
            href="/"
            className="text-drivo-green font-semibold text-[14px] hover:underline inline-block mt-2"
          >
            {t("common.backHome")}
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function PaymentCancelPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-drivo-bg-soft flex items-center justify-center">
          <div className="text-drivo-text-secondary">Loading...</div>
        </div>
      }
    >
      <PaymentCancelContent />
    </Suspense>
  );
}
