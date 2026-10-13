import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LocalizedServicePage } from "@/components/shared/LocalizedPublicPages";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { requestLocale } from "@/lib/i18n/request-locale";
import { publicPageMetadata } from "@/lib/i18n/metadata";

export async function generateMetadata(): Promise<Metadata> {
  if (!FEATURE_FLAGS.childrenTransport) {
    return { title: "Page Not Found", robots: { index: false, follow: false } };
  }
  return {
    ...publicPageMetadata("/children", await requestLocale()),
    keywords: ["children transport Bratislava", "special needs taxi", "disability children transport Slovakia", "school transport ZTP"],
  };
}

export default function ChildrenPage() {
  if (!FEATURE_FLAGS.childrenTransport) notFound();

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
