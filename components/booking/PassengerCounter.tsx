"use client";

import { MAX_PASSENGERS } from "@/lib/constants";
import { useLanguage } from "@/lib/i18n/LanguageContext";

type PassengerCounterProps = {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
};

export default function PassengerCounter({
  value,
  onChange,
  min = 1,
  max = MAX_PASSENGERS,
}: PassengerCounterProps) {
  const { t } = useLanguage();

  return (
    <div>
      <label className="text-[12px] font-semibold text-drivo-text-secondary mb-2 block">
        👥 {t("booking.passengers")}
      </label>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          className="w-11 h-11 rounded-xl bg-drivo-bg-soft text-drivo-text font-medium text-lg hover:bg-drivo-border transition-colors flex items-center justify-center"
          aria-label={t("booking.decreasePassengers", "Decrease passengers")}
        >
          −
        </button>

        <span className="text-[20px] font-bold text-drivo-text w-8 text-center">
          {value}
        </span>

        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          className="w-11 h-11 rounded-xl bg-drivo-bg-soft text-drivo-text font-medium text-lg hover:bg-drivo-border transition-colors flex items-center justify-center"
          aria-label={t("booking.increasePassengers", "Increase passengers")}
        >
          +
        </button>

        <span className="text-[12px] text-drivo-text-muted ml-auto">
          {t("booking.maxPassengers", "Max")} {max}
        </span>
      </div>
    </div>
  );
}
