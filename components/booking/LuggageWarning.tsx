"use client";

import { useLanguage } from "@/lib/i18n/LanguageContext";

interface Props {
  passengers: number;
  luggage: string;
  onSwitchService: () => void;
}

export default function LuggageWarning({
  passengers,
  luggage,
  onSwitchService,
}: Props) {
  const { t } = useLanguage();

  if (passengers < 5 || luggage === "none") return null;

  return (
    <div className="p-5 bg-drivo-amber-light border-2 border-amber-300 rounded-2xl animate-fade-in">
      <div className="flex items-start gap-3">
        <span className="text-2xl shrink-0">⚠️</span>
        <div>
          <h4 className="font-bold text-amber-800 text-[14px] mb-1">
            {t("luggage.title", "Important luggage notice")}
          </h4>
          <p className="text-[13px] text-amber-700 mb-3">
            {t(
              "luggage.message",
              "Our 7-seater vehicles carry max 6 passengers with limited luggage."
            )}
          </p>
          <ul className="space-y-1 text-[13px] text-amber-700 mb-3">
            <li>✅ {t("fleet.sevenSeaterWarning")}</li>
            <li>✅ {t("luggage.tourism", "Or book a tourism transfer")}</li>
          </ul>
          <button
            type="button"
            onClick={onSwitchService}
            className="bg-amber-600 text-white text-[13px] font-semibold py-2 px-4 rounded-xl hover:bg-amber-700 transition-colors"
          >
            {t("luggage.switch", "Switch to tourism transfer")} →
          </button>
        </div>
      </div>
    </div>
  );
}
