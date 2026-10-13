import type { Metadata } from "next";
import { LocalizedServicePage } from "@/components/shared/LocalizedPublicPages";
import { requestLocale } from "@/lib/i18n/request-locale";
import { publicPageMetadata } from "@/lib/i18n/metadata";

export async function generateMetadata(): Promise<Metadata> {
  return {
    ...publicPageMetadata("/airport", await requestLocale()),
    keywords: ["airport transfer Bratislava", "BTS taxi", "Vienna airport taxi", "letisko transfer", "airport taxi Slovakia"],
  };
}

export default function AirportPage() {
  return (
    <LocalizedServicePage
      badge="BTS / VIE"
      titleKey="services.airport.title"
      taglineKey="services.airport.tagline"
      descKey="services.airport.desc"
      image="/drivo-airport-van.jpeg"
      accent="blue"
      bookingHref="/book?service=airport"
    />
  );
}
