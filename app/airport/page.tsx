import type { Metadata } from "next";
import { LocalizedServicePage } from "@/components/shared/LocalizedPublicPages";

export const metadata: Metadata = {
  title: "Airport Transfer BTS & Vienna | Bratislava",
  description:
    "Fixed-price airport transfers from Bratislava (BTS) and Vienna (VIE). Flight tracking and simple online booking.",
  keywords: [
    "airport transfer Bratislava",
    "BTS taxi",
    "Vienna airport taxi",
    "letisko transfer",
    "airport taxi Slovakia",
  ],
  openGraph: {
    title: "Airport Transfers BTS & VIE | Drivo Bratislava",
    description: "Reliable airport transfers to/from Bratislava and Vienna airports.",
    url: "https://drivo.sk/airport",
  },
  alternates: { canonical: "/airport" },
};

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
