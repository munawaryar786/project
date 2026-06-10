import type { Metadata } from "next";
import { LocalizedServicePage } from "@/components/shared/LocalizedPublicPages";

export const metadata: Metadata = {
  title: "Assisted & Accessible Transport Bratislava",
  description:
    "Safe and dignified transport for seniors, ZTP passengers, WAV users, hospital visits and assisted mobility users in Bratislava.",
  keywords: [
    "ZTP taxi",
    "PRM transport",
    "wheelchair taxi Bratislava",
    "accessible transport Slovakia",
    "ZTP preprava",
  ],
  openGraph: {
    title: "Assisted & Accessible Transport | Drivo Bratislava",
    description: "Professional assisted transport for seniors, ZTP passengers, WAV users and medical appointments.",
    url: "https://drivo.sk/accessible-transport",
  },
  alternates: { canonical: "/accessible-transport" },
};

export default function AccessiblePage() {
  return (
    <LocalizedServicePage
      badge="Assisted Mobility"
      titleKey="services.accessible.title"
      taglineKey="services.accessible.tagline"
      descKey="services.accessible.desc"
      image="/drivo-wav-wheelchair.jpeg"
      accent="purple"
      bookingHref="/book?service=accessible"
    />
  );
}
