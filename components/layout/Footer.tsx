"use client";

import Link from "next/link";
import BrandLogo from "@/components/shared/BrandLogo";
import { PHONE_NUMBER, PHONE_RAW, WHATSAPP_URL } from "@/lib/constants";
import { useLanguage } from "@/lib/i18n/LanguageContext";

function FooterIcon({ kind }: { kind: "taxi" | "airport" | "accessible" | "senior" | "children" | "rental" | "location" | "phone" | "mail" | "message" }) {
  const className = "h-4 w-4";

  switch (kind) {
    case "location":
      return (
        <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M10 17C12.8 13.7 14.2 11.2 14.2 9.2C14.2 6.9 12.3 5 10 5C7.7 5 5.8 6.9 5.8 9.2C5.8 11.2 7.2 13.7 10 17Z" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="10" cy="9.1" r="1.5" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
    case "phone":
      return (
        <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M5.7 3.9L7.8 3.3C8.3 3.1 8.7 3.3 9 3.7L10 5.7C10.2 6.2 10.1 6.7 9.7 7L8.5 8C9.4 9.9 10.9 11.4 12.8 12.3L13.8 11.1C14.1 10.7 14.6 10.6 15.1 10.8L17.1 11.8C17.5 12.1 17.7 12.5 17.5 13L16.9 15.1C16.7 15.7 16.2 16 15.6 16C9.2 16 4 10.8 4 4.4C4 3.8 4.3 3.3 4.9 3.1L5.7 3.9Z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "mail":
      return (
        <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <rect x="3" y="4.5" width="14" height="11" rx="2" stroke="currentColor" strokeWidth="1.4" />
          <path d="M4.5 6L10 10.2L15.5 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "message":
      return (
        <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M4 15.5L4.8 13.1C4.3 12.2 4 11.1 4 10C4 6.7 6.7 4 10 4C13.3 4 16 6.7 16 10C16 13.3 13.3 16 10 16C8.9 16 7.8 15.7 6.9 15.2L4 15.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      );
    case "taxi":
      return (
        <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M4.5 12.8L5.8 8.8A1.8 1.8 0 0 1 7.5 7.6h5a1.8 1.8 0 0 1 1.7 1.2l1.3 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <rect x="4" y="10.2" width="12" height="4.8" rx="1.7" stroke="currentColor" strokeWidth="1.4" />
          <path d="M6.4 15v1.7M13.6 15v1.7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      );
    case "airport":
      return (
        <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M2.8 10.9 17.2 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <path d="m8 9 3-4.7c.2-.4.8-.5 1.2-.2.3.2.4.5.3.9l-.9 3.1 3.8 1c.5.1.8.7.5 1.2a1 1 0 0 1-.8.4h-3.8l-1.1 3.4c-.2.5-.7.7-1.2.5-.4-.2-.6-.6-.5-1l.4-2.8-2.7.8-1.3 1.8c-.3.4-.8.5-1.2.2-.3-.3-.3-.8 0-1.1l1-1.5-1.4.1" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
        </svg>
      );
    case "accessible":
      return (
        <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <circle cx="10" cy="4.8" r="1.4" stroke="currentColor" strokeWidth="1.3" />
          <path d="M9 7.2 7.6 10h3l.8 2.3c.5 1.3 1.8 2.1 3.2 2.1h.7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M8.8 8.3h3.8M8.7 12.8A4 4 0 1 1 6 6.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      );
    case "senior":
      return (
        <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <circle cx="7" cy="5" r="1.7" stroke="currentColor" strokeWidth="1.3" />
          <path d="M6.4 7.4v4.2m0 0-1.8 5.1m1.8-5.1 3.2 2.9m0 0 1.5 2.2m-1.5-2.2 3.8-3.2M13.8 7v9.7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "children":
      return (
        <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <circle cx="6.8" cy="5.2" r="1.5" stroke="currentColor" strokeWidth="1.3" />
          <circle cx="13.4" cy="6" r="1.3" stroke="currentColor" strokeWidth="1.3" />
          <path d="m6.7 8-.8 4 2.3 2.4.7 2.8M5.9 12 3.8 14.2m2.1-2.2 3.3-1 2.3-2.1m1.7-.2-.6 2.9 1.9 2 .8 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "rental":
      return (
        <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <rect x="4.5" y="6" width="9.8" height="9.8" rx="1.7" stroke="currentColor" strokeWidth="1.3" />
          <path d="M7.8 6V5c0-.6.5-1.1 1.1-1.1h4c.4 0 .7.2.9.4l1.5 1.9m-8.7 4.1h4.1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      );
    default:
      return (
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-2xl bg-white/8 text-[11px] font-semibold uppercase tracking-[0.22em] text-drivo-aqua">
          {String(kind).slice(0, 1)}
        </span>
      );
  }
}

const services = [
  { nameKey: "services.taxi.title", href: "/taxi", code: "taxi" as const },
  { nameKey: "services.airport.title", href: "/airport", code: "airport" as const },
  { nameKey: "services.accessible.title", href: "/accessible-transport", code: "accessible" as const },
  { nameKey: "services.senior.title", href: "/seniors", code: "senior" as const },
  { nameKey: "services.children.title", href: "/children", code: "children" as const },
  { nameKey: "services.rental.title", href: "/car-rental", code: "rental" as const },
];

const company = [
  { nameKey: "nav.about", href: "/about" },
  { nameKey: "nav.faq", href: "/faq" },
  { nameKey: "nav.contact", href: "/contact" },
  { nameKey: "nav.driverPortal", href: "/driver/login" },
  { nameKey: "footer.privacy", href: "/privacy" },
  { nameKey: "footer.terms", href: "/terms" },
  { nameKey: "footer.accessibility", href: "/gdpr" },
];

export default function Footer() {
  const { t } = useLanguage();

  return (
    <footer className="relative overflow-hidden bg-[#041a2b] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(50,201,193,0.18),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(27,119,138,0.2),transparent_28%)]" />

      <div className="container-main relative py-16 md:py-20">
        <div className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr_0.85fr_1fr]">
          <div>
            <BrandLogo variant="light" className="h-16 w-44" />
            <p className="mt-6 max-w-sm text-sm leading-7 text-white/62">
              {t(
                "footer.brandText",
                "Bratislava's accessibility-first mobility platform. Dignified transport for everyone."
              )}
            </p>

            <div className="mt-6 flex flex-wrap gap-2">
              <span className="rounded-full border border-white/12 bg-white/6 px-4 py-2 text-xs font-medium text-white/90">
                {t("hero.badge1")}
              </span>
              <span className="rounded-full border border-drivo-aqua/30 bg-drivo-aqua/10 px-4 py-2 text-xs font-medium text-drivo-aqua">
                {t("hero.badge2")}
              </span>
              <Link href="/privacy" className="rounded-full border border-white/12 bg-white/6 px-4 py-2 text-xs font-medium text-white/90 transition hover:bg-white/10">
                GDPR
              </Link>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold uppercase tracking-[0.28em] text-white/45">
              {t("footer.services")}
            </h4>
            <ul className="mt-5 space-y-3">
              {services.map((service) => (
                <li key={service.href}>
                  <Link href={service.href} className="group flex items-center gap-3 text-sm text-white/66 transition hover:text-white">
                    <FooterIcon kind={service.code} />
                    <span className="font-medium">{t(service.nameKey)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold uppercase tracking-[0.28em] text-white/45">
              {t("footer.legal")}
            </h4>
            <ul className="mt-5 space-y-3">
              {company.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="text-sm font-medium text-white/66 transition hover:text-white">
                    {t(item.nameKey)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold uppercase tracking-[0.28em] text-white/45">
              {t("nav.contact")}
            </h4>

            <div className="mt-5 space-y-3 text-sm text-white/66">
              <p className="flex items-center gap-3">
                <FooterIcon kind="location" />
                Broskyňová ulica 2388/2C
Rovinka 900 41
              </p>

              <a href={`tel:+${PHONE_RAW}`} className="flex items-center gap-3 transition hover:text-white">
                <FooterIcon kind="phone" />
                {PHONE_NUMBER}
              </a>

              <a href="mailto:info.drivo.sk@gmail.com" className="flex items-center gap-3 transition hover:text-white">
                <FooterIcon kind="mail" />
                info.drivo.sk@gmail.com
              </a>

              <a href={WHATSAPP_URL} className="flex items-center gap-3 text-drivo-aqua transition hover:text-white">
                <FooterIcon kind="message" />
                {t("common.whatsapp")}
              </a>
            </div>

            <div className="mt-6 rounded-[28px] border border-white/10 bg-white/6 p-5 backdrop-blur-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-drivo-aqua">
                {t("fleet.wavBadge")}
              </p>
              <p className="mt-2 text-sm leading-6 text-white/60">{t("fleet.wavNote")}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="relative border-t border-white/8">
        <div className="container-main flex flex-col items-center justify-between gap-3 py-6 text-xs text-white/38 md:flex-row">
          <p>© 2026 Drivo s.r.o. {t("footer.rights")}.</p>
          <p>Drive. Connect. Move.</p>
        </div>
      </div>
    </footer>
  );
}
