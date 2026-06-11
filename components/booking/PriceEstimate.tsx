"use client";

import { useEffect, useMemo, useState } from "react";

interface PriceEstimateProps {
  pickupAddress: string;
  dropoffAddress: string;
  serviceType: string;
  passengerCount: number;
  returnDate?: string;
  returnTime?: string;
  recurrenceType?: string;
  recurrenceCustom?: string;
  onPriceChange?: (price: number) => void;
}

interface PriceEstimate {
  distanceKm: number;
  durationMinutes: number;
  oneWayPrice: number;
  estimatedPrice: number;
  breakdown: string;
}

const scheduleLabels: Record<string, string> = {
  ONE_TIME: "One Time",
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  CUSTOM: "Custom",
};

function parseCustomDays(value: string) {
  const match = value.match(/\d+/);
  if (!match) return null;
  const days = Number(match[0]);
  return Number.isFinite(days) && days > 0 ? days : null;
}

function estimateServiceDays(recurrenceType: string, recurrenceCustom: string) {
  const customDays = parseCustomDays(recurrenceCustom);

  if (recurrenceType === "WEEKLY") return customDays || 5;
  if (recurrenceType === "MONTHLY") return customDays || 20;
  if (recurrenceType === "DAILY") return customDays || 1;
  if (recurrenceType === "CUSTOM") return customDays || 1;
  return 1;
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
  onPriceChange,
}: PriceEstimateProps) {
  const [estimate, setEstimate] = useState<PriceEstimate | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isChildrenTransport = serviceType === "children";
  const returnIncluded = isChildrenTransport && Boolean(returnDate && returnTime);
  const serviceDays = useMemo(
    () => estimateServiceDays(recurrenceType, recurrenceCustom),
    [recurrenceType, recurrenceCustom]
  );
  const childMultiplier = isChildrenTransport
    ? serviceDays * (returnIncluded ? 2 : 1)
    : 1;

  useEffect(() => {
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
          }),
        });

        const data = await response.json();

        if (data.success) {
          const oneWayPrice = Number(data.pricing.estimatedPrice);
          const displayedPrice = Number((oneWayPrice * childMultiplier).toFixed(2));

          setEstimate({
            distanceKm: data.distance.km,
            durationMinutes: data.distance.duration,
            oneWayPrice,
            estimatedPrice: displayedPrice,
            breakdown: data.pricing.breakdown,
          });
          onPriceChange?.(displayedPrice);
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
    pickupAddress,
    dropoffAddress,
    serviceType,
    passengerCount,
    childMultiplier,
    onPriceChange,
  ]);

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

  if (!estimate) {
    return null;
  }

  return (
    <div className="bg-drivo-green-light/30 rounded-2xl p-4 border border-drivo-green/20">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-[14px] font-bold text-drivo-text">Price Estimate</h4>
        <span className="pill-green text-[11px]">Live</span>
      </div>

      <div className="text-[28px] font-extrabold text-drivo-green mb-2">
        EUR {estimate.estimatedPrice.toFixed(2)}
      </div>

      <div className="space-y-1.5 text-[12px] text-drivo-text-secondary">
        {isChildrenTransport && (
          <>
            <div className="flex items-center justify-between gap-3">
              <span>One-way trip price</span>
              <span className="font-semibold text-drivo-text">EUR {estimate.oneWayPrice.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Return trip included</span>
              <span className="font-semibold text-drivo-text">{returnIncluded ? "Yes" : "No"}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Schedule type</span>
              <span className="font-semibold text-drivo-text">{scheduleLabels[recurrenceType] || recurrenceType}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Estimated service days</span>
              <span className="font-semibold text-drivo-text">{serviceDays}</span>
            </div>
            <div className="rounded-xl bg-white/70 p-3 text-[11px] text-drivo-text-secondary">
              Total = one-way route price {returnIncluded ? "x 2 for return" : "x 1"} x {serviceDays} service day{serviceDays === 1 ? "" : "s"}.
            </div>
          </>
        )}

        <div className="flex items-center gap-2">
          <span className="text-drivo-navy">Route</span>
          <span>Distance: {estimate.distanceKm} km</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-drivo-navy">Time</span>
          <span>Duration: ~{estimate.durationMinutes} min</span>
        </div>
      </div>

      <details className="mt-3 pt-3 border-t border-drivo-green/20">
        <summary className="text-[11px] text-drivo-text-muted cursor-pointer hover:text-drivo-text-secondary">
          View price breakdown
        </summary>
        <p className="text-[11px] text-drivo-text-secondary mt-2 font-mono">
          {estimate.breakdown}
        </p>
      </details>
    </div>
  );
}
