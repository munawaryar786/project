"use client";

import { useEffect, useMemo, useState } from "react";

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
  onPriceChange?: (price: number) => void;
  onFareChange?: (price: number, breakdown: FareBreakdown) => void;
}

interface PriceEstimate {
  distanceKm: number;
  durationMinutes: number;
  estimatedPrice: number;
  breakdown: FareBreakdown;
}

const chargeLabels: Record<string, string> = {
  airportPickup: "Airport Pickup",
  airportMeetGreet: "Airport Meet & Greet",
  assistedTransport: "Senior & Accessible Transport",
  childTransport: "Child Transport",
  priorityBooking: "Priority Booking",
};

const recurrenceLabels: Record<string, string> = {
  ONE_TIME: "One Time",
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  CUSTOM: "Custom",
};

function money(value: number | undefined) {
  return `EUR ${Number(value || 0).toFixed(2)}`;
}

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
  onPriceChange,
  onFareChange,
}: PriceEstimateProps) {
  const [estimate, setEstimate] = useState<PriceEstimate | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const customQuoteService = ["accessible", "senior"].includes(serviceType.toLowerCase());

  const optionalServices = useMemo(
    () => Object.entries(estimate?.breakdown.optionalServiceCharges || {}),
    [estimate]
  );

  useEffect(() => {
    if (customQuoteService) {
      setEstimate(null);
      setError(null);
      setLoading(false);
      return;
    }

    if (!pickupAddress || !dropoffAddress || pickupAddress.length < 5 || dropoffAddress.length < 5) {
      setEstimate(null);
      return;
    }

    const fetchEstimate = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/bookings/distance", {
          method: "POST",
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
          }),
        });

        const data = await response.json();

        if (data.success) {
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
          setError(data.error);
        }
      } catch (err) {
        console.error("Price estimate error:", err);
        setError("Failed to calculate price. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    const timer = setTimeout(fetchEstimate, 500);
    return () => clearTimeout(timer);
  }, [
    customQuoteService,
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
    onPriceChange,
    onFareChange,
  ]);

  if (customQuoteService) {
    return (
      <div className="rounded-2xl border border-drivo-green/20 bg-drivo-green-light/30 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[18px] font-bold text-drivo-green-dark">
            i
          </div>
          <div>
            <h4 className="text-[14px] font-bold text-drivo-text">Custom quote</h4>
            <p className="mt-1 text-[13px] leading-relaxed text-drivo-text-secondary">
              Price will be confirmed by Drivo after reviewing your assistance requirements.
            </p>
          </div>
        </div>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="bg-drivo-bg-soft rounded-2xl p-4 border border-drivo-border-light">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-drivo-green border-t-transparent rounded-full animate-spin" />
          <span className="text-[13px] text-drivo-text-secondary">Calculating distance & price...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-orange-50 rounded-2xl p-4 border border-orange-200">
        <p className="text-[13px] text-orange-700">Warning: {error}</p>
      </div>
    );
  }

  if (!estimate) return null;

  const breakdown = estimate.breakdown;

  return (
    <div className="bg-drivo-green-light/30 rounded-2xl p-4 border border-drivo-green/20">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-[14px] font-bold text-drivo-text">Fare Breakdown</h4>
        <span className="pill-green text-[11px]">Live</span>
      </div>

      <div className="text-[28px] font-extrabold text-drivo-green mb-2">
        {money(estimate.estimatedPrice)}
      </div>

      <div className="mb-3 rounded-xl bg-white/70 p-3 text-[12px] font-semibold text-drivo-green">
        {breakdown.transparentPricingMessage}
      </div>

      <div className="space-y-1.5 text-[12px] text-drivo-text-secondary">
        <Row label="Base Fare" value={money(breakdown.baseFare)} />
        <Row label="Distance Charge" value={money(breakdown.distanceCharge)} />
        <Row label="Waiting Time Charge" value={money(breakdown.waitingCharge)} />
        <Row
          label="Additional Services"
          value={optionalServices.length ? money(optionalServices.reduce((sum, [, value]) => sum + value, 0)) : money(0)}
        />
        {optionalServices.map(([key, value]) => (
          <Row key={key} label={`- ${chargeLabels[key] || key}`} value={money(value)} muted />
        ))}
        {breakdown.childTransport && (
          <>
            <Row label="Pricing source" value={breakdown.childTransport.pricingSource || "Pricing Engine V1"} muted />
            <Row label="Return included" value={breakdown.childTransport.returnIncluded ? "Yes" : "No"} muted />
            <Row label="Recurrence" value={recurrenceLabels[breakdown.childTransport.recurrence] || breakdown.childTransport.recurrence} muted />
            <Row label="Estimated service days" value={String(breakdown.childTransport.estimatedServiceDays)} muted />
          </>
        )}
        {breakdown.nightServiceCharge > 0 && (
          <Row label="Night Service Charge" value={money(breakdown.nightServiceCharge)} />
        )}
        {breakdown.minimumFareAdjustment > 0 && (
          <Row label="Minimum Fare Adjustment" value={money(breakdown.minimumFareAdjustment)} />
        )}
        <div className="my-2 border-t border-drivo-green/20" />
        <Row label="Total Fare" value={money(breakdown.totalFare)} strong />
        <Row label="Distance" value={`${estimate.distanceKm} km`} muted />
        <Row label="Duration" value={`~${estimate.durationMinutes} min`} muted />
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
