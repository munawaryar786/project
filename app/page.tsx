"use client";

import Link from "next/link";
import Image from "next/image";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import WhatsAppFloat from "@/components/layout/WhatsAppFloat";
import CookieBanner from "@/components/layout/CookieBanner";
import { SERVICES, WHATSAPP_URL } from "@/lib/constants";
import { useLanguage } from "@/lib/i18n/LanguageContext";

const HOME_IMAGES = {
  taxi: "/drivo-taxi-service.jpeg",
  airport: "/drivo-airport-transfer.jpeg",
  airportTerminal: "/drivo-airport-van.jpeg",
  accessible: "/drivo-wav-wheelchair.jpeg",
  wavRamp: "/drivo-wav-ramp.jpeg",
  senior: "/drivo-senior-travel.jpeg",
  children: "/drivo-children-pickup.jpeg",
  rental: "https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?auto=format&fit=crop&w=900&q=70",
  chooseService: "https://images.unsplash.com/photo-1512428559087-560fa5ceab42?auto=format&fit=crop&w=700&q=70",
  enterDetails: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=700&q=70",
  whatsappConfirm: "https://images.unsplash.com/photo-1611746872915-64382b5c76da?auto=format&fit=crop&w=700&q=70",
  comfortableInterior: "/drivo-taxi-branded.jpeg",
  sevenSeater: "https://images.unsplash.com/photo-1750210506021-05f1f5bdad23?auto=format&fit=crop&w=900&q=70",
} as const;

function Hero() {
  const { t } = useLanguage();
  const stats = [
    ["2,400+", t("home.stats.riders")],
    ["50+", t("home.stats.drivers")],
    ["15+", t("home.stats.vehicles")],
    ["5", t("home.stats.services")],
  ] as const;

  return (
    <section className="relative isolate overflow-hidden bg-drivo-navy">
      <div className="absolute inset-0">
        <Image
          src={HOME_IMAGES.comfortableInterior}
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-[64%_center] opacity-80 md:object-[70%_center] lg:object-[76%_center]"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-drivo-navy via-drivo-navy/88 to-drivo-navy/42" />
        <div className="absolute inset-0 bg-gradient-to-b from-drivo-navy/30 via-drivo-navy/10 to-drivo-navy/70" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_24%,rgba(67,211,203,0.24),transparent_30%)]" />
      </div>

      <div className="relative container-main pt-24 pb-32 sm:pt-28 md:pt-32 lg:pt-36 lg:pb-24 xl:pt-40">
        <div className="grid items-start gap-7 md:gap-9 lg:grid-cols-[minmax(0,1.42fr)_minmax(320px,1fr)] lg:gap-10 xl:gap-14">
          <div className="min-w-0 animate-fade-up">
            <div className="pill mb-4 max-w-full flex-wrap border border-white/15 bg-white/10 text-[12px] leading-snug text-white/90 backdrop-blur-sm sm:mb-5 sm:text-[13px] lg:mb-6">
              <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-drivo-aqua" />
              {t("hero.badge2")}
            </div>

            <h1 className="mb-5 max-w-[780px] text-[clamp(2.375rem,10vw,2.75rem)] font-extrabold leading-[1.08] text-white [hyphens:auto] [overflow-wrap:break-word] [text-wrap:balance] md:text-[clamp(2.875rem,6vw,3.5rem)] md:leading-[1.07] lg:text-[clamp(3.625rem,5vw,4.375rem)] lg:leading-[1.04]">
              {t("hero.title")}
            </h1>

            <p className="mb-6 max-w-[680px] text-[17px] leading-[1.55] text-white/[0.82] [hyphens:auto] [overflow-wrap:break-word] sm:mb-7 md:text-[18px] md:leading-[1.6] lg:text-[19px]">
              {t("hero.subtitle")}
            </p>

            <div className="flex w-full flex-col sm:w-auto sm:flex-row">
              <Link href="/book" className="btn-primary min-h-[52px] w-full px-7 text-[16px] sm:w-auto">
                {t("hero.bookNow")}
              </Link>
            </div>
          </div>

          <div className="min-w-0 space-y-5 lg:justify-self-end lg:pt-2">
            <a
              href={WHATSAPP_URL}
              className="btn-outline min-h-[52px] w-full border-white/25 bg-white/[0.08] px-7 text-[16px] text-white backdrop-blur-sm hover:bg-white/[0.12] hover:text-white"
            >
              {t("hero.whatsapp")}
            </a>

            <div className="rounded-3xl border border-white/[0.12] bg-drivo-navy/[0.68] p-4 shadow-[0_20px_55px_rgba(0,0,0,0.24)] backdrop-blur-md sm:p-5">
              <div className="flex flex-col gap-4 min-[390px]:flex-row min-[390px]:items-center">
                <div className="flex shrink-0 -space-x-2 pr-1">
                  {[
                    "https://i.pravatar.cc/48?img=1",
                    "https://i.pravatar.cc/48?img=2",
                    "https://i.pravatar.cc/48?img=3",
                    "https://i.pravatar.cc/48?img=4",
                    "https://i.pravatar.cc/48?img=5",
                  ].map((src) => (
                    <Image
                      key={src}
                      src={src}
                      alt=""
                      width={40}
                      height={40}
                      className="h-9 w-9 rounded-full border-2 border-drivo-navy object-cover sm:h-10 sm:w-10"
                    />
                  ))}
                </div>

                <div className="min-w-0">
                  <div className="text-[15px] font-bold leading-snug text-white [hyphens:auto] [overflow-wrap:break-word] sm:text-[16px]">
                    2,400+ {t("home.stats.riders")}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-semibold uppercase tracking-[0.12em] text-drivo-aqua">
                    <span className="h-1.5 w-1.5 rounded-full bg-drivo-aqua" />
                    4.9 / 5
                  </div>
                  <div className="mt-1 text-[13px] leading-relaxed text-white/68 [hyphens:auto] [overflow-wrap:break-word] sm:text-[14px]">
                    {t("hero.reviewsLine")}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              {stats.map(([value, label]) => (
                <div
                  key={label}
                  className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.075] px-4 py-3.5 backdrop-blur-sm sm:px-5 sm:py-4"
                >
                  <div className="text-[24px] font-extrabold leading-none text-white sm:text-[28px]">
                    {value}
                  </div>
                  <div className="mt-2 text-[12px] font-semibold leading-snug text-white/66 [hyphens:auto] [overflow-wrap:break-word] sm:text-[13px]">
                    {label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ServicesSection() {
  const { t } = useLanguage();
  const services = [
    { ...SERVICES[0], nameKey: "services.taxi.title", descKey: "services.taxi.desc", img: HOME_IMAGES.taxi },
    { ...SERVICES[1], nameKey: "services.airport.title", descKey: "services.airport.desc", img: HOME_IMAGES.airport },
    { ...SERVICES[2], nameKey: "services.accessible.title", descKey: "services.accessible.desc", img: HOME_IMAGES.accessible },
    { ...SERVICES[3], nameKey: "services.children.title", descKey: "services.children.desc", img: HOME_IMAGES.children },
  ];

  return (
    <section className="section bg-white" id="services">
      <div className="container-main">
        <div className="text-center mb-14">
          <span className="pill-green mb-5 inline-flex">{t("nav.services")}</span>
          <h2 className="text-[32px] md:text-[40px] font-extrabold text-drivo-navy tracking-tight mb-4">{t("services.title")}</h2>
          <p className="text-[16px] text-drivo-text-secondary max-w-xl mx-auto">{t("services.subtitle")}</p>
        </div>
        <div className="mx-auto grid max-w-5xl sm:grid-cols-2 gap-6">
          {services.map((service) => (
            <Link key={service.href} href={service.href} className="group rounded-3xl overflow-hidden bg-white border border-drivo-border-light shadow-soft hover:shadow-card hover:-translate-y-1 transition-all duration-300">
              <div className="relative h-48 overflow-hidden">
                <Image src={service.img} alt={t(service.nameKey)} fill sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" className="object-cover group-hover:scale-105 transition-transform duration-500" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                <span className="absolute bottom-4 left-4 text-[22px] bg-white/20 backdrop-blur-sm w-12 h-12 rounded-2xl flex items-center justify-center text-white font-bold">{service.icon}</span>
              </div>
              <div className="p-5">
                <h3 className="text-[16px] font-bold text-drivo-text mb-1.5 group-hover:text-drivo-green transition-colors">{t(service.nameKey)}</h3>
                <p className="text-[13px] text-drivo-text-secondary mb-3">{t(service.descKey)}</p>
                <span className="text-[13px] font-semibold text-drivo-green">{t("common.learnMore")}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function WAVBanner() {
  const { t } = useLanguage();
  return (
    <section className="container-main -mt-8 relative z-10">
      <div className="bg-gradient-to-r from-drivo-navy to-drivo-navy-light rounded-3xl overflow-hidden shadow-glow-navy">
        <div className="grid items-center md:grid-cols-[1fr,240px]">
          <div className="p-8 md:p-10">
            <span className="pill-amber text-[11px] mb-4 inline-flex items-center gap-2">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-drivo-amber/20 text-[12px] text-drivo-amber">✓</span>
              {t("fleet.comingSoon")}
            </span>
            <h3 className="text-[22px] font-bold text-white mb-2">{t("fleet.wavTitle")}</h3>
            <p className="text-[14px] text-white/50 max-w-md mb-5">{t("fleet.wavDesc")}</p>
            <Link href="/accessible-transport" className="btn-primary bg-white text-drivo-navy hover:bg-gray-100 shadow-none">{t("common.learnMore")}</Link>
          </div>
          <div className="relative mx-6 mb-6 min-h-[150px] overflow-hidden rounded-2xl md:mx-0 md:mb-0 md:h-48 md:min-h-0 md:rounded-none">
            <Image
              src={HOME_IMAGES.wavRamp}
              alt={t("fleet.wavTitle")}
              fill
              sizes="(min-width: 768px) 240px, 100vw"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-drivo-navy/5" />
          </div>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const { t } = useLanguage();
  const steps = [
    ["01", t("how.step1.title"), t("how.step1.desc"), HOME_IMAGES.chooseService],
    ["02", t("how.step2.title"), t("how.step2.desc"), HOME_IMAGES.enterDetails],
    ["03", t("how.step3.title"), t("how.step3.desc"), HOME_IMAGES.whatsappConfirm],
  ] as const;

  return (
    <section className="section bg-drivo-bg-soft">
      <div className="container-main">
        <div className="text-center mb-14">
          <span className="pill-navy mb-5 inline-flex">{t("how.title")}</span>
          <h2 className="text-[32px] md:text-[40px] font-extrabold text-drivo-navy tracking-tight">{t("how.subtitle")}</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {steps.map(([number, title, desc, img]) => (
            <div key={number} className="card-elevated text-center group">
              <div className="relative mb-5 h-40 overflow-hidden rounded-2xl">
                <Image src={img} alt={title} fill sizes="(min-width: 768px) 33vw, 100vw" className="object-cover group-hover:scale-105 transition-transform duration-500" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/35 to-transparent" />
              </div>
              <span className="text-[11px] font-bold text-drivo-green tracking-widest uppercase">{number}</span>
              <h3 className="text-[17px] font-bold text-drivo-navy mt-2 mb-2">{title}</h3>
              <p className="text-[14px] text-drivo-text-secondary">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

type AccessibilityIconName =
  | "wheelchair"
  | "mobility"
  | "senior"
  | "children"
  | "dignity"
  | "pace"
  | "boarding"
  | "communication"
  | "driver"
  | "institution";

function AccessibilityIcon({ name, className = "h-4 w-4" }: { name: AccessibilityIconName; className?: string }) {
  const line = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (name) {
    case "wheelchair":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <circle cx="10" cy="17" r="4" {...line} />
          <path d="M9 5a1.8 1.8 0 1 0 0.1 0M10 8v5h5l3 4M13 13l1-4" {...line} />
        </svg>
      );
    case "mobility":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <path d="M4 12h13M13 8l4 4-4 4M5 17h5M5 7h5" {...line} />
        </svg>
      );
    case "senior":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <circle cx="10" cy="6" r="2.5" {...line} />
          <path d="M10 9v5l-3 4M10 14l4 3M16 11v8M16 19h3" {...line} />
        </svg>
      );
    case "children":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <circle cx="8" cy="8" r="2.5" {...line} />
          <circle cx="16" cy="8" r="2.5" {...line} />
          <path d="M4 18c.8-3 2.1-4.5 4-4.5S11.2 15 12 18M12 18c.8-3 2.1-4.5 4-4.5s3.2 1.5 4 4.5" {...line} />
        </svg>
      );
    case "dignity":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10Z" {...line} />
        </svg>
      );
    case "pace":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <circle cx="12" cy="12" r="8" {...line} />
          <path d="M12 8v5l3 2" {...line} />
        </svg>
      );
    case "boarding":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <path d="M4 17h5l6-6h5M5 13l4 4M14 11l2 6M8 8h4" {...line} />
        </svg>
      );
    case "communication":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <path d="M5 6h14v9H9l-4 3V6Z" {...line} />
          <path d="M8 10h8M8 13h5" {...line} />
        </svg>
      );
    case "driver":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <circle cx="12" cy="12" r="8" {...line} />
          <circle cx="12" cy="12" r="2" {...line} />
          <path d="M5 13h5M14 13h5M12 14v6" {...line} />
        </svg>
      );
    case "institution":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <path d="M4 20h16M6 20V9l6-4 6 4v11M9 20v-6h6v6M9 11h.01M12 11h.01M15 11h.01" {...line} />
        </svg>
      );
  }
}

function AccessibilitySection() {
  const { t } = useLanguage();
  const items: { label: string; icon: AccessibilityIconName }[] = [
    { label: t("home.accessible.doorToDoor", "Door-to-door assistance"), icon: "boarding" },
    { label: t("home.accessible.boarding", "Help boarding and exiting vehicles"), icon: "mobility" },
    { label: t("home.accessible.hospital", "Hospital and rehabilitation visits"), icon: "institution" },
    { label: t("home.accessible.companion", "Family companion option"), icon: "children" },
  ];
  const promises: { key: string; icon: AccessibilityIconName }[] = [
    { key: "home.trust.doorToDoor", icon: "boarding" },
    { key: "home.trust.companion", icon: "children" },
    { key: "home.trust.waiting", icon: "pace" },
    { key: "home.trust.trained", icon: "driver" },
    { key: "home.trust.hospitalRehab", icon: "institution" },
    { key: "home.trust.wav", icon: "wheelchair" },
  ];

  return (
    <section className="section bg-white">
      <div className="container-main">
        <div className="grid lg:grid-cols-2 gap-14 items-center">
          <div className="relative overflow-hidden rounded-[28px] p-1">
            <Image
              src={HOME_IMAGES.senior}
              alt=""
              fill
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="object-cover opacity-[0.08]"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-white via-white/95 to-white/80" />
            <div className="relative p-5 md:p-6">
            <span className="pill-purple mb-5 inline-flex">{t("services.accessible.title")}</span>
            <h2 className="text-[32px] md:text-[40px] font-extrabold text-drivo-navy tracking-tight leading-tight mb-5">{t("services.accessible.what")}</h2>
            <p className="text-[15px] text-drivo-text-secondary leading-relaxed mb-8 max-w-xl">{t("services.accessible.desc")}</p>

            <div className="grid sm:grid-cols-2 gap-3">
              {items.map((item) => (
                <div key={item.label} className="group flex min-h-16 items-center gap-3 rounded-2xl border border-drivo-border-light bg-drivo-bg-soft/70 px-4 py-3 transition-all hover:-translate-y-0.5 hover:bg-white hover:shadow-soft">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-drivo-green-light text-drivo-green shadow-sm ring-1 ring-drivo-green/10 group-hover:bg-drivo-green group-hover:text-white">
                    <AccessibilityIcon name={item.icon} className="h-4 w-4" />
                  </span>
                  <span className="text-[13px] font-semibold leading-snug text-drivo-text">{item.label}</span>
                </div>
              ))}
            </div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[28px] border border-drivo-border-light bg-gradient-to-br from-white to-drivo-purple-light/20 p-6 shadow-card md:p-8">
            <Image
              src={HOME_IMAGES.wavRamp}
              alt=""
              fill
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="object-cover opacity-[0.1]"
            />
            <div className="absolute inset-0 bg-gradient-to-br from-white/95 via-white/88 to-drivo-purple-light/75" />
            <div className="relative z-10">
            <div className="mb-6 flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-drivo-green-light text-drivo-green">
                <AccessibilityIcon name="dignity" className="h-5 w-5" />
              </span>
              <h3 className="text-[22px] font-extrabold text-drivo-navy">{t("home.promise.title")}</h3>
            </div>

            <div className="space-y-3">
              {promises.map((promise) => (
                <div key={promise.key} className="group flex items-center gap-4 rounded-2xl border border-transparent bg-white/75 p-3.5 transition-all hover:border-drivo-green/15 hover:bg-white hover:shadow-soft">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-drivo-green-light text-drivo-green transition-colors group-hover:bg-drivo-green group-hover:text-white">
                    <AccessibilityIcon name={promise.icon} className="h-4 w-4" />
                  </span>
                  <span className="text-[14px] font-semibold leading-snug text-drivo-text">{t(promise.key)}</span>
                </div>
              ))}
            </div>

            <Link href="/book?service=accessible" className="btn-dark mt-8 w-full">{t("booking.scheduleTransport", "Schedule Transport")}</Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Fleet() {
  const { t } = useLanguage();
  const vehicles = [
    [t("fleet.standard"), t("fleet.standardDesc"), HOME_IMAGES.comfortableInterior],
    [t("fleet.sevenSeater"), t("fleet.sevenSeaterWarning"), HOME_IMAGES.sevenSeater],
    [t("fleet.wavTitle"), t("fleet.wavDesc"), HOME_IMAGES.wavRamp],
  ] as const;

  return (
    <section className="section bg-drivo-bg-soft">
      <div className="container-main">
        <div className="text-center mb-14">
          <span className="pill-navy mb-5 inline-flex">{t("fleet.title")}</span>
          <h2 className="text-[32px] md:text-[40px] font-extrabold text-drivo-navy tracking-tight">{t("fleet.subtitle")}</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {vehicles.map(([title, desc, img]) => (
            <div key={title} className="card-elevated overflow-hidden">
              <div className="relative h-44 -mx-6 -mt-6 mb-5 md:-mx-8 md:-mt-8">
                <Image src={img} alt={title} fill sizes="(min-width: 768px) 33vw, 100vw" className="object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/25 to-transparent" />
              </div>
              <h3 className="text-[16px] font-bold text-drivo-navy mb-1">{title}</h3>
              <p className="text-[13px] text-drivo-text-secondary">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Reviews() {
  const { t } = useLanguage();
  const data = [
    [t("reviews.item1.text"), t("reviews.item1.name"), t("reviews.item1.role"), "https://i.pravatar.cc/80?img=10"],
    [t("reviews.item2.text"), t("reviews.item2.name"), t("reviews.item2.role"), "https://i.pravatar.cc/80?img=12"],
    [t("reviews.item3.text"), t("reviews.item3.name"), t("reviews.item3.role"), "https://i.pravatar.cc/80?img=20"],
    [t("reviews.item4.text"), t("reviews.item4.name"), t("reviews.item4.role"), "https://i.pravatar.cc/80?img=14"],
  ] as const;

  return (
    <section className="section bg-white">
      <div className="container-main">
        <div className="text-center mb-14">
          <span className="pill-green mb-5 inline-flex">{t("reviews.title")}</span>
          <h2 className="text-[32px] md:text-[40px] font-extrabold text-drivo-navy tracking-tight">{t("reviews.subtitle")}</h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 max-w-6xl mx-auto">
          {data.map(([text, name, role, img]) => (
            <div key={name} className="card-elevated">
              <p className="text-[13px] text-drivo-text leading-relaxed mb-5 italic">&ldquo;{text}&rdquo;</p>
              <div className="flex items-center gap-3 pt-3 border-t border-drivo-border-light">
                <Image src={img} alt={name} width={40} height={40} className="h-10 w-10 rounded-full object-cover" />
                <div><p className="text-[13px] font-semibold">{name}</p><p className="text-[11px] text-drivo-text-muted">{role}</p></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function DriverCTA() {
  const { t } = useLanguage();
  return (
    <section className="section bg-drivo-navy overflow-hidden">
      <div className="container-main">
        <div className="grid lg:grid-cols-2 gap-14 items-center">
          <div>
            <span className="pill bg-drivo-amber/20 text-drivo-amber mb-5 inline-flex">{t("home.driver.badge")}</span>
            <h2 className="text-[32px] md:text-[40px] font-extrabold text-white tracking-tight mb-5">{t("home.driver.title")}</h2>
            <p className="text-[16px] text-white/50 mb-8">{t("home.driver.desc")}</p>
            <Link href="/rental" className="btn-primary">{t("rental.forDrivers", "Rental for Drivers")}</Link>
          </div>
          <div className="relative h-[400px] overflow-hidden rounded-3xl shadow-elevated">
            <Image src="https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?w=600&q=80" alt={t("home.driver.title")} fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
          </div>
        </div>
      </div>
    </section>
  );
}

function FAQ() {
  const { t } = useLanguage();
  const faqs = [1, 2, 3, 4].map((n) => ({ q: t(`faq.q${n}`), a: t(`faq.a${n}`) }));
  return (
    <section className="section bg-drivo-bg-soft">
      <div className="container-main max-w-3xl">
        <div className="text-center mb-14">
          <span className="pill-navy mb-5 inline-flex">FAQ</span>
          <h2 className="text-[32px] md:text-[40px] font-extrabold text-drivo-navy tracking-tight">{t("faq.title")}</h2>
        </div>
        <div className="space-y-3">
          {faqs.map((faq) => (
            <details key={faq.q} className="group bg-white rounded-2xl border border-drivo-border-light overflow-hidden">
              <summary className="flex items-center justify-between p-5 cursor-pointer list-none">
                <span className="text-[15px] font-semibold text-drivo-text pr-4">{faq.q}</span>
                <span className="w-8 h-8 bg-drivo-bg-soft rounded-full flex items-center justify-center text-drivo-text-muted text-[14px] shrink-0 group-open:bg-drivo-green group-open:text-white transition-all group-open:rotate-45">+</span>
              </summary>
              <div className="px-5 pb-5"><p className="text-[14px] text-drivo-text-secondary pt-2 border-t border-drivo-border-light">{faq.a}</p></div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCTA() {
  const { t } = useLanguage();
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0">
        <Image src="https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=1920&q=80" alt="" fill sizes="100vw" className="object-cover" />
        <div className="absolute inset-0 bg-drivo-navy/90" />
      </div>
      <div className="relative container-main py-20 md:py-28 text-center">
        <h2 className="text-[32px] md:text-[48px] font-extrabold text-white tracking-tight mb-5">{t("cta.title")}</h2>
        <p className="text-[16px] text-white/50 mb-10 max-w-md mx-auto">{t("cta.subtitle")}</p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/book" className="btn-primary text-[16px] px-10">{t("cta.bookNow")}</Link>
          <a href={WHATSAPP_URL} className="btn-outline border-white/20 text-white hover:bg-white/10">{t("common.whatsapp")}</a>
        </div>
      </div>
    </section>
  );
}

export default function HomePage() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <ServicesSection />
        <WAVBanner />
        <HowItWorks />
        <AccessibilitySection />
        <Fleet />
        <Reviews />
        <DriverCTA />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
      <WhatsAppFloat />
      <CookieBanner />
    </>
  );
}
