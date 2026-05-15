import type { Metadata } from "next";
import { LocalizedServicePage } from "@/components/shared/LocalizedPublicPages";

export const metadata: Metadata = {
  title: "Taxi for Seniors Bratislava",
  description:
    "Patient, door-to-door taxi service for elderly passengers in Bratislava. Family can book on behalf.",
  keywords: [
    "senior taxi Bratislava",
    "taxi pre seniorov",
    "elderly transport Slovakia",
    "medical taxi Bratislava",
  ],
  openGraph: {
    title: "Senior Taxi Bratislava | Drivo",
    description: "Patient, door-to-door transport for seniors. Family can book.",
    url: "https://drivo.sk/seniors",
  },
  alternates: { canonical: "/seniors" },
};

export default function SeniorsPage() {
  return (
    <LocalizedServicePage
      badge="Senior"
      titleKey="services.senior.title"
      taglineKey="services.senior.tagline"
      descKey="services.senior.desc"
      image="/drivo-senior-care.jpeg"
      accent="amber"
      bookingHref="/book?service=senior"
    />
  );
}
