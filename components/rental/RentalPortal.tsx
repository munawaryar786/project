"use client";

import { useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/lib/i18n/LanguageContext";

type RentalVehicle = {
  id: string;
  type: string;
  brand?: string | null;
  model?: string | null;
  year?: number | null;
  maxPassengers?: number | null;
  weeklyRate?: number | null;
  weeklyRentalPrice?: number | null;
  dailyRentalPrice?: number | null;
};

const fallbackVehicles: RentalVehicle[] = [
  {
    id: "standard-weekly",
    type: "Standard",
    brand: "Drivo",
    model: "Taxi-ready vehicle",
    maxPassengers: 4,
    weeklyRentalPrice: 120,
  },
  {
    id: "delivery-weekly",
    type: "Delivery",
    brand: "Drivo",
    model: "City delivery vehicle",
    maxPassengers: 2,
    weeklyRentalPrice: 120,
  },
];

export default function RentalPortal() {
  const { t } = useLanguage();
  const [vehicles, setVehicles] = useState<RentalVehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [mode, setMode] = useState<"signin" | "register">("register");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    fullName: "",
    phone: "",
    email: "",
    licenseNumber: "",
    workPlatform: "Bolt",
    rentalStartDate: "",
    rentalDuration: "1 week",
    weeklyRentalPlan: "Weekly standard plan",
    notes: "",
  });

  useEffect(() => {
    let mounted = true;

    fetch("/api/rental-inquiry", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (!mounted) return;
        const loaded = Array.isArray(data?.vehicles) && data.vehicles.length > 0
          ? data.vehicles
          : fallbackVehicles;
        setVehicles(loaded);
        setSelectedVehicleId(loaded[0]?.id || "");
      })
      .catch(() => {
        if (!mounted) return;
        setVehicles(fallbackVehicles);
        setSelectedVehicleId(fallbackVehicles[0].id);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const selectedVehicle = useMemo(
    () => vehicles.find((vehicle) => vehicle.id === selectedVehicleId) || vehicles[0],
    [selectedVehicleId, vehicles]
  );

  const vehicleLabel = selectedVehicle
    ? [selectedVehicle.brand, selectedVehicle.model, selectedVehicle.type].filter(Boolean).join(" ")
    : "";

  const weeklyPrice = selectedVehicle?.weeklyRentalPrice ?? selectedVehicle?.weeklyRate;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitted(false);

    if (!selectedVehicle) {
      setError(t("rental.validationVehicle", "Please select a vehicle."));
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch("/api/rental-inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.fullName,
          phone: form.phone,
          email: form.email,
          licenseNumber: form.licenseNumber,
          workPlatform: form.workPlatform,
          vehicleType: selectedVehicle.type,
          vehicleSelected: vehicleLabel,
          rentalStartDate: form.rentalStartDate,
          rentalDuration: form.rentalDuration,
          weeklyRentalPlan: form.weeklyRentalPlan,
          notes: form.notes,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || t("rental.submitError", "Failed to submit rental request."));
      }

      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("rental.submitError", "Failed to submit rental request."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="min-h-screen bg-drivo-bg-soft pt-28 pb-16">
      <div className="container-main">
        <div className="grid gap-6 lg:grid-cols-[360px,1fr]">
          <aside className="rounded-[28px] border border-drivo-border-light bg-white p-5 shadow-soft lg:sticky lg:top-28 lg:self-start">
            <div className="mb-5 flex rounded-2xl bg-drivo-bg-soft p-1">
              {(["register", "signin"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setMode(option)}
                  className={`flex-1 rounded-xl px-3 py-2 text-sm font-bold transition ${
                    mode === option
                      ? "bg-white text-drivo-green shadow-sm"
                      : "text-drivo-text-secondary hover:text-drivo-text"
                  }`}
                >
                  {option === "register" ? t("rental.register", "Register") : t("rental.signIn", "Sign in")}
                </button>
              ))}
            </div>

            <h1 className="text-[28px] font-extrabold leading-tight text-drivo-navy">
              {t("rental.title", "Rent a Vehicle")}
            </h1>
            <p className="mt-3 text-[14px] leading-6 text-drivo-text-secondary">
              {t("rental.subtitle", "Weekly rental for Drivo, taxi, ride-hailing and delivery drivers.")}
            </p>

            <div className="mt-6 rounded-2xl bg-drivo-navy p-4 text-white">
              <div className="text-[11px] font-bold uppercase tracking-wide text-white/60">
                {t("rental.weeklyModel", "Weekly rental model")}
              </div>
              <div className="mt-1 text-2xl font-black">
                {weeklyPrice ? `EUR ${Number(weeklyPrice).toFixed(0)}` : t("rental.quote", "Quote")}
              </div>
              <div className="text-[12px] text-white/60">
                {t("rental.perWeek", "per week")}
              </div>
            </div>
          </aside>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="rounded-[28px] border border-drivo-border-light bg-white p-5 shadow-soft md:p-6">
              <div className="mb-5">
                <h2 className="text-[18px] font-extrabold text-drivo-text">
                  {t("rental.vehicleSelection", "Vehicle Selection")}
                </h2>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {vehicles.map((vehicle) => {
                  const price = vehicle.weeklyRentalPrice ?? vehicle.weeklyRate;
                  const label = [vehicle.brand, vehicle.model, vehicle.type].filter(Boolean).join(" ");
                  return (
                    <button
                      key={vehicle.id}
                      type="button"
                      onClick={() => setSelectedVehicleId(vehicle.id)}
                      className={`rounded-2xl border p-4 text-left transition ${
                        selectedVehicleId === vehicle.id
                          ? "border-drivo-green bg-drivo-green-light"
                          : "border-drivo-border bg-white hover:border-drivo-green/40"
                      }`}
                    >
                      <div className="font-bold text-drivo-text">{label}</div>
                      <div className="mt-1 text-[12px] text-drivo-text-secondary">
                        {vehicle.year ? `${vehicle.year} · ` : ""}
                        {vehicle.maxPassengers || 4} {t("rental.seats", "seats")}
                      </div>
                      <div className="mt-3 text-[13px] font-bold text-drivo-green">
                        {price ? `EUR ${Number(price).toFixed(0)} / ${t("rental.week", "week")}` : t("rental.quote", "Quote")}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-[28px] border border-drivo-border-light bg-white p-5 shadow-soft md:p-6">
                <h2 className="mb-5 text-[18px] font-extrabold text-drivo-text">
                  {t("rental.driverInfo", "Driver Info")}
                </h2>
                <div className="space-y-4">
                  <input className="input" required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} placeholder={`${t("rental.fullName", "Full Name")} *`} />
                  <input className="input" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder={`${t("rental.phone", "Phone")} *`} />
                  <input className="input" required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder={`${t("rental.email", "Email")} *`} />
                  <input className="input" required value={form.licenseNumber} onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })} placeholder={`${t("rental.licenseNumber", "License Number")} *`} />
                  <select className="input" value={form.workPlatform} onChange={(e) => setForm({ ...form, workPlatform: e.target.value })}>
                    {["Bolt", "Wolt", "Foodora", "Taxi", "Other"].map((platform) => (
                      <option key={platform} value={platform}>{platform}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="rounded-[28px] border border-drivo-border-light bg-white p-5 shadow-soft md:p-6">
                <h2 className="mb-5 text-[18px] font-extrabold text-drivo-text">
                  {t("rental.rentalInfo", "Rental Info")}
                </h2>
                <div className="space-y-4">
                  <input className="input" value={vehicleLabel} readOnly />
                  <input className="input" required type="date" value={form.rentalStartDate} onChange={(e) => setForm({ ...form, rentalStartDate: e.target.value })} />
                  <select className="input" value={form.rentalDuration} onChange={(e) => setForm({ ...form, rentalDuration: e.target.value })}>
                    {["1 week", "2 weeks", "1 month", "Custom"].map((duration) => (
                      <option key={duration} value={duration}>{t(`rental.duration.${duration}`, duration)}</option>
                    ))}
                  </select>
                  <select className="input" value={form.weeklyRentalPlan} onChange={(e) => setForm({ ...form, weeklyRentalPlan: e.target.value })}>
                    <option value="Weekly standard plan">{t("rental.weeklyStandard", "Weekly standard plan")}</option>
                    <option value="Weekly long-term plan">{t("rental.weeklyLongTerm", "Weekly long-term plan")}</option>
                  </select>
                  <textarea className="input min-h-24 resize-none" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder={t("rental.notes", "Notes")} />
                </div>
              </div>
            </div>

            {error && (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
                {error}
              </div>
            )}

            {submitted && (
              <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm font-semibold text-green-700">
                {t("rental.submitted", "Rental request submitted. Drivo will contact you shortly.")}
              </div>
            )}

            <button type="submit" disabled={submitting} className="btn-primary w-full py-4 text-[16px] disabled:opacity-60">
              {submitting ? t("rental.submitting", "Submitting...") : t("rental.submit", "Submit rental request")}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
