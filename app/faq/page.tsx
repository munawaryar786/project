import type { Metadata } from "next";
import { LocalizedFAQPage } from "@/components/shared/LocalizedPublicPages";

export const metadata: Metadata = {
  title: "FAQ - Frequently Asked Questions",
  description:
    "Everything you need to know about Drivo booking, accessible transport, payments, airport transfers and more.",
  alternates: { canonical: "/faq" },
  openGraph: {
    title: "FAQ | Drivo Bratislava",
    description: "Answers to common questions about booking, accessibility, payment, and our services.",
    url: "https://drivo.sk/faq",
  },
};

export default function FAQPage() {
  return <LocalizedFAQPage />;
}
