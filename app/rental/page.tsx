import type { Metadata } from "next";
import { requestLocale } from "@/lib/i18n/request-locale";
import { publicPageMetadata } from "@/lib/i18n/metadata";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import WhatsAppFloat from "@/components/layout/WhatsAppFloat";
import CookieBanner from "@/components/layout/CookieBanner";
import RentalPortal from "@/components/rental/RentalPortal";

export async function generateMetadata(): Promise<Metadata> {
  return publicPageMetadata("/rental", await requestLocale());
}

export default function RentalPage() {
  return (
    <>
      <Header forceSolid />
      <main>
        <RentalPortal />
      </main>
      <Footer />
      <WhatsAppFloat />
      <CookieBanner />
    </>
  );
}
