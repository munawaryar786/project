"use client";

import { useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { presentMessage } from "@/lib/i18n/message-catalog";
import { formatEuro, formatNumber } from "@/lib/i18n/format";

type FareBreakdown = {
  baseFare: number;
  distanceCharge: number;
  waitingCharge: number;
  bookingFee: number;
  optionalServiceCharges: Record<string, number>;
  nightServiceCharge: number;
  minimumFareAdjustment: number;
  totalFare: number;
  transparentPricingMessage: string;
  childTransport?: {
    returnIncluded: boolean;
    recurrence: string;
    estimatedServiceDays: number;
    returnLegs: number;
    pricingSource?: string;
  };
};

interface PriceEstimateProps {
  pickupAddress: string;
  dropoffAddress: string;
  serviceType: string;
  passengerCount: number;
  returnDate?: string;
  returnTime?: string;
  recurrenceType?: string;
  recurrenceCustom?: string;
  scheduledDate?: string;
  scheduledTime?: string;
  waitAndGreet?: boolean;
  waitingMinutes?: number;
  assistanceLevel?: string;
  onPriceChange?: (price: number) => void;
  onFareChange?: (price: number, breakdown: FareBreakdown) => void;
}

interface PriceEstimate {
  distanceKm: number;
  durationMinutes: number;
  estimatedPrice: number;
  breakdown: FareBreakdown;
}

const recurrenceKeys: Record<string, string> = {
  ONE_TIME: "booking.recurrenceOneTime", DAILY: "booking.recurrenceDaily",
  WEEKLY: "booking.recurrenceWeekly", MONTHLY: "booking.recurrenceMonthly",
  CUSTOM: "booking.recurrenceCustom",
};

export default function PriceEstimate({
  pickupAddress,
  dropoffAddress,
  serviceType,
  passengerCount,
  returnDate = "",
  returnTime = "",
  recurrenceType = "ONE_TIME",
  recurrenceCustom = "",
  scheduledDate = "",
  scheduledTime = "",
  waitAndGreet = false,
  waitingMinutes = 0,
  assistanceLevel = "",
  onPriceChange,
  onFareChange,
}: PriceEstimateProps) {
  const { t, locale } = useLanguage();
  const money = (value: number | undefined) => formatEuro(Number(value || 0), locale);
  const [estimate, setEstimate] = useState<PriceEstimate | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const optionalServices = useMemo(
    () => Object.entries(estimate?.breakdown.optionalServiceCharges || {}),
    [estimate]
  );

  useEffect(() => {
    if (!pickupAddress || !dropoffAddress || pickupAddress.length < 5 || dropoffAddress.length < 5) {
      setEstimate(null);
      setError(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const fetchEstimate = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/bookings/distance", {
          method: "POST",
          signal: controller.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pickupAddress,
            dropoffAddress,
            serviceType,
            passengerCount,
            returnDate,
            returnTime,
            recurrenceType,
            recurrenceCustom,
            scheduledDate,
            scheduledTime,
            waitAndGreet,
            waitingMinutes,
            // Empty string is not a valid value for DistanceSchema's enum.
            assistanceLevel: assistanceLevel || null,
          }),
        });

        const data = await response.json();

        if (controller.signal.aborted) return;
        if (response.ok && data.success && Number.isFinite(Number(data?.pricing?.estimatedPrice)) && data?.pricing?.breakdown) {
          const price = Number(data.pricing.estimatedPrice);
          const breakdown = data.pricing.breakdown as FareBreakdown;

          setEstimate({
            distanceKm: Number(data.distance.km),
            durationMinutes: Number(data.distance.duration),
            estimatedPrice: price,
            breakdown,
          });
          onPriceChange?.(price);
          onFareChange?.(price, breakdown);
        } else {
          setEstimate(null);
          setError(typeof data?.code === "string" ? data.code : "BOOKING_VALIDATION_FAILED");
        }
      } catch {
        if (!controller.signal.aborted) {
          setEstimate(null);
          setError("SERVICE_UNAVAILABLE");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    const timer = setTimeout(fetchEstimate, 500);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    pickupAddress,
    dropoffAddress,
    serviceType,
    passengerCount,
    returnDate,
    returnTime,
    recurrenceType,
    recurrenceCustom,
    scheduledDate,
    scheduledTime,
    waitAndGreet,
    waitingMinutes,
    assistanceLevel,
    onPriceChange,
    onFareChange,
  ]);

  if (loading) {
    return (
      <div className="bg-drivo-bg-soft rounded-2xl p-4 border border-drivo-border-light">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-drivo-green border-t-transparent rounded-full animate-spin" />
          <span className="text-[13px] text-drivo-text-secondary">{t('booking.estimateCalculating')}</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-orange-50 rounded-2xl p-4 border border-orange-200">
        <p className="text-[13px] text-orange-700">{t('common.warning')}: {presentMessage(error, locale)}</p>
      </div>
    );
  }

  if (!estimate) return null;

  const breakdown = estimate.breakdown;

  return (
    <div className="bg-drivo-green-light/30 rounded-2xl p-4 border border-drivo-green/20">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-[14px] font-bold text-drivo-text">{t('booking.fareBreakdown')}</h4>
        <span className="pill-green text-[11px]">{t('booking.live')}</span>
      </div>

      <div className="text-[28px] font-extrabold text-drivo-green mb-2">
        {money(estimate.estimatedPrice)}
      </div>

      <div className="mb-3 rounded-xl bg-white/70 p-3 text-[12px] font-semibold text-drivo-green">
        {t('booking.transparentPricing')}
      </div>

      <div className="space-y-1.5 text-[12px] text-drivo-text-secondary">
        <Row label={t('booking.baseFare')} value={money(breakdown.baseFare)} />
        <Row label={t('booking.distanceCharge')} value={money(breakdown.distanceCharge)} />
        <Row label={t('booking.waitingCharge')} value={money(breakdown.waitingCharge)} />
        <Row
          label={t('booking.additionalServices')}
          value={optionalServices.length ? money(optionalServices.reduce((sum, [, value]) => sum + value, 0)) : money(0)}
        />
        {optionalServices.map(([key, value]) => (
          <Row key={key} label={t(`booking.charge.${key}`)} value={money(value)} muted />
        ))}
        {breakdown.childTransport && (
          <>
            <Row label={t('booking.pricingSource')} value={t('booking.estimate')} muted />
            <Row label={t('booking.returnIncluded')} value={breakdown.childTransport.returnIncluded ? t('common.yes') : t('common.no')} muted />
            <Row label={t('booking.recurrence')} value={t(recurrenceKeys[breakdown.childTransport.recurrence] || 'common.unavailable')} muted />
            <Row label={t('booking.estimatedServiceDays')} value={formatNumber(breakdown.childTransport.estimatedServiceDays, locale)} muted />
          </>
        )}
        {breakdown.nightServiceCharge > 0 && (
          <Row label={t('booking.nightCharge')} value={money(breakdown.nightServiceCharge)} />
        )}
        {breakdown.minimumFareAdjustment > 0 && (
          <Row label={t('booking.minimumAdjustment')} value={money(breakdown.minimumFareAdjustment)} />
        )}
        <div className="my-2 border-t border-drivo-green/20" />
        <Row label={t('booking.totalFare')} value={money(breakdown.totalFare)} strong />
        <Row label={t('booking.distance')} value={`${formatNumber(estimate.distanceKm, locale)} km`} muted />
        <Row label={t('booking.duration')} value={`~${formatNumber(estimate.durationMinutes, locale)} ${t('common.minuteShort')}`} muted />
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  muted = false,
  strong = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={muted ? "text-drivo-text-muted" : "text-drivo-text-secondary"}>{label}</span>
      <span className={`${strong ? "text-[14px] font-black text-drivo-text" : "font-semibold text-drivo-text"}`}>
        {value}
      </span>
    </div>
  );
}
