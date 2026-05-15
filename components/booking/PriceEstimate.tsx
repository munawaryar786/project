"use client";
import { useState, useEffect } from 'react';

interface PriceEstimateProps {
  pickupAddress: string;
  dropoffAddress: string;
  serviceType: string;
  passengerCount: number;
  onPriceChange?: (price: number) => void;
}

interface PriceEstimate {
  distanceKm: number;
  durationMinutes: number;
  estimatedPrice: number;
  breakdown: string;
}

export default function PriceEstimate({
  pickupAddress,
  dropoffAddress,
  serviceType,
  passengerCount,
  onPriceChange,
}: PriceEstimateProps) {
  const [estimate, setEstimate] = useState<PriceEstimate | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pickupAddress || !dropoffAddress || pickupAddress.length < 5 || dropoffAddress.length < 5) {
      setEstimate(null);
      return;
    }

    const fetchEstimate = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/bookings/distance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pickupAddress,
            dropoffAddress,
            serviceType,
            passengerCount,
          }),
        });

        const data = await response.json();

        if (data.success) {
          setEstimate({
            distanceKm: data.distance.km,
            durationMinutes: data.distance.duration,
            estimatedPrice: data.pricing.estimatedPrice,
            breakdown: data.pricing.breakdown,
          });
          onPriceChange?.(data.pricing.estimatedPrice);
        } else {
          setError(data.error);
        }
      } catch (err) {
        console.error('Price estimate error:', err);
        setError('Failed to calculate price. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    const timer = setTimeout(fetchEstimate, 500); // Debounce
    return () => clearTimeout(timer);
  }, [pickupAddress, dropoffAddress, serviceType, passengerCount, onPriceChange]);

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
        <p className="text-[13px] text-orange-700">⚠️ {error}</p>
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
        €{estimate.estimatedPrice.toFixed(2)}
      </div>

      <div className="space-y-1.5 text-[12px] text-drivo-text-secondary">
        <div className="flex items-center gap-2">
          <span className="text-drivo-navy">📍</span>
          <span>Distance: {estimate.distanceKm} km</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-drivo-navy">⏱️</span>
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
