"use client";

import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import {
  type Locale,
  localeFlags,
  localeNames,
  localeShort,
  locales,
} from "@/lib/i18n";

type LanguageSwitcherProps = {
  tone?: "light" | "dark";
  className?: string;
};

export default function LanguageSwitcher({
  tone = "dark",
  className = "",
}: LanguageSwitcherProps) {
  const { locale, setLocale } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const triggerClass =
    tone === "light"
      ? "border-white/18 bg-white/12 text-white shadow-[0_10px_30px_rgba(4,26,43,0.18)] hover:bg-white/18"
      : "border-drivo-border-light bg-white text-drivo-text shadow-[0_10px_24px_rgba(4,26,43,0.08)] hover:bg-drivo-bg-soft";

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`h-11 rounded-xl border px-3 text-[13px] font-semibold transition-colors flex items-center gap-2 ${triggerClass}`}
        aria-label="Change language"
        aria-expanded={open}
      >
        <span className="text-base leading-none">{localeFlags[locale]}</span>
        <span>{localeShort[locale]}</span>
        <span className="text-[10px] opacity-60">▼</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 min-w-[190px] rounded-2xl border border-drivo-border-light bg-white py-2 shadow-elevated animate-scale-in">
          {locales.map((loc: Locale) => (
            <button
              key={loc}
              type="button"
              onClick={() => {
                setLocale(loc);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-[13px] transition-colors hover:bg-drivo-bg-soft ${
                locale === loc
                  ? "font-bold text-drivo-green-dark"
                  : "font-medium text-drivo-text"
              }`}
            >
              <span className="flex items-center gap-2">
                <span className="text-base">{localeFlags[loc]}</span>
                <span>{localeNames[loc]}</span>
              </span>
              {locale === loc && <span className="text-drivo-green">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
