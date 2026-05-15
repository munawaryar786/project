"use client";

import Link from "next/link";
import BrandLogo from "@/components/shared/BrandLogo";
import { PHONE_NUMBER, PHONE_RAW, WHATSAPP_URL } from "@/lib/constants";
import { useLanguage } from "@/lib/i18n/LanguageContext";

const services = [
  { icon: "🚕", nameKey: "services.taxi.title", href: "/taxi" },
  { icon: "✈️", nameKey: "services.airport.title", href: "/airport" },
  { icon: "♿", nameKey: "services.accessible.title", href: "/accessible-transport" },
  { icon: "👴", nameKey: "services.senior.title", href: "/seniors" },
  { icon: "👧", nameKey: "services.children.title", href: "/children" },
  { icon: "🔑", nameKey: "services.rental.title", href: "/car-rental" },
];

const company = [
  { icon: "ℹ️", nameKey: "nav.about", href: "/about" },
  { icon: "?", nameKey: "nav.faq", href: "/faq" },
  { icon: "📞", nameKey: "nav.contact", href: "/contact" },
  { icon: "🚗", nameKey: "nav.driverPortal", href: "/driver/login" },
  { icon: "🔒", nameKey: "footer.privacy", href: "/privacy" },
  { icon: "📄", nameKey: "footer.terms", href: "/terms" },
  { icon: "🛡️", nameKey: "footer.accessibility", href: "/gdpr" },
];

export default function Footer() {
  const { t } = useLanguage();

  return (
    <footer className="bg-drivo-navy border-t border-white/5">
      <div className="container-main py-16">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 md:grid-cols-4">
          <div className="sm:col-span-2 md:col-span-1">
            <div className="mb-5 flex items-center">
              <BrandLogo className="h-14 w-40" />
            </div>

            <p className="mb-6 text-[14px] leading-relaxed text-white/50">
              {t(
                "footer.brandText",
                "Bratislava's accessibility-first mobility platform. Dignified transport for everyone."
              )}
            </p>

            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[12px] text-white/50">
                🛡️ {t("hero.badge1")}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[12px] text-white/50">
                ♿ {t("hero.badge2")}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[12px] text-white/50">
                🔒 GDPR
              </span>
            </div>
          </div>

          <div>
            <h4 className="mb-5 text-[14px] font-bold uppercase tracking-wider text-white/85">
              {t("footer.services")}
            </h4>
            <ul className="space-y-3">
              {services.map((service) => (
                <li key={service.href}>
                  <Link
                    href={service.href}
                    className="flex items-center gap-2 text-[14px] text-white/55 transition-colors hover:text-white"
                  >
                    <span className="text-[16px] leading-none">{service.icon}</span>
                    <span className="font-medium">{t(service.nameKey)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="mb-5 text-[14px] font-bold uppercase tracking-wider text-white/85">
              {t("footer.legal")}
            </h4>
            <ul className="space-y-3">
              {company.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="flex items-center gap-2 text-[14px] text-white/55 transition-colors hover:text-white"
                  >
                    <span className="text-[16px] leading-none">{item.icon}</span>
                    <span className="font-medium">{t(item.nameKey)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="mb-5 text-[14px] font-bold uppercase tracking-wider text-white/85">
              {t("nav.contact")}
            </h4>

            <div className="space-y-3 text-[14px] text-white/55">
              <p className="flex items-center gap-2">
                <span className="text-[16px]">📍</span>
                Bratislava, Slovakia
              </p>

              <a
                href={`tel:+${PHONE_RAW}`}
                className="flex items-center gap-2 transition-colors hover:text-white"
              >
                <span className="text-[16px]">📞</span>
                {PHONE_NUMBER}
              </a>

              <a
                href="mailto:info@drivo.sk"
                className="flex items-center gap-2 transition-colors hover:text-white"
              >
                <span className="text-[16px]">📧</span>
                info@drivo.sk
              </a>

              <a
                href={WHATSAPP_URL}
                className="flex items-center gap-2 transition-colors hover:text-drivo-green"
              >
                <span className="text-[16px]">💬</span>
                {t("common.whatsapp")}
              </a>
            </div>

            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="mb-1 flex items-center gap-2">
                <span className="text-[18px]">🚐</span>
                <span className="text-[12px] font-bold tracking-wide text-drivo-amber">
                  {t("fleet.wavBadge")}
                </span>
              </div>
              <p className="text-[12px] text-white/40">{t("fleet.wavNote")}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-white/5">
        <div className="container-main flex flex-col items-center justify-between gap-3 py-6 sm:flex-row">
          <p className="text-[13px] text-white/35">
            © 2026 Drivo s.r.o. {t("footer.rights")}.
          </p>
          <p className="text-[13px] text-white/25">GDPR Compliant 🇪🇺</p>
        </div>
      </div>
    </footer>
  );
}
