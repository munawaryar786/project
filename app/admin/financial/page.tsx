"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/lib/i18n/LanguageContext";

interface FinancialRow {
  driver: {
    id: string;
    fullName: string;
    phone: string;
    vehicle?: {
      plateNumber: string;
      brand: string | null;
      model: string | null;
      type: string;
    } | null;
    vehiclePlate?: string | null;
    vehicleType?: string | null;
  };
  financial: {
    dailyEarnings: number;
    weeklyEarnings: number;
    monthlyEarnings: number;
    totalEarnings: number;
    performanceScore: number;
    averageRating: number | null;
    feedbackCount: number;
    feedbackSummary: string;
    rideCount: number;
  };
}

function eur(value: number) {
  return `EUR ${Number(value || 0).toFixed(2)}`;
}

export default function AdminFinancialPage() {
  const { t } = useLanguage();
  const [rows, setRows] = useState<FinancialRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");

  useEffect(() => {
    fetchFinancial();
  }, []);

  const fetchFinancial = async () => {
    setError("");
    try {
      const res = await fetch("/api/admin/financial", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("adminFinancial.errors.fetch"));
      setRows(data.drivers || []);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err: any) {
      setError(err?.message || t("adminFinancial.errors.fetch"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("adminFinancial.title")}</h1>
          <p className="mt-1 text-sm text-gray-500">{t("adminFinancial.subtitle")} {lastUpdated || "-"}</p>
        </div>
        <button onClick={fetchFinancial} className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
          {t("common.refresh", "Refresh")}
        </button>
      </div>

      {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>}

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        {loading ? (
          <div className="p-12 text-center text-sm text-gray-500">{t("common.loading")}</div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-500">{t("adminFinancial.empty")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="p-3">{t("adminFinancial.driver")}</th>
                  <th className="p-3">{t("adminFinancial.vehicle")}</th>
                  <th className="p-3">{t("adminFinancial.daily")}</th>
                  <th className="p-3">{t("adminFinancial.weekly")}</th>
                  <th className="p-3">{t("adminFinancial.monthly")}</th>
                  <th className="p-3">{t("adminFinancial.total")}</th>
                  <th className="p-3">{t("adminFinancial.score")}</th>
                  <th className="p-3">{t("adminFinancial.rides")}</th>
                  <th className="p-3">{t("adminFinancial.feedback")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row) => {
                  const vehicle = row.driver.vehicle
                    ? `${row.driver.vehicle.plateNumber} - ${row.driver.vehicle.brand || ""} ${row.driver.vehicle.model || ""}`
                    : row.driver.vehiclePlate
                    ? `${row.driver.vehiclePlate} - ${row.driver.vehicleType || ""}`
                    : "-";
                  return (
                    <tr key={row.driver.id} className="hover:bg-gray-50">
                      <td className="p-3">
                        <div className="font-semibold text-gray-900">{row.driver.fullName}</div>
                        <div className="text-xs text-gray-500">{row.driver.phone}</div>
                      </td>
                      <td className="p-3 text-xs text-gray-600">{vehicle}</td>
                      <td className="p-3 font-semibold">{eur(row.financial.dailyEarnings)}</td>
                      <td className="p-3">{eur(row.financial.weeklyEarnings)}</td>
                      <td className="p-3">{eur(row.financial.monthlyEarnings)}</td>
                      <td className="p-3 font-semibold">{eur(row.financial.totalEarnings)}</td>
                      <td className="p-3">{row.financial.performanceScore}%</td>
                      <td className="p-3">{row.financial.rideCount}</td>
                      <td className="max-w-[220px] p-3 text-xs text-gray-600">
                        {row.financial.averageRating
                          ? `${row.financial.averageRating}/5 (${row.financial.feedbackCount})`
                          : row.financial.feedbackSummary}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
