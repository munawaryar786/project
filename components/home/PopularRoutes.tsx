"use client";

import Link from "next/link";
import {
  HOME_POPULAR_ROUTES,
  MORE_POPULAR_ROUTES,
  popularRouteHref,
  type PopularRoute,
} from "@/lib/popular-routes";
import { useLanguage } from "@/lib/i18n/LanguageContext";

function categoryKey(route: PopularRoute) {
  return `popularRoutes.category.${route.category}`;
}

function RouteCard({ route }: { route: PopularRoute }) {
  const { t } = useLanguage();

  return (
    <article className="group flex h-full flex-col rounded-2xl border border-drivo-border-light bg-white p-5 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:border-drivo-green/25 hover:shadow-card">
      <div className="mb-4 flex items-start justify-between gap-3">
        <span className="rounded-full bg-drivo-green-light px-3 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-drivo-green-dark">
          {t(categoryKey(route), route.category)}
        </span>
        <div className="text-right">
          <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-drivo-text-muted">
            {t("popularRoutes.guidePrice", "Guide price")}
          </span>
          <span className="text-[20px] font-extrabold text-drivo-green">
            {t("popularRoutes.from", "from")} €{route.fromPrice}
          </span>
        </div>
      </div>

      <h3 className="text-[18px] font-extrabold leading-tight text-drivo-navy">
        {route.homeName || route.name}
      </h3>

      <div className="mt-4 grid grid-cols-2 gap-3 text-[13px]">
        <div className="rounded-xl bg-drivo-bg-soft px-3 py-2">
          <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-drivo-text-muted">
            {t("popularRoutes.distance", "Distance")}
          </span>
          <strong className="text-drivo-text">{route.distance}</strong>
        </div>
        <div className="rounded-xl bg-drivo-bg-soft px-3 py-2">
          <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-drivo-text-muted">
            {t("popularRoutes.travelTime", "Travel time")}
          </span>
          <strong className="text-drivo-text">{route.travelTime}</strong>
        </div>
      </div>

      <Link
        href={popularRouteHref(route)}
        className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-drivo-navy px-4 text-[13px] font-bold text-white transition-colors hover:bg-drivo-green"
        aria-label={`${t("popularRoutes.bookThisRoute", "Book this route")}: ${route.name}`}
      >
        {t("popularRoutes.bookThisRoute", "Book this route")}
      </Link>
    </article>
  );
}

export default function PopularRoutes() {
  const { t } = useLanguage();

  return (
    <section className="section bg-drivo-bg-soft" id="popular-routes">
      <div className="container-main">
        <div className="mx-auto mb-10 max-w-3xl text-center md:mb-12">
          <span className="pill-green mb-5 inline-flex">{t("popularRoutes.eyebrow", "Transfers")}</span>
          <h2 className="text-[32px] font-extrabold tracking-tight text-drivo-navy md:text-[40px]">
            {t("popularRoutes.title", "Popular Routes")}
          </h2>
          <p className="mt-4 text-[16px] leading-relaxed text-drivo-text-secondary">
            {t(
              "popularRoutes.subtitle",
              "Fixed route guide prices for airport transfers, business travel and cross-border rides from Bratislava."
            )}
          </p>
          <p className="mt-3 text-[14px] font-bold text-drivo-green-dark">
            {t("popularRoutes.advantage", "Fixed prices. Professional drivers. No hidden fees.")}
          </p>
          <p className="mt-4 text-[14px] leading-relaxed text-drivo-text-secondary">
            {t(
              "popularRoutes.supportingText",
              "Whether you're travelling to Vienna Airport, Budapest, Prague, Brno or anywhere in Slovakia, Drivo offers reliable door-to-door transportation with transparent pricing and comfortable vehicles."
            )}
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {HOME_POPULAR_ROUTES.map((route) => (
            <RouteCard key={route.slug} route={route} />
          ))}
        </div>

        <div className="mt-8 rounded-2xl border border-drivo-border-light bg-white p-5 shadow-soft">
          <h3 className="text-[15px] font-extrabold text-drivo-navy">
            {t("popularRoutes.moreTitle", "More popular transfers")}
          </h3>
          <div className="mt-4 flex flex-wrap gap-2">
            {MORE_POPULAR_ROUTES.map((route) => (
              <Link
                key={route.slug}
                href={popularRouteHref(route)}
                className="rounded-full border border-drivo-border-light bg-drivo-bg-soft px-3 py-2 text-[12px] font-semibold text-drivo-text transition hover:border-drivo-green/30 hover:bg-drivo-green-light hover:text-drivo-green-dark"
              >
                {route.name} · {t("popularRoutes.from", "from")} €{route.fromPrice}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
