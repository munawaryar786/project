import type { Metadata } from "next";
import { LocalizedServicePage } from "@/components/shared/LocalizedPublicPages";
import { requestLocale } from "@/lib/i18n/request-locale";
import { publicPageMetadata } from "@/lib/i18n/metadata";

export async function generateMetadata(): Promise<Metadata> {
  return publicPageMetadata("/taxi", await requestLocale());
}

export default function TaxiPage() {
  return (
    <LocalizedServicePage
      badge="Taxi"
      titleKey="services.taxi.title"
      taglineKey="services.taxi.tagline"
      descKey="services.taxi.desc"
      image="/drivo-taxi-service.jpeg"
      accent="green"
    />
  );
}
