"use client";

import { useState } from "react";
import Link from "next/link";
import type { PaymentMethod } from "@/types/booking";
import { EMAIL, PHONE_NUMBER, WHATSAPP_URL } from "@/lib/constants";
import { useLanguage } from "@/lib/i18n/LanguageContext";

interface Props {
  passengers: number;
  paymentMethod: PaymentMethod;
  bookingRef: string;
  bookingId: string;
  estimatedPrice?: number;
  passengerProfile?: Record<string, unknown> | null;
  bookingData: Record<string, unknown> | null;
}

export default function BookingConfirmation({
  passengers,
  paymentMethod,
  bookingRef,
  bookingId,
  estimatedPrice,
  passengerProfile,
  bookingData,
}: Props) {
  const { t } = useLanguage();
  const [paying, setPaying] = useState(false);
  const [profileHidden, setProfileHidden] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileDone, setProfileDone] = useState(Boolean(passengerProfile?.profileCompleted));
  const [profileForm, setProfileForm] = useState({
    fullName: String(passengerProfile?.fullName || bookingData?.customerName || ""),
    email: String(passengerProfile?.email || bookingData?.customerEmail || ""),
    password: "",
  });

  const handleStripePayment = async () => {
    setPaying(true);

    try {
      const res = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId,
          amount: estimatedPrice || 0,
          currency: "EUR",
        }),
      });

      const data = await res.json();

      if (data.success && data.sessionUrl) {
        window.location.href = data.sessionUrl;
        return;
      }

      alert(`${t("payment.failed", "Payment failed")}: ${data.error || "Unknown error"}`);
      setPaying(false);
    } catch {
      alert(t("payment.error", "Payment error. Please try again."));
      setPaying(false);
    }
  };

  const showProfilePrompt = Boolean(passengerProfile) && !profileDone && !profileHidden;

  const handleCompleteProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError("");
    setProfileLoading(true);

    try {
      const res = await fetch("/api/passenger/profile/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...profileForm, bookingId }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || t("passenger.profileCompleteError"));
      }

      setProfileDone(true);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : t("passenger.profileCompleteError"));
    } finally {
      setProfileLoading(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto px-4 py-8 md:py-16">
      <div className="card text-center">
        <div className="w-20 h-20 bg-drivo-green-light rounded-full flex items-center justify-center text-4xl mx-auto mb-6 animate-scale-in">
          ✅
        </div>
        <h2 className="text-[22px] font-bold text-drivo-text mb-2">
          {t("confirmation.title")}
        </h2>
        <p className="text-[14px] text-drivo-text-secondary mb-8">
          {t("confirmation.subtitle")}
        </p>

        <div className="printable-booking">
          <div className="print-header hidden print:block">
            <div className="print-logo">Drivo s.r.o.</div>
            <div className="print-subtitle">
              Bratislava, Slovakia | VAT: SK2122572452
            </div>
            <div className="print-subtitle">{EMAIL} | {PHONE_NUMBER}</div>
            <h1 className="print-title mt-4">{t("confirmation.title")}</h1>
          </div>

          <div className="bg-drivo-bg-soft rounded-2xl p-5 text-left mb-6 space-y-3 text-[14px]">
            <Detail label={t("confirmation.ref")} value={bookingRef} highlight />
            <Detail
              label={t("confirmation.service")}
              value={(bookingData?.serviceType as string) || "Standard"}
            />
            <Detail
              label={t("confirmation.date")}
              value={`${(bookingData?.scheduledDate as string) || ""} ${
                (bookingData?.scheduledTime as string) || ""
              }`}
            />
            <Detail
              label={t("confirmation.from")}
              value={(bookingData?.pickupAddress as string) || ""}
            />
            <Detail
              label={t("confirmation.to")}
              value={(bookingData?.dropoffAddress as string) || ""}
            />
            <Detail label={t("confirmation.passengers")} value={String(passengers)} />
            <Detail
              label={t("booking.luggage")}
              value={(bookingData?.luggageType as string) || t("booking.luggageNone")}
            />
            <Detail
              label={t("booking.wheelchair")}
              value={bookingData?.wheelchairNeeded ? t("common.yes") : t("common.no")}
            />

            {Boolean(bookingData?.flightNumber) && (
              <Detail
                label={t("booking.flightNumber")}
                value={String(bookingData?.flightNumber)}
              />
            )}

            {Boolean(bookingData?.waitAndGreet) && (
              <Detail
                label={t("booking.waitAndGreet")}
                value={t("common.yes")}
                highlight
              />
            )}

            {bookingData?.serviceType === "children" && (
              <>
                <Detail
                  label={t("booking.childFullName", "Child Full Name")}
                  value={String(bookingData?.childName || bookingData?.childFullName || "")}
                />
                <Detail
                  label={t("booking.childAge", "Child Age")}
                  value={String(bookingData?.childAge || "")}
                />
                <Detail
                  label={t("booking.parentFullName", "Parent/Guardian Full Name")}
                  value={String(bookingData?.guardianName || bookingData?.parentFullName || "")}
                />
                <Detail
                  label={t("booking.parentPrimaryPhone", "Primary Phone")}
                  value={String(bookingData?.guardianPhone || bookingData?.parentPrimaryPhone || "")}
                />
                <Detail
                  label={t("booking.parentEmergencyPhone", "Emergency Phone")}
                  value={String(bookingData?.guardianEmergencyPhone || bookingData?.parentEmergencyPhone || "")}
                />
                <Detail
                  label={t("booking.institutionName", "Institution name")}
                  value={String(bookingData?.institutionName || bookingData?.educationalInstitutionName || "")}
                />
                <Detail
                  label={t("booking.institutionAddress", "Full address")}
                  value={String(bookingData?.institutionAddress || bookingData?.dropoffAddress || "")}
                />
                <Detail
                  label={t("booking.recurrenceType", "Recurrence")}
                  value={String(bookingData?.recurrenceType || bookingData?.recurrence || "")}
                />
              </>
            )}

            <Detail
              label={t("booking.name")}
              value={(bookingData?.customerName as string) || ""}
            />
            <Detail
              label={t("booking.phone")}
              value={(bookingData?.customerPhone as string) || ""}
            />

            {Boolean(bookingData?.customerEmail) && (
              <Detail
                label={t("booking.email")}
                value={String(bookingData?.customerEmail)}
              />
            )}

            <Detail
              label={t("booking.language")}
              value={(bookingData?.languagePref as string) || "sk"}
            />
            <Detail
              label={t("confirmation.payment")}
              value={paymentMethod || "card"}
            />
            <Detail
              label={t("confirmation.status")}
              value={t("confirmation.verified")}
              highlight
            />

            {Boolean(bookingData?.specialNotes) && (
              <div className="pt-3 border-t border-drivo-border">
                <span className="text-drivo-text-secondary block mb-1">
                  {t("booking.notes")}:
                </span>
                <span className="font-semibold">
                  {String(bookingData?.specialNotes)}
                </span>
              </div>
            )}
          </div>

          <div className="hidden print:block print-footer">
            <p>{t("confirmation.title")}: {new Date().toLocaleDateString()}</p>
            <p>Drivo s.r.o.</p>
            <p>{EMAIL} | {PHONE_NUMBER}</p>
          </div>

          {paymentMethod === "cash" && (
            <div className="p-4 bg-drivo-amber-light rounded-2xl mb-6 text-left print:block">
              <p className="text-[13px] text-amber-700 font-semibold">
                💰 {t("cash.message")}
              </p>
            </div>
          )}
        </div>

        {showProfilePrompt && (
          <form
            onSubmit={handleCompleteProfile}
            className="mb-6 rounded-2xl border border-drivo-green/20 bg-drivo-green-light/40 p-4 text-left no-print"
          >
            <div className="mb-4">
              <h3 className="text-[16px] font-bold text-drivo-text">
                {t("passenger.completePromptTitle")}
              </h3>
              <p className="mt-1 text-[13px] text-drivo-text-secondary">
                {t("passenger.completePromptDesc")}
              </p>
              <p className="mt-2 text-[12px] font-semibold text-drivo-green">
                {t("passenger.phoneVerified")}: {String(passengerProfile?.phone || bookingData?.customerPhone || "")}
              </p>
            </div>

            <div className="space-y-3">
              <input
                className="input"
                value={profileForm.fullName}
                onChange={(e) => setProfileForm({ ...profileForm, fullName: e.target.value })}
                placeholder={t("passenger.fullName")}
                required
              />
              <input
                className="input"
                type="email"
                value={profileForm.email}
                onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                placeholder={t("passenger.email")}
                required
              />
              <input
                className="input"
                type="password"
                value={profileForm.password}
                onChange={(e) => setProfileForm({ ...profileForm, password: e.target.value })}
                placeholder={t("passenger.password")}
                minLength={8}
                required
              />
            </div>

            {profileError && (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-[13px] font-semibold text-red-700">
                {profileError}
              </div>
            )}

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button type="submit" disabled={profileLoading} className="btn-primary flex-1 justify-center">
                {profileLoading ? t("passenger.saving") : t("passenger.completeProfile")}
              </button>
              <button
                type="button"
                onClick={() => setProfileHidden(true)}
                className="btn-outline flex-1 justify-center"
              >
                {t("passenger.skipProfile")}
              </button>
            </div>
          </form>
        )}

        {profileDone && passengerProfile && (
          <div className="mb-6 rounded-2xl border border-green-200 bg-green-50 p-4 text-left text-[13px] font-semibold text-green-700 no-print">
            {t("passenger.profileCompleted")}
          </div>
        )}

        <div className="space-y-3 no-print">
          {paymentMethod === "card" && (
            <button
              onClick={handleStripePayment}
              disabled={paying}
              className="btn-primary w-full"
            >
              {paying
                ? t("payment.redirecting", "Redirecting to Stripe...")
                : t("payment.payStripe", "Pay with Stripe")}
            </button>
          )}
          <a href={WHATSAPP_URL} className="btn-outline w-full">
            {t("confirmation.whatsapp")}
          </a>
          <button onClick={() => window.print()} className="btn-outline w-full">
            {t("confirmation.print")}
          </button>
          <Link
            href="/"
            className="block text-[13px] text-drivo-green font-medium hover:underline mt-4"
          >
            {t("confirmation.backHome")}
          </Link>
        </div>
      </div>
    </div>
  );
}

function Detail({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-drivo-text-secondary">{label}</span>
      <span
        className={`font-semibold text-right max-w-[220px] break-words ${
          highlight ? "text-drivo-green" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}
