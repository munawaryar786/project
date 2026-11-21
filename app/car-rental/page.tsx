import type { Metadata } from "next";
import { LocalizedServicePage } from "@/components/shared/LocalizedPublicPages";
import { requestLocale } from "@/lib/i18n/request-locale";
import { publicPageMetadata } from "@/lib/i18n/metadata";

export async function generateMetadata(): Promise<Metadata> {
  return {
    ...publicPageMetadata("/car-rental", await requestLocale()),
    keywords: ["taxi car rental Bratislava", "driver vehicle rental Slovakia", "weekly car rental taxi", "food delivery car rent"],
  };
}

export default function CarRentalPage() {
  return (
    <LocalizedServicePage
      badge="Drivers"
      titleKey="services.rental.title"
      taglineKey="services.rental.tagline"
      descKey="services.rental.desc"
      image="https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?w=1920&q=80"
      accent="amber"
      bookingHref="/rental"
      bookingLabelKey="rental.forDrivers"
      bookingLabelFallback="Rental for Drivers"
    />
  );
}
