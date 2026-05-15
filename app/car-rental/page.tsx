import type { Metadata } from "next";
import { LocalizedServicePage } from "@/components/shared/LocalizedPublicPages";

export const metadata: Metadata = {
  title: "Taxi & Delivery Car Rental for Drivers | Bratislava",
  description:
    "Rent a taxi or food-delivery vehicle from Drivo on a weekly basis. Well-maintained vehicles for Bratislava drivers.",
  keywords: [
    "taxi car rental Bratislava",
    "driver vehicle rental Slovakia",
    "weekly car rental taxi",
    "food delivery car rent",
  ],
  openGraph: {
    title: "Car Rental for Drivers | Drivo Bratislava",
    description: "Weekly vehicle rental for taxi and delivery drivers.",
    url: "https://drivo.sk/car-rental",
  },
  alternates: { canonical: "/car-rental" },
};

export default function CarRentalPage() {
  return (
    <LocalizedServicePage
      badge="Drivers"
      titleKey="services.rental.title"
      taglineKey="services.rental.tagline"
      descKey="services.rental.desc"
      image="https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?w=1920&q=80"
      accent="amber"
      bookingHref="/contact"
    />
  );
}
