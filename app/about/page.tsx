import type { Metadata } from "next";
import { LocalizedAboutPage } from "@/components/shared/LocalizedPublicPages";

export const metadata: Metadata = {
  title: "About Drivo - Our Story & Mission",
  description:
    "Drivo s.r.o. is Bratislava's accessibility-first mobility platform for dignified, professional transport.",
  alternates: { canonical: "/about" },
  openGraph: {
    title: "About Drivo | Accessible Mobility Bratislava",
    description: "Our mission: dignified, professional transport for everyone in Bratislava.",
    url: "https://drivo.sk/about",
  },
};

export default function AboutPage() {
  return <LocalizedAboutPage />;
}
