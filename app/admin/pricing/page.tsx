"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/lib/i18n/LanguageContext";

const emptyPricing = {
  standardTaxiBasePrice: "3",
  pricePerKm: "1.5",
  airportTransferPrice: "5",
  tourismTransferPrice: "0",
  weeklyVehicleRentalPrice: "120",
  dailyVehicleRentalPrice: "25",
  minimumFare: "5",
};

export default function AdminPricingPage() {
  const { t } = useLanguage();
  const [form, setForm] = useState(emptyPricing);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetchPricing();
  }, []);

  const fetchPricing = async () => {
    setError("");
    try {
      const res = await fetch("/api/admin/pricing", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("adminPricing.errors.fetch"));
      const pricing = data.pricing;
      setForm({
        standardTaxiBasePrice: String(pricing.standardTaxiBasePrice),
        pricePerKm: String(pricing.pricePerKm),
        airportTransferPrice: String(pricing.airportTransferPrice),
        tourismTransferPrice: String(pricing.tourismTransferPrice),
        weeklyVehicleRentalPrice: String(pricing.weeklyVehicleRentalPrice),
        dailyVehicleRentalPrice: String(pricing.dailyVehicleRentalPrice),
        minimumFare: String(pricing.minimumFare),
      });
    } catch (err: any) {
      setError(err?.message || t("adminPricing.errors.fetch"));
    } finally {
      setLoading(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");

    try {
      const payload = Object.fromEntries(
        Object.entries(form).map(([key, value]) => [key, Number(value || 0)])
      );
      const res = await fetch("/api/admin/pricing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("adminPricing.errors.save"));
      setMessage(t("adminPricing.saved"));
    } catch (err: any) {
      setError(err?.message || t("adminPricing.errors.save"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-12 text-center text-sm text-gray-500">{t("common.loading")}</div>;
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t("adminPricing.title")}</h1>
        <p className="mt-1 text-sm text-gray-500">{t("adminPricing.subtitle")}</p>
      </div>

      {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>}
      {message && <div className="mb-5 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">{message}</div>}

      <form onSubmit={submit} className="rounded-2xl border border-gray-200 bg-white p-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <PriceField label={t("adminPricing.baseTaxi")} value={form.standardTaxiBasePrice} onChange={(value) => setForm({ ...form, standardTaxiBasePrice: value })} />
          <PriceField label={t("adminPricing.perKm")} value={form.pricePerKm} onChange={(value) => setForm({ ...form, pricePerKm: value })} />
          <PriceField label={t("adminPricing.minimumFare")} value={form.minimumFare} onChange={(value) => setForm({ ...form, minimumFare: value })} />
          <PriceField label={t("adminPricing.airport")} value={form.airportTransferPrice} onChange={(value) => setForm({ ...form, airportTransferPrice: value })} />
          <PriceField label={t("adminPricing.tourism")} value={form.tourismTransferPrice} onChange={(value) => setForm({ ...form, tourismTransferPrice: value })} />
          <PriceField label={t("adminPricing.weeklyRental")} value={form.weeklyVehicleRentalPrice} onChange={(value) => setForm({ ...form, weeklyVehicleRentalPrice: value })} />
          <PriceField label={t("adminPricing.dailyRental")} value={form.dailyVehicleRentalPrice} onChange={(value) => setForm({ ...form, dailyVehicleRentalPrice: value })} />
        </div>
        <button disabled={saving} className="mt-6 rounded-xl bg-green-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
          {saving ? t("common.loading") : t("common.save")}
        </button>
      </form>
    </div>
  );
}

function PriceField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-gray-600">{label}</span>
      <input
        type="number"
        min="0"
        step="0.01"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-xl border border-gray-200 px-3 text-sm"
      />
    </label>
  );
}
