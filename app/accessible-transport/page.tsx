import type { Metadata } from "next";
import { LocalizedServicePage } from "@/components/shared/LocalizedPublicPages";

export const metadata: Metadata = {
  title: "Accessible Transport ZTP / PRM Bratislava",
  description:
    "Dignified transport for wheelchair users, ZTP/PRM passengers, elderly, and special-needs individuals in Bratislava.",
  keywords: [
    "ZTP taxi",
    "PRM transport",
    "wheelchair taxi Bratislava",
    "accessible transport Slovakia",
    "ZTP preprava",
  ],
  openGraph: {
    title: "Accessible Transport ZTP/PRM | Drivo Bratislava",
    description: "Professional accessible transport for wheelchair users and ZTP/PRM passengers.",
    url: "https://drivo.sk/accessible-transport",
  },
  alternates: { canonical: "/accessible-transport" },
};

export default function AccessiblePage() {
  return (
    <LocalizedServicePage
      badge="ZTP / PRM"
      titleKey="services.accessible.title"
      taglineKey="services.accessible.tagline"
      descKey="services.accessible.desc"
      image="/drivo-wav-wheelchair.jpeg"
      accent="purple"
      bookingHref="/book?service=accessible"
    />
  );
}
