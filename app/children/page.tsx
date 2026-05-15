import type { Metadata } from "next";
import { LocalizedServicePage } from "@/components/shared/LocalizedPublicPages";

export const metadata: Metadata = {
  title: "Special Needs Children Transport Bratislava",
  description:
    "School Pick-up & Drop-off and safe, gentle transport for children with physical or developmental disabilities in Bratislava.",
  keywords: [
    "children transport Bratislava",
    "special needs taxi",
    "disability children transport Slovakia",
    "school transport ZTP",
  ],
  openGraph: {
    title: "Special Needs Children Transport | Drivo Bratislava",
    description: "School Pick-up & Drop-off and safe, gentle transport for children with disabilities.",
    url: "https://drivo.sk/children",
  },
  alternates: { canonical: "/children" },
};

export default function ChildrenPage() {
  return (
    <LocalizedServicePage
      badge="Children"
      titleKey="services.children.title"
      taglineKey="services.children.tagline"
      descKey="services.children.desc"
      image="/drivo-children-study.jpeg"
      accent="pink"
      bookingHref="/book?service=children"
    />
  );
}
