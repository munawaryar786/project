"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import BrandLogo from "@/components/shared/BrandLogo";
import LanguageSwitcher from "@/components/shared/LanguageSwitcher";
import { WHATSAPP_URL } from "@/lib/constants";
import { useLanguage } from "@/lib/i18n/LanguageContext";

type IconProps = {
  className?: string;
};

function ChevronDownIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowRightIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M4.2 10H15.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M11.8 6L15.8 10L11.8 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ServiceIcon({ kind, className = "h-5 w-5" }: { kind: "taxi" | "airport" | "accessible" | "children"; className?: string }) {
  const common = { className, "aria-hidden": true };

  switch (kind) {
    case "taxi":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="none">
          <path d="M5 16L6.6 10.8C6.9 9.8 7.8 9 8.9 9H15.1C16.2 9 17.1 9.8 17.4 10.8L19 16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <rect x="4" y="12" width="16" height="6" rx="2.2" stroke="currentColor" strokeWidth="1.6" />
          <path d="M7 18V20M17 18V20M8 7.5L9 5.8C9.4 5.3 9.9 5 10.5 5H13.5C14.1 5 14.6 5.3 15 5.8L16 7.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case "airport":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="none">
          <path d="M3 13.3L21 8.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M10 11L13.7 5.2C14 4.7 14.7 4.6 15.2 4.9C15.6 5.1 15.8 5.6 15.7 6L14.6 10.1L19.4 11.4C20.1 11.6 20.4 12.4 20.1 13C19.9 13.5 19.4 13.8 18.9 13.8H14.1L12.7 18.1C12.5 18.7 11.8 19 11.2 18.7C10.7 18.5 10.5 17.9 10.6 17.4L11.2 13.8L7.8 14.8L6.2 17C5.8 17.5 5.1 17.6 4.6 17.2C4.2 16.8 4.1 16.2 4.5 15.7L5.7 13.8L3.9 13.9C3.4 13.9 3 13.6 3 13.3Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
      );
    case "accessible":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="none">
          <circle cx="12.2" cy="5.4" r="1.8" stroke="currentColor" strokeWidth="1.5" />
          <path d="M11 8.8L9.2 12.2H13L14.1 15.1C14.7 16.8 16.3 18 18.1 18H19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M10.8 10.1H15.6M10.5 15.7C9.6 16.7 8.3 17.3 6.8 17.3C4.1 17.3 2 15.2 2 12.5C2 9.8 4.1 7.7 6.8 7.7C7.5 7.7 8.2 7.8 8.8 8.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case "children":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="none">
          <circle cx="8" cy="6.2" r="2" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="15.7" cy="7.2" r="1.7" stroke="currentColor" strokeWidth="1.5" />
          <path d="M7.8 9.4L6.8 14.4L9.6 17.4L10.5 21M6.8 14.4L4.2 17.1M6.8 14.4L10.7 13.2L13.5 10.6M15.5 9.4L14.7 13L17 15.5L18 20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
  }
}

const SERVICES = [
  { href: "/taxi", kind: "taxi" as const, title: "header.services.standard", desc: "services.taxi.desc" },
  { href: "/airport", kind: "airport" as const, title: "header.services.airport", desc: "services.airport.desc" },
  { href: "/accessible-transport", kind: "accessible" as const, title: "header.services.assistedAccessible", desc: "services.accessible.desc" },
  { href: "/children", kind: "children" as const, title: "header.services.children", desc: "services.children.desc" },
];

const NAV_LINKS = [
  { href: "/about", key: "nav.about" },
  { href: "/faq", key: "nav.faq" },
  { href: "/contact", key: "nav.contact" },
];

export default function Header({ forceSolid = false }: { forceSolid?: boolean }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [servicesOpen, setServicesOpen] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 18);
    handler();
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const solidHeader = forceSolid || scrolled;
  const navTone = solidHeader ? "text-drivo-text" : "text-white";
  const shellTone = solidHeader
    ? "border-b border-drivo-border/80 bg-white/86 shadow-[0_12px_40px_rgba(4,26,43,0.08)] backdrop-blur-xl"
    : "bg-transparent";
  const logoVariant = solidHeader ? "dark" : "light";

  return (
    <header className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${shellTone}`}>
      <div className="container-main">
        <div className="flex h-[78px] items-center justify-between gap-2 xl:gap-3">
          <Link href="/" aria-label="Drivo home" className="flex shrink-0 items-center">
            <BrandLogo variant={logoVariant} className="h-12 w-36 lg:h-11 lg:w-28 xl:h-14 xl:w-40" />
          </Link>

          <nav className="hidden shrink-0 items-center gap-0 lg:flex xl:gap-1">
            <div className="relative" onMouseEnter={() => setServicesOpen(true)} onMouseLeave={() => setServicesOpen(false)}>
              <button
                type="button"
                className={`inline-flex min-h-[42px] items-center gap-1.5 rounded-full px-2 text-[13px] font-semibold transition xl:min-h-[46px] xl:gap-2 xl:px-4 xl:text-sm ${navTone} ${solidHeader ? "hover:bg-drivo-bg-soft" : "hover:bg-white/10"}`}
              >
                {t("nav.services")}
                <ChevronDownIcon className={`h-4 w-4 transition-transform ${servicesOpen ? "rotate-180" : ""}`} />
              </button>

              {servicesOpen && (
                <div className="absolute left-1/2 top-full w-[520px] -translate-x-1/2 pt-4">
                  <div className="grid grid-cols-2 gap-2 rounded-[28px] border border-drivo-border/70 bg-white p-3 shadow-[0_26px_70px_rgba(4,26,43,0.16)]">
                    {SERVICES.map((service) => (
                      <Link
                        key={service.href}
                        href={service.href}
                        className="group flex items-start gap-3 rounded-3xl border border-transparent px-4 py-3 transition hover:border-drivo-border hover:bg-drivo-bg-soft"
                      >
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,rgba(45,181,177,0.12),rgba(63,214,205,0.22))] text-drivo-teal">
                          <ServiceIcon kind={service.kind} className="h-5 w-5" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-drivo-text">{t(service.title)}</span>
                          <span className="mt-1 block text-xs leading-5 text-drivo-text-secondary">{t(service.desc)}</span>
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`inline-flex min-h-[42px] items-center rounded-full px-2 text-[13px] font-medium transition xl:min-h-[46px] xl:px-4 xl:text-sm ${navTone} ${solidHeader ? "hover:bg-drivo-bg-soft" : "hover:bg-white/10"}`}
              >
                {t(link.key)}
              </Link>
            ))}
          </nav>

          <div className="hidden shrink-0 items-center gap-1 lg:flex xl:gap-2">
            <LanguageSwitcher tone={solidHeader ? "dark" : "light"} />
            <Link
              href="/driver/login"
              className={`inline-flex min-h-[42px] items-center rounded-full px-2 text-[13px] font-semibold transition xl:min-h-[46px] xl:px-4 xl:text-sm ${
                solidHeader
                  ? "text-drivo-text-secondary hover:bg-drivo-bg-soft hover:text-drivo-text"
                  : "text-white hover:bg-white/10"
              }`}
            >
              {t("nav.driverPortal")}
            </Link>
            <Link
              href="/rental"
              className={`inline-flex min-h-[42px] items-center rounded-full px-2 text-[13px] font-semibold transition xl:min-h-[46px] xl:px-4 xl:text-sm ${
                solidHeader
                  ? "text-drivo-text-secondary hover:bg-drivo-bg-soft hover:text-drivo-text"
                  : "text-white hover:bg-white/10"
              }`}
            >
              {t("nav.rental", "Rental")}
            </Link>
            <Link href="/book" className="btn-primary min-h-[42px] rounded-full px-3 text-[13px] xl:min-h-[46px] xl:px-6 xl:text-sm">
              {t("cta.bookNow")}
              <ArrowRightIcon />
            </Link>
          </div>

          <div className="flex items-center gap-2 lg:hidden">
            <LanguageSwitcher tone={solidHeader ? "dark" : "light"} />
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              className={`inline-flex h-11 w-11 items-center justify-center rounded-full border transition ${
                solidHeader
                  ? "border-drivo-border bg-white text-drivo-text"
                  : "border-white/20 bg-white/10 text-white"
              }`}
              aria-label="Toggle menu"
              aria-expanded={open}
            >
              <span className="flex flex-col gap-1.5">
                <span className={`h-0.5 w-4 rounded-full bg-current transition ${open ? "translate-y-2 rotate-45" : ""}`} />
                <span className={`h-0.5 w-4 rounded-full bg-current transition ${open ? "opacity-0" : ""}`} />
                <span className={`h-0.5 w-4 rounded-full bg-current transition ${open ? "-translate-y-2 -rotate-45" : ""}`} />
              </span>
            </button>
          </div>
        </div>
      </div>

      {open && (
  <div className="fixed inset-0 z-[9999] bg-[linear-gradient(180deg,#051d31_0%,#08263b_100%)] lg:hidden">
    <div className="sticky top-0 z-[10000] border-b border-white/10 bg-[#051d31]/95 px-5 backdrop-blur-md">
      <div className="container-main flex h-[78px] items-center justify-between gap-3 px-0">
        <Link href="/" aria-label="Drivo home" onClick={() => setOpen(false)} className="flex shrink-0 items-center">
          <BrandLogo variant="light" className="h-12 w-36" />
        </Link>
        <div className="flex items-center gap-2">
          <LanguageSwitcher tone="light" />
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition hover:bg-white/15"
            aria-label="Close menu"
          >
            <span className="relative h-4 w-4">
              <span className="absolute left-0 top-1/2 h-0.5 w-4 -translate-y-1/2 rotate-45 rounded-full bg-current" />
              <span className="absolute left-0 top-1/2 h-0.5 w-4 -translate-y-1/2 -rotate-45 rounded-full bg-current" />
            </span>
          </button>
        </div>
      </div>
    </div>

    <div className="max-h-[calc(100vh-78px)] overflow-y-auto overscroll-contain px-5 pb-28 pt-5">
    <div className="container-main space-y-3 px-0">
      <div className="grid gap-2 rounded-[28px] border border-white/10 bg-white/6 p-3 backdrop-blur-sm">
        {SERVICES.map((service) => (
          <Link
            key={service.href}
            href={service.href}
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 rounded-2xl px-3 py-3 text-white transition hover:bg-white/8"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-drivo-aqua">
              <ServiceIcon kind={service.kind} className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-sm font-semibold">{t(service.title)}</span>
              <span className="block text-xs text-white/60">{t(service.desc)}</span>
            </span>
          </Link>
        ))}
      </div>

      <div className="grid gap-2 rounded-[28px] border border-white/10 bg-white/6 p-3 backdrop-blur-sm">
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            onClick={() => setOpen(false)}
            className="rounded-2xl px-3 py-3 text-sm font-medium text-white transition hover:bg-white/8"
          >
            {t(link.key)}
          </Link>
        ))}

        <Link
          href="/driver/login"
          onClick={() => setOpen(false)}
          className="rounded-2xl px-3 py-3 text-sm font-medium text-white transition hover:bg-white/8"
        >
          {t("nav.driverPortal")}
        </Link>
        <Link
          href="/rental"
          onClick={() => setOpen(false)}
          className="rounded-2xl px-3 py-3 text-sm font-medium text-white transition hover:bg-white/8"
        >
          {t("nav.rental", "Rental")}
        </Link>
      </div>

      <div className="mt-4 flex flex-col gap-3 rounded-[28px] border border-white/10 bg-[#061f33]/95 p-3 pb-6 backdrop-blur-md">
        <Link
          href="/driver/login"
          onClick={() => setOpen(false)}
          className="btn-outline w-full justify-center rounded-full border-white/15 bg-white/5 text-white hover:bg-white/10"
        >
          {t("nav.driverPortal")}
        </Link>

        <Link
          href="/rental"
          onClick={() => setOpen(false)}
          className="btn-outline w-full justify-center rounded-full border-white/15 bg-white/5 text-white hover:bg-white/10"
        >
          {t("nav.rental", "Rental")}
        </Link>

        <Link
          href="/book"
          onClick={() => setOpen(false)}
          className="btn-primary w-full justify-center rounded-full"
        >
          {t("cta.bookNow")}
        </Link>

        <a
          href={WHATSAPP_URL}
          onClick={() => setOpen(false)}
          className="btn-outline w-full justify-center rounded-full border-white/15 bg-white/5 text-white hover:bg-white/10"
        >
          {t("common.whatsapp")}
        </a>
      </div>
    </div>
    </div>
  </div>
)}
    </header>
  );
}
