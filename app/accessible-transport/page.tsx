import type { Metadata } from "next";
import { LocalizedServicePage } from "@/components/shared/LocalizedPublicPages";
import { requestLocale } from "@/lib/i18n/request-locale";
import { publicPageMetadata } from "@/lib/i18n/metadata";

export async function generateMetadata(): Promise<Metadata> {
  return {
    ...publicPageMetadata("/accessible-transport", await requestLocale()),
    keywords: ["ZTP taxi", "PRM transport", "wheelchair taxi Bratislava", "accessible transport Slovakia", "ZTP preprava"],
  };
}

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
