import type { Metadata } from "next";
import { LocalizedFAQPage } from "@/components/shared/LocalizedPublicPages";
import { requestLocale } from "@/lib/i18n/request-locale";
import { publicPageMetadata } from "@/lib/i18n/metadata";

export async function generateMetadata(): Promise<Metadata> {
  return publicPageMetadata("/faq", await requestLocale());
}

export default function FAQPage() {
  return <LocalizedFAQPage />;
}
