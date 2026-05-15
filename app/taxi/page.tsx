import type { Metadata } from "next";
import { LocalizedServicePage } from "@/components/shared/LocalizedPublicPages";

export const metadata: Metadata = {
  title: "Standard Taxi Bratislava",
  description:
    "Professional, affordable taxi rides across Bratislava. Vetted drivers, clean vehicles, card and cash payment.",
  openGraph: {
    title: "Standard Taxi Bratislava | Drivo",
    description: "City rides across Bratislava with professional vetted drivers. 24/7 service.",
    url: "https://drivo.sk/taxi",
  },
  alternates: { canonical: "/taxi" },
};

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
