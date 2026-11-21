import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requestLocale } from "@/lib/i18n/request-locale";
import { publicPageMetadata } from "@/lib/i18n/metadata";

export async function generateMetadata(): Promise<Metadata> {
  return {
    ...publicPageMetadata("/seniors", await requestLocale()),
    keywords: ["senior taxi Bratislava", "taxi pre seniorov", "elderly transport Slovakia", "medical taxi Bratislava"],
  };
}

export default function SeniorsPage() {
  redirect("/accessible-transport");
}
