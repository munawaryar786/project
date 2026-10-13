import type { Metadata } from "next";
import { LocalizedAboutPage } from "@/components/shared/LocalizedPublicPages";
import { requestLocale } from "@/lib/i18n/request-locale";
import { publicPageMetadata } from "@/lib/i18n/metadata";

export async function generateMetadata(): Promise<Metadata> {
  return publicPageMetadata("/about", await requestLocale());
}

export default function AboutPage() {
  return <LocalizedAboutPage />;
}
