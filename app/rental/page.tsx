import type { Metadata } from "next";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import WhatsAppFloat from "@/components/layout/WhatsAppFloat";
import CookieBanner from "@/components/layout/CookieBanner";
import RentalPortal from "@/components/rental/RentalPortal";

export const metadata: Metadata = {
  title: "Rent a Vehicle | Drivo Bratislava",
  description:
    "Weekly vehicle rental requests for taxi, ride-hailing and delivery drivers in Bratislava.",
  alternates: { canonical: "/rental" },
};

export default function RentalPage() {
  return (
    <>
      <Header />
      <main>
        <RentalPortal />
      </main>
      <Footer />
      <WhatsAppFloat />
      <CookieBanner />
    </>
  );
}
