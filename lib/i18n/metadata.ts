import type { Metadata } from "next";
import type { UiLocale } from "./locale-resolution";

type Copy = { title: string; description: string };
export type PublicMetadataRoute = "/" | "/about" | "/accessible-transport" | "/airport" |
  "/car-rental" | "/children" | "/contact" | "/faq" | "/rental" |
  "/seniors" | "/taxi";

// Newly authored non-English SEO copy requires linguistic review before release.
const copy: Record<PublicMetadataRoute, Record<UiLocale, Copy>> = {
  "/": {
    sk: { title: "Drivo — Dostupná mobilita | Bratislava", description: "Dostupná doprava v Bratislave: bezbariérové jazdy, doprava seniorov, letiskové transfery a prenájom áut pre vodičov." },
    de: { title: "Drivo — Barrierefreie Mobilität | Bratislava", description: "Barrierefreie Mobilität in Bratislava: Rollstuhltaxis, Seniorentransporte, Flughafentransfers und Fahrzeugvermietung für Fahrer." },
    uk: { title: "Drivo — Доступна мобільність | Братислава", description: "Доступні перевезення у Братиславі: транспорт для людей на кріслах колісних, поїздки для літніх людей, трансфери до аеропорту та оренда авто для водіїв." },
    en: { title: "Drivo — Accessible Mobility Platform | Bratislava", description: "Bratislava's accessibility-first mobility platform. Wheelchair taxis (ZTP/PRM), senior transport, airport transfers and car rental for drivers." },
  },
  "/about": {
    sk: { title: "O Drivo — Náš príbeh a poslanie", description: "Drivo s.r.o. poskytuje dôstojnú a profesionálnu dostupnú dopravu v Bratislave." },
    de: { title: "Über Drivo — Unsere Geschichte und Mission", description: "Drivo s.r.o. bietet würdevolle und professionelle barrierefreie Mobilität in Bratislava." },
    uk: { title: "Про Drivo — Наша історія та місія", description: "Drivo s.r.o. забезпечує гідні та професійні доступні перевезення у Братиславі." },
    en: { title: "About Drivo - Our Story & Mission", description: "Drivo s.r.o. is Bratislava's accessibility-first mobility platform for dignified, professional transport." },
  },
  "/accessible-transport": {
    sk: { title: "Asistovaná a bezbariérová doprava v Bratislave", description: "Bezpečná doprava pre seniorov, držiteľov ZŤP, používateľov vozíkov a cestujúcich s potrebou asistencie v Bratislave." },
    de: { title: "Assistierte und barrierefreie Fahrten in Bratislava", description: "Sichere Fahrten für Senioren, Menschen mit Behinderung, Rollstuhlnutzer und Personen mit Assistenzbedarf in Bratislava." },
    uk: { title: "Доступні перевезення з супроводом у Братиславі", description: "Безпечні поїздки для літніх людей, пасажирів з інвалідністю та тих, хто користується кріслом колісним або потребує допомоги." },
    en: { title: "Assisted & Accessible Transport Bratislava", description: "Safe and dignified transport for seniors, ZTP passengers, WAV users, hospital visits and assisted mobility users in Bratislava." },
  },
  "/airport": {
    sk: { title: "Letiskové transfery Bratislava a Viedeň", description: "Transfery za pevnú cenu z letísk Bratislava (BTS) a Viedeň (VIE), so sledovaním letu a jednoduchou online rezerváciou." },
    de: { title: "Flughafentransfer Bratislava und Wien", description: "Festpreis-Transfers ab Bratislava (BTS) und Wien (VIE) mit Flugverfolgung und einfacher Online-Buchung." },
    uk: { title: "Трансфери з аеропортів Братислави та Відня", description: "Трансфери за фіксованою ціною з аеропортів Братислави (BTS) та Відня (VIE), з відстеженням рейсу та онлайн-бронюванням." },
    en: { title: "Airport Transfer BTS & Vienna | Bratislava", description: "Fixed-price airport transfers from Bratislava (BTS) and Vienna (VIE). Flight tracking and simple online booking." },
  },
  "/car-rental": {
    sk: { title: "Prenájom áut pre vodičov taxi a rozvozu | Bratislava", description: "Týždenný prenájom udržiavaných vozidiel na taxi a rozvoz v Bratislave." },
    de: { title: "Fahrzeugvermietung für Taxi- und Lieferfahrer | Bratislava", description: "Wöchentliche Vermietung gepflegter Fahrzeuge für Taxi- und Lieferfahrten in Bratislava." },
    uk: { title: "Оренда авто для водіїв таксі та доставки | Братислава", description: "Щотижнева оренда доглянутих автомобілів для таксі та доставки у Братиславі." },
    en: { title: "Taxi & Delivery Car Rental for Drivers | Bratislava", description: "Rent a taxi or food-delivery vehicle from Drivo on a weekly basis. Well-maintained vehicles for Bratislava drivers." },
  },
  "/children": {
    sk: { title: "Doprava detí so špeciálnymi potrebami | Bratislava", description: "Bezpečná a citlivá školská doprava detí s telesným alebo vývinovým znevýhodnením v Bratislave." },
    de: { title: "Fahrten für Kinder mit besonderem Unterstützungsbedarf | Bratislava", description: "Sichere und einfühlsame Schulfahrten für Kinder mit körperlichen oder entwicklungsbedingten Einschränkungen in Bratislava." },
    uk: { title: "Перевезення дітей з особливими потребами | Братислава", description: "Безпечні та дбайливі поїздки до школи для дітей із фізичними порушеннями або особливостями розвитку у Братиславі." },
    en: { title: "Special Needs Children Transport Bratislava", description: "School Pick-up & Drop-off and safe, gentle transport for children with physical or developmental disabilities in Bratislava." },
  },
  "/contact": {
    sk: { title: "Kontaktujte Drivo — Podpora 24/7", description: "Kontaktujte Drivo v Bratislave telefonicky, cez WhatsApp alebo e-mailom." },
    de: { title: "Kontakt zu Drivo — Unterstützung rund um die Uhr", description: "Kontaktieren Sie Drivo in Bratislava per Telefon, WhatsApp oder E-Mail." },
    uk: { title: "Зв’язатися з Drivo — Підтримка 24/7", description: "Зв’яжіться з Drivo у Братиславі телефоном, через WhatsApp або електронною поштою." },
    en: { title: "Contact Us - 24/7 Support", description: "Contact Drivo Bratislava 24/7. Call, WhatsApp or email us." },
  },
  "/faq": {
    sk: { title: "Časté otázky o Drivo", description: "Odpovede na otázky o rezervácii, dostupnej doprave, platbách a letiskových transferoch Drivo." },
    de: { title: "Häufige Fragen zu Drivo", description: "Antworten zu Buchungen, barrierefreien Fahrten, Zahlungen und Flughafentransfers bei Drivo." },
    uk: { title: "Поширені запитання про Drivo", description: "Відповіді на запитання про бронювання, доступні перевезення, оплату та трансфери до аеропорту з Drivo." },
    en: { title: "FAQ - Frequently Asked Questions", description: "Everything you need to know about Drivo booking, accessible transport, payments, airport transfers and more." },
  },
  "/rental": {
    sk: { title: "Prenajmite si vozidlo | Drivo Bratislava", description: "Požiadajte o týždenný prenájom vozidla pre taxi, zdieľané jazdy alebo rozvoz v Bratislave." },
    de: { title: "Fahrzeug mieten | Drivo Bratislava", description: "Fragen Sie eine wöchentliche Fahrzeugmiete für Taxi-, Fahrdienst- oder Lieferfahrten in Bratislava an." },
    uk: { title: "Орендувати автомобіль | Drivo Братислава", description: "Подайте заявку на щотижневу оренду автомобіля для таксі, перевезень або доставки у Братиславі." },
    en: { title: "Rent a Vehicle | Drivo Bratislava", description: "Weekly vehicle rental requests for taxi, ride-hailing and delivery drivers in Bratislava." },
  },
  "/seniors": {
    sk: { title: "Taxi pre seniorov v Bratislave", description: "Trpezlivá doprava seniorov od dverí k dverám v Bratislave. Rezerváciu môže vykonať aj rodina." },
    de: { title: "Seniorentaxi in Bratislava", description: "Geduldige Fahrten von Tür zu Tür für ältere Menschen in Bratislava. Angehörige können ebenfalls buchen." },
    uk: { title: "Таксі для літніх людей у Братиславі", description: "Уважні поїздки від дверей до дверей для літніх людей у Братиславі. Родичі також можуть забронювати." },
    en: { title: "Taxi for Seniors Bratislava", description: "Patient, door-to-door taxi service for elderly passengers in Bratislava. Family can book on behalf." },
  },
  "/taxi": {
    sk: { title: "Štandardné taxi v Bratislave", description: "Profesionálne a cenovo dostupné jazdy taxi v Bratislave s preverenými vodičmi, čistými autami a platbou kartou alebo v hotovosti." },
    de: { title: "Standardtaxi in Bratislava", description: "Professionelle und erschwingliche Taxifahrten in Bratislava mit geprüften Fahrern, sauberen Autos sowie Karten- oder Barzahlung." },
    uk: { title: "Звичайне таксі у Братиславі", description: "Професійні та доступні поїздки Братиславою з перевіреними водіями, чистими авто й оплатою карткою або готівкою." },
    en: { title: "Standard Taxi Bratislava", description: "Professional, affordable taxi rides across Bratislava. Vetted drivers, clean vehicles, card and cash payment." },
  },
};

export const openGraphLocales: Record<UiLocale, string> = {
  sk: "sk_SK", de: "de_DE", uk: "uk_UA", en: "en_GB",
};

export function isPublicMetadataRoute(path: string): path is PublicMetadataRoute {
  return Object.hasOwn(copy, path);
}

export function publicMetadataCopy(path: PublicMetadataRoute, locale: UiLocale): Copy {
  return copy[path][locale];
}

export function rootMetadataCopy(locale: UiLocale, childrenTransport: boolean): Copy {
  const base = publicMetadataCopy("/", locale);
  if (!childrenTransport) return base;
  const description: Record<UiLocale, string> = {
    sk: "Dostupná doprava v Bratislave: bezbariérové jazdy, doprava seniorov a detí so špeciálnymi potrebami, letiskové transfery a prenájom áut pre vodičov.",
    de: "Barrierefreie Mobilität in Bratislava: Rollstuhltaxis, Fahrten für Senioren und Kinder mit besonderem Unterstützungsbedarf, Flughafentransfers und Fahrzeugvermietung für Fahrer.",
    uk: "Доступні перевезення у Братиславі: поїздки для людей на кріслах колісних, літніх людей і дітей з особливими потребами, трансфери до аеропорту та оренда авто для водіїв.",
    en: "Bratislava's #1 accessibility-first mobility platform. Wheelchair taxis (ZTP/PRM), senior transport, special-needs children, airport transfers & car rental for drivers.",
  };
  return { ...base, description: description[locale] };
}

export function publicPageMetadata(path: Exclude<PublicMetadataRoute, "/">, locale: UiLocale): Metadata {
  const content = publicMetadataCopy(path, locale);
  return {
    title: content.title,
    description: content.description,
    alternates: { canonical: path },
    openGraph: {
      locale: openGraphLocales[locale],
      url: `https://drivo.sk${path}`,
      title: content.title,
      description: content.description,
    },
    twitter: {
      card: "summary_large_image",
      title: content.title,
      description: content.description,
      images: ["/og-image.jpg"],
    },
  };
}
