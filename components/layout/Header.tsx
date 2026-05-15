"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { NAV_LINKS, PHONE_RAW, WHATSAPP_URL } from "@/lib/constants";
import BrandLogo from "@/components/shared/BrandLogo";
import LanguageSwitcher from "@/components/shared/LanguageSwitcher";
import { useLanguage } from "@/lib/i18n/LanguageContext";

const HEADER_SERVICES = [
  {
    href: "/taxi",
    icon: "🚕",
    title: "header.services.standard",
    desc: "services.taxi.desc",
  },
  {
    href: "/airport",
    icon: "✈️",
    title: "header.services.airport",
    desc: "services.airport.desc",
  },
  {
    href: "/accessible-transport",
    icon: "♿",
    title: "header.services.specialized",
    desc: "services.accessible.desc",
  },
  {
    href: "/seniors",
    icon: "👴",
    title: "header.services.seniorAccessible",
    desc: "services.senior.desc",
  },
  {
    href: "/children",
    icon: "👧",
    title: "header.services.children",
    desc: "services.children.desc",
  },
  {
    href: "/car-rental",
    icon: "🔑",
    title: "header.services.rental",
    desc: "services.rental.desc",
  },
];

const NAV_KEYS: Record<string, string> = {
  "/about": "nav.about",
  "/faq": "nav.faq",
  "/contact": "nav.contact",
};

export default function Header() {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [servicesOpen, setServicesOpen] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
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

  const headerTone = scrolled ? "dark" : "light";

  return (
    <header
      className={`fixed left-0 right-0 top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "border-b border-drivo-border-light bg-white/90 shadow-soft backdrop-blur-xl"
          : "bg-transparent"
      }`}
    >
      <div className="container-main">
        <div className="flex h-[72px] items-center justify-between">
          <Link href="/" aria-label="Drivo home" className="flex items-center">
            <BrandLogo className="h-12 w-32 sm:w-36" />
          </Link>

          <nav className="hidden items-center gap-1 lg:flex">
            <div
              className="relative"
              onMouseEnter={() => setServicesOpen(true)}
              onMouseLeave={() => setServicesOpen(false)}
            >
              <button
                className={`btn-ghost ${
                  scrolled ? "text-drivo-text" : "text-white/90 hover:bg-white/10"
                }`}
              >
                {t("nav.services")}
                <svg
                  className={`h-4 w-4 transition-transform ${
                    servicesOpen ? "rotate-180" : ""
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              {servicesOpen && (
                <div className="absolute left-1/2 top-full w-[420px] -translate-x-1/2 pt-3 animate-scale-in">
                  <div className="rounded-3xl border border-drivo-border-light bg-white p-2 shadow-elevated">
                    {HEADER_SERVICES.map((service) => (
                      <Link
                        key={service.href}
                        href={service.href}
                        className="group flex items-center gap-3.5 rounded-2xl px-4 py-3 transition-colors hover:bg-drivo-bg-soft"
                      >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-drivo-bg-soft text-2xl transition-colors group-hover:bg-white">
                          <span className="text-[20px] leading-none">{service.icon}</span>
                        </span>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[14px] font-semibold text-drivo-text">
                              {t(service.title)}
                            </span>
                          </div>
                          <span className="text-[12px] text-drivo-text-muted">
                            {t(service.desc)}
                          </span>
                        </div>
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
                className={`btn-ghost ${
                  scrolled ? "" : "text-white/90 hover:bg-white/10"
                }`}
              >
                {t(NAV_KEYS[link.href], link.name)}
              </Link>
            ))}
          </nav>

          <div className="hidden items-center gap-3 lg:flex">
            <LanguageSwitcher tone={headerTone} />
            <Link
              href="/driver/login"
              className={`btn-ghost text-[13px] ${
                scrolled
                  ? "text-drivo-text-secondary"
                  : "text-white/70 hover:bg-white/10"
              }`}
            >
              {t("nav.driverPortal")}
            </Link>
            <Link href="/book" className="btn-primary px-6 py-3 text-[14px]">
              {t("nav.book")}
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M17 8l4 4m0 0l-4 4m4-4H3"
                />
              </svg>
            </Link>
          </div>

          <div className="flex items-center gap-2 lg:hidden">
            <LanguageSwitcher tone={headerTone} />
            <a
              href={`tel:+${PHONE_RAW}`}
              className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors ${
                scrolled
                  ? "bg-drivo-green-light text-drivo-green-dark"
                  : "bg-white/15 text-white"
              }`}
              aria-label="Call"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                />
              </svg>
            </a>
            <button
              onClick={() => setOpen((value) => !value)}
              className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors ${
                scrolled
                  ? "text-drivo-text hover:bg-drivo-bg-soft"
                  : "bg-white/15 text-white"
              }`}
              aria-label="Menu"
            >
              {open ? (
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              ) : (
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 top-[72px] z-40 overflow-y-auto bg-white animate-fade-in lg:hidden">
          <div className="container-main space-y-2 py-6">
            <p className="mb-2 px-4 text-[11px] font-bold uppercase tracking-widest text-drivo-text-muted">
              {t("nav.services")}
            </p>
            {HEADER_SERVICES.map((service) => (
              <Link
                key={service.href}
                href={service.href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3.5 rounded-2xl px-4 py-3.5 transition-colors hover:bg-drivo-bg-soft"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-drivo-bg-soft text-xl">
                  <span className="text-[20px] leading-none">{service.icon}</span>
                </span>
                <div>
                  <span className="block text-[15px] font-semibold text-drivo-text">
                    {t(service.title)}
                  </span>
                  <span className="text-[12px] text-drivo-text-muted">
                    {t(service.desc)}
                  </span>
                </div>
              </Link>
            ))}

            <div className="my-4 border-t border-drivo-border-light" />

            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="block rounded-2xl px-4 py-3.5 text-[15px] font-medium text-drivo-text hover:bg-drivo-bg-soft"
              >
                {t(NAV_KEYS[link.href], link.name)}
              </Link>
            ))}

            <Link
              href="/driver/login"
              onClick={() => setOpen(false)}
              className="block rounded-2xl px-4 py-3.5 text-[15px] font-medium text-drivo-text-secondary hover:bg-drivo-bg-soft"
            >
              🚗 {t("nav.driverPortal")}
            </Link>

            <div className="space-y-3 pt-4">
              <Link
                href="/book"
                onClick={() => setOpen(false)}
                className="btn-primary w-full"
              >
                {t("nav.book")} →
              </Link>
              <a
                href={WHATSAPP_URL}
                className="btn-outline w-full border-green-200 text-green-600 hover:bg-green-50"
              >
                💬 {t("common.whatsapp")}
              </a>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
