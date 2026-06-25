"use client";

import { BOOKING_QUICK_ROUTES, type PopularRoute } from "@/lib/popular-routes";
import { useLanguage } from "@/lib/i18n/LanguageContext";

function categoryKey(route: PopularRoute) {
  return `popularRoutes.category.${route.category}`;
}

export default function PopularRouteShortcuts({
  selectedRouteSlug,
  onSelectRoute,
}: {
  selectedRouteSlug?: string;
  onSelectRoute: (route: PopularRoute) => void;
}) {
  const { t } = useLanguage();

  return (
    <section className="rounded-2xl border border-drivo-border-light bg-drivo-bg-soft/70 p-4">
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h4 className="text-[15px] font-extrabold text-drivo-navy">
            {t("popularRoutes.bookingTitle", "Popular transfer routes")}
          </h4>
          <p className="text-[12px] text-drivo-text-secondary">
            {t("popularRoutes.bookingSubtitle", "Choose a frequent route to prefill your booking faster.")}
          </p>
        </div>
        <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-drivo-text-muted">
          {t("popularRoutes.liveEstimate", "Live estimate")} {t("common.afterSelection", "after selection")}
        </span>
      </div>

      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-5">
        {BOOKING_QUICK_ROUTES.map((route) => {
          const selected = route.slug === selectedRouteSlug;

          return (
            <button
              key={route.slug}
              type="button"
              onClick={() => onSelectRoute(route)}
              className={`min-w-[220px] rounded-xl border p-3 text-left transition-all sm:min-w-0 ${
                selected
                  ? "border-drivo-green bg-white shadow-soft ring-2 ring-drivo-green/15"
                  : "border-drivo-border-light bg-white hover:border-drivo-green/30 hover:shadow-soft"
              }`}
              aria-pressed={selected}
              aria-label={`${t("popularRoutes.selectRoute", "Select route")}: ${route.name}`}
            >
              <span className="mb-2 inline-flex rounded-full bg-drivo-green-light px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-drivo-green-dark">
                {t(categoryKey(route), route.category)}
              </span>
              <span className="block text-[13px] font-extrabold leading-snug text-drivo-navy">
                {route.name}
              </span>
              <span className="mt-2 flex items-center justify-between gap-2 text-[12px] text-drivo-text-secondary">
                <span>{route.travelTime}</span>
                <strong className="text-[14px] text-drivo-green">
                  {t("popularRoutes.from", "from")} €{route.fromPrice}
                </strong>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
