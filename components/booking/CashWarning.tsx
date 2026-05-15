"use client";

import { useLanguage } from "@/lib/i18n/LanguageContext";

interface Props {
  agreed: boolean;
  onAgreeChange: (v: boolean) => void;
}

export default function CashWarning({ agreed, onAgreeChange }: Props) {
  const { t } = useLanguage();

  return (
    <div className="p-5 bg-drivo-red-light border-2 border-red-300 rounded-2xl animate-fade-in">
      <div className="flex items-start gap-3">
        <span className="text-3xl shrink-0">💰</span>
        <div className="flex-1">
          <h4 className="font-bold text-red-700 text-[15px] mb-2">
            {t("cash.title")}
          </h4>
          <div className="bg-red-100 rounded-xl p-3 mb-3">
            <p className="text-red-800 font-bold text-[14px] text-center">
              {t("cash.message")}
            </p>
          </div>
          <p className="text-[13px] text-red-600 mb-4">
            {t("cash.rule1")}. {t("cash.rule2")}.
          </p>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => onAgreeChange(e.target.checked)}
              className="mt-1 w-5 h-5 rounded border-red-300 text-red-600 focus:ring-red-500"
              required
            />
            <span className="text-[13px] text-red-700 font-medium">
              {t("cash.agree")}
            </span>
          </label>
        </div>
      </div>
    </div>
  );
}
