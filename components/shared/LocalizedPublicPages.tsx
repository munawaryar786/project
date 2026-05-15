"use client";

import Link from "next/link";
import Image from "next/image";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import WhatsAppFloat from "@/components/layout/WhatsAppFloat";
import BrandLogo from "@/components/shared/BrandLogo";
import ContactForm from "@/components/shared/ContactForm";
import { PHONE_NUMBER, WHATSAPP_URL } from "@/lib/constants";
import { useLanguage } from "@/lib/i18n/LanguageContext";

type ServicePageProps = {
  badge: string;
  titleKey: string;
  taglineKey: string;
  descKey: string;
  image: string;
  accent?: "green" | "purple" | "amber" | "blue" | "pink";
  bookingHref?: string;
};

const accentClasses = {
  green: "from-drivo-navy to-green-950",
  purple: "from-purple-900 to-drivo-navy",
  amber: "from-amber-900 to-drivo-navy",
  blue: "from-sky-900 to-drivo-navy",
  pink: "from-rose-900 to-drivo-navy",
};

export function LocalizedServicePage({
  badge,
  titleKey,
  taglineKey,
  descKey,
  image,
  accent = "green",
  bookingHref = "/book",
}: ServicePageProps) {
  const { t } = useLanguage();
  const benefits = [
    ["✅", t("trust.item1.title"), t("trust.item1.desc")],
    ["♿", t("trust.item4.title"), t("trust.item4.desc")],
    ["💳", t("booking.payment"), `${t("booking.paymentCard")} / ${t("booking.paymentCash")} / ${t("booking.paymentInvoice")}`],
    ["💬", t("how.step3.title"), t("otp.subtitle")],
    ["🛡️", t("booking.secureBooking"), t("booking.gdprSecure")],
    ["🚐", t("fleet.sevenSeater"), t("fleet.sevenSeaterWarning")],
  ];

  return (
    <>
      <Header />
      <main>
        <section className={`relative bg-gradient-to-br ${accentClasses[accent]} pt-28 pb-16 md:pt-32 md:pb-20 overflow-hidden`}>
          <div className="absolute inset-0">
            <Image src={image} alt="" fill priority sizes="100vw" className="object-cover opacity-20" />
            <div className="absolute inset-0 bg-drivo-navy/70" />
          </div>
          <div className="relative container-main">
            <span className="pill-green mb-4 inline-flex">{badge}</span>
            <h1 className="text-[36px] md:text-[48px] font-extrabold text-white tracking-tight mb-4">
              {t(titleKey)}
            </h1>
            <p className="text-[17px] text-white/60 max-w-xl mb-8">
              {t(descKey)}
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link href={bookingHref} className="btn-primary">{t("nav.book")} →</Link>
              <a href={WHATSAPP_URL} className="btn-outline border-white/20 text-white hover:bg-white/10">💬 {t("common.whatsapp")}</a>
            </div>
          </div>
        </section>

        <section className="section bg-white">
          <div className="container-main">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div>
                <span className="pill-navy mb-5 inline-flex">{t(taglineKey)}</span>
                <h2 className="text-[28px] md:text-[36px] font-extrabold text-drivo-navy mb-5">
                  {t("trust.title")}
                </h2>
                <div className="space-y-4">
                  {benefits.map(([icon, title, desc]) => (
                    <div key={title} className="flex items-start gap-4 p-4 rounded-2xl hover:bg-drivo-bg-soft transition-colors">
                      <span className="text-xl shrink-0 mt-0.5">{icon}</span>
                      <div>
                        <p className="text-[14px] font-semibold text-drivo-text">{title}</p>
                        <p className="text-[12px] text-drivo-text-muted">{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="relative h-[420px] overflow-hidden rounded-3xl shadow-elevated">
                <Image src={image} alt={t(titleKey)} fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
              </div>
            </div>
          </div>
        </section>

        <section className="bg-drivo-navy py-16">
          <div className="container-main text-center">
            <h2 className="text-[28px] font-bold text-white mb-4">{t("cta.title")}</h2>
            <p className="text-white/50 mb-8">{t("booking.pageIntro")}</p>
            <Link href={bookingHref} className="btn-primary text-[16px] px-10">{t("cta.bookNow")} →</Link>
          </div>
        </section>
      </main>
      <Footer />
      <WhatsAppFloat />
    </>
  );
}

export function LocalizedAboutPage() {
  const { t } = useLanguage();
  return (
    <>
      <Header />
      <main>
        <section className="relative overflow-hidden bg-drivo-navy pt-28 pb-16 md:pt-36 md:pb-20">
          <div className="absolute inset-0">
            <Image
              src="https://images.unsplash.com/photo-1521791136064-7986c2920216?w=1920&q=80"
              alt=""
              fill
              priority
              sizes="100vw"
              className="object-cover opacity-18"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-drivo-navy via-drivo-navy/95 to-drivo-navy/75" />
          </div>
          <div className="container-main relative">
            <BrandLogo className="mb-5 h-16 w-48" />
            <h1 className="text-[36px] md:text-[52px] font-extrabold text-white mb-5">{t("about.title", "Drivo s.r.o.")}</h1>
            <p className="text-[16px] md:text-[18px] leading-relaxed text-white/65 max-w-4xl">{t("about.intro")}</p>
          </div>
        </section>

        <section className="section bg-white">
          <div className="container-main">
            <div className="grid lg:grid-cols-2 gap-8">
              <div className="rounded-3xl border border-drivo-border-light bg-gradient-to-br from-white to-drivo-green-light/35 p-8 shadow-soft">
                <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-drivo-green text-sm font-black text-white">
                  01
                </span>
                <h2 className="text-[26px] font-extrabold text-drivo-navy mb-4">{t("about.missionTitle")}</h2>
                <p className="text-[15px] leading-relaxed text-drivo-text-secondary">{t("about.missionText")}</p>
              </div>

              <div className="rounded-3xl border border-drivo-border-light bg-gradient-to-br from-white to-drivo-purple-light/30 p-8 shadow-soft">
                <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-drivo-navy text-sm font-black text-white">
                  02
                </span>
                <h2 className="text-[26px] font-extrabold text-drivo-navy mb-4">{t("about.storyTitle")}</h2>
                <p className="text-[15px] leading-relaxed text-drivo-text-secondary">{t("about.storyText")}</p>
              </div>
            </div>

            <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                ["24/7", t("booking.support247")],
                ["ZTP", t("services.accessible.title")],
                ["BTS", t("services.airport.title")],
                ["GDPR", t("booking.gdprSecure")],
              ].map(([value, label]) => (
                <div key={value} className="rounded-2xl bg-drivo-bg-soft p-5 text-center">
                  <div className="text-[24px] font-extrabold text-drivo-navy">{value}</div>
                  <div className="mt-1 text-[12px] font-medium text-drivo-text-muted">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

export function LocalizedFAQPage() {
  const { t } = useLanguage();
  const faqs = [1, 2, 3, 4].map((n) => ({
    q: t(`faq.q${n}`),
    a: t(`faq.a${n}`),
  }));

  return (
    <>
      <Header />
      <main>
        <section className="bg-drivo-navy pt-28 pb-12">
          <div className="container-main">
            <h1 className="text-[36px] font-extrabold text-white mb-2">{t("faq.title")}</h1>
            <p className="text-white/50">{t("services.subtitle")}</p>
          </div>
        </section>
        <section className="section bg-drivo-bg-soft">
          <div className="container-main max-w-3xl space-y-3">
            {faqs.map((faq) => (
              <details key={faq.q} className="group bg-white rounded-2xl border border-drivo-border-light overflow-hidden">
                <summary className="flex items-center justify-between p-5 cursor-pointer list-none">
                  <span className="text-[15px] font-semibold text-drivo-text pr-4">{faq.q}</span>
                  <span className="w-8 h-8 bg-drivo-bg-soft rounded-full flex items-center justify-center text-drivo-text-muted shrink-0 group-open:bg-drivo-green group-open:text-white transition-all group-open:rotate-45">+</span>
                </summary>
                <div className="px-5 pb-5">
                  <p className="text-[14px] text-drivo-text-secondary pt-2 border-t border-drivo-border-light">{faq.a}</p>
                </div>
              </details>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

export function LocalizedContactPage() {
  const { t } = useLanguage();
  return (
    <>
      <Header />
      <main>
        <section className="bg-drivo-navy pt-28 pb-12">
          <div className="container-main">
            <h1 className="text-[36px] font-extrabold text-white mb-2">{t("nav.contact")}</h1>
            <p className="text-white/50">{t("booking.support247")}</p>
          </div>
        </section>
        <section className="section bg-white">
          <div className="container-main grid lg:grid-cols-2 gap-10">
            <div className="space-y-4">
              <Info title={t("common.callUs")} value={PHONE_NUMBER} />
              <Info title={t("common.whatsapp")} value={WHATSAPP_URL.replace("https://", "")} />
              <Info title={t("common.email")} value="info@drivo.sk" />
              <Info title={t("footer.company")} value="Bratislava, Slovakia" />
            </div>
            <div className="card">
              <h2 className="text-[20px] font-bold text-drivo-navy mb-5">{t("contact.sendMessage")}</h2>
              <ContactForm />
            </div>
          </div>
        </section>
      </main>
      <Footer />
      <WhatsAppFloat />
    </>
  );
}

function Info({ title, value }: { title: string; value: string }) {
  return (
    <div className="card">
      <h3 className="text-[16px] font-bold text-drivo-navy mb-2">{title}</h3>
      <p className="text-drivo-text-secondary">{value}</p>
    </div>
  );
}

export function LocalizedLegalPage({ type }: { type: "privacy" | "terms" | "gdpr" }) {
  const { t } = useLanguage();
  const title =
    type === "privacy"
      ? t("legal.privacyTitle")
      : type === "terms"
        ? t("legal.termsTitle")
        : t("legal.gdprTitle");

  const points =
    type === "terms"
      ? ["booking.title", "cash.message", "fleet.sevenSeaterWarning", "fleet.wavNote"]
      : ["booking.gdprSecure", "footer.brandText", "booking.secureBooking", "booking.support247"];

  return (
    <>
      <Header />
      <main>
        <section className="bg-drivo-navy pt-28 pb-12">
          <div className="container-main">
            <h1 className="text-[36px] font-extrabold text-white mb-2">{title}</h1>
            <p className="text-white/50">{t("legal.updated")} | Drivo s.r.o.</p>
          </div>
        </section>
        <section className="section bg-white">
          <div className="container-main max-w-3xl space-y-5">
            {points.map((key, index) => (
              <div key={key} className="card">
                <h2 className="text-[20px] font-bold text-drivo-navy mb-3">{index + 1}. {title}</h2>
                <p className="text-drivo-text-secondary">{t(key)}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
