import type { Metadata } from "next";
import { LocalizedContactPage } from "@/components/shared/LocalizedPublicPages";

export const metadata: Metadata = {
  title: "Contact Us - 24/7 Support",
  description: "Contact Drivo Bratislava 24/7. Call, WhatsApp or email us.",
  alternates: { canonical: "/contact" },
  openGraph: {
    title: "Contact Drivo | Bratislava Mobility",
    description: "24/7 contact. Phone, WhatsApp and email available.",
    url: "https://drivo.sk/contact",
  },
};

export default function ContactPage() {
  return <LocalizedContactPage />;
}
