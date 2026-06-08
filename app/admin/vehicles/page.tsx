"use client";

import { useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/lib/i18n/LanguageContext";

interface Vehicle {
  id: string;
  plateNumber: string;
  type: string;
  brand: string | null;
  model: string | null;
  year: number | null;
  maxPassengers: number;
  wheelchairAccessible: boolean;
  isRental: boolean;
  rentalStatus: string;
  weeklyRate: number | null;
  status: string;
  currentMileageKm: number | null;
  serviceNotes: string | null;
  nextServiceDate: string | null;
  stkValidUntil: string | null;
  weeklyRentalPrice: number | null;
  dailyRentalPrice: number | null;
  baseRidePrice: number | null;
  drivers?: { id: string; fullName: string }[];
}

const VEHICLE_TYPES = ["STANDARD", "MINIVAN", "WAV", "DELIVERY", "PREMIUM"];
const STATUSES = ["ACTIVE", "INACTIVE", "MAINTENANCE"];
const RENTAL_STATUSES = ["AVAILABLE", "RENTED", "RESERVED"];

const emptyForm = {
  plateNumber: "",
  type: "STANDARD",
  brand: "",
  model: "",
  year: "",
  maxPassengers: "4",
  wheelchairAccessible: false,
  isRental: false,
  rentalStatus: "AVAILABLE",
  status: "ACTIVE",
  currentMileageKm: "",
  serviceNotes: "",
  nextServiceDate: "",
  stkValidUntil: "",
  weeklyRentalPrice: "",
  dailyRentalPrice: "",
  baseRidePrice: "",
};

const inputClass =
  "h-10 w-full rounded-xl border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-300";

function toDateInput(value: string | null) {
  if (!value) return "";
  return value.slice(0, 10);
}

function money(value: number | null | undefined) {
  return value == null ? "-" : `EUR ${Number(value).toFixed(2)}`;
}

export default function AdminVehiclesPage() {
  const { t } = useLanguage();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const fetchVehicles = async () => {
    setError("");
    try {
      const res = await fetch("/api/admin/vehicles", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("adminVehicles.errors.fetch"));
      setVehicles(data.vehicles || []);
    } catch (err: any) {
      setError(err?.message || t("adminVehicles.errors.fetch"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVehicles();
  }, []);

  const stats = useMemo(
    () => ({
      total: vehicles.length,
      active: vehicles.filter((vehicle) => vehicle.status === "ACTIVE").length,
      rental: vehicles.filter((vehicle) => vehicle.isRental).length,
      maintenance: vehicles.filter((vehicle) => vehicle.status === "MAINTENANCE").length,
    }),
    [vehicles]
  );

  const filtered = vehicles.filter((vehicle) => {
    const query = search.toLowerCase();
    const matchesSearch =
      !query ||
      vehicle.plateNumber.toLowerCase().includes(query) ||
      `${vehicle.brand || ""} ${vehicle.model || ""}`.toLowerCase().includes(query);
    return (filter === "ALL" || vehicle.type === filter) && matchesSearch;
  });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setError("");
    setShowForm(true);
  };

  const openEdit = (vehicle: Vehicle) => {
    setEditing(vehicle);
    setForm({
      plateNumber: vehicle.plateNumber,
      type: vehicle.type,
      brand: vehicle.brand || "",
      model: vehicle.model || "",
      year: vehicle.year ? String(vehicle.year) : "",
      maxPassengers: String(vehicle.maxPassengers || 4),
      wheelchairAccessible: vehicle.wheelchairAccessible,
      isRental: vehicle.isRental,
      rentalStatus: vehicle.rentalStatus || "AVAILABLE",
      status: vehicle.status || "ACTIVE",
      currentMileageKm: vehicle.currentMileageKm != null ? String(vehicle.currentMileageKm) : "",
      serviceNotes: vehicle.serviceNotes || "",
      nextServiceDate: toDateInput(vehicle.nextServiceDate),
      stkValidUntil: toDateInput(vehicle.stkValidUntil),
      weeklyRentalPrice:
        vehicle.weeklyRentalPrice != null
          ? String(vehicle.weeklyRentalPrice)
          : vehicle.weeklyRate != null
          ? String(vehicle.weeklyRate)
          : "",
      dailyRentalPrice: vehicle.dailyRentalPrice != null ? String(vehicle.dailyRentalPrice) : "",
      baseRidePrice: vehicle.baseRidePrice != null ? String(vehicle.baseRidePrice) : "",
    });
    setError("");
    setShowForm(true);
  };

  const submitVehicle = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    if (!form.plateNumber.trim() || !form.type || !form.model.trim()) {
      setError(t("adminVehicles.errors.required"));
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        year: form.year ? Number(form.year) : null,
        maxPassengers: Number(form.maxPassengers || 4),
        currentMileageKm: form.currentMileageKm ? Number(form.currentMileageKm) : null,
        weeklyRentalPrice: form.weeklyRentalPrice ? Number(form.weeklyRentalPrice) : null,
        weeklyRate: form.weeklyRentalPrice ? Number(form.weeklyRentalPrice) : null,
        dailyRentalPrice: form.dailyRentalPrice ? Number(form.dailyRentalPrice) : null,
        baseRidePrice: form.baseRidePrice ? Number(form.baseRidePrice) : null,
      };

      const res = await fetch(
        editing ? `/api/admin/vehicles/${editing.id}` : "/api/admin/vehicles",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("adminVehicles.errors.save"));

      setShowForm(false);
      setEditing(null);
      await fetchVehicles();
    } catch (err: any) {
      setError(err?.message || t("adminVehicles.errors.save"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("adminVehicles.title")}</h1>
          <p className="mt-1 text-sm text-gray-500">{t("adminVehicles.subtitle")}</p>
        </div>
        <button
          onClick={openCreate}
          className="rounded-xl bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800"
        >
          {t("adminVehicles.add")}
        </button>
      </div>

      {error && (
        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <OverviewCard label={t("adminVehicles.totalFleet")} value={stats.total} />
        <OverviewCard label={t("adminVehicles.active")} value={stats.active} />
        <OverviewCard label={t("adminVehicles.rental")} value={stats.rental} />
        <OverviewCard label={t("adminVehicles.maintenance")} value={stats.maintenance} />
      </div>

      <div className="mb-5 flex flex-col gap-3 md:flex-row">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("adminVehicles.search")}
          className="h-11 flex-1 rounded-xl border border-gray-200 px-4 text-sm"
        />
        <select
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          className="h-11 rounded-xl border border-gray-200 px-3 text-sm"
        >
          <option value="ALL">{t("adminVehicles.allTypes")}</option>
          {VEHICLE_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-6 overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 className="font-bold text-gray-900">{t("adminVehicles.fleetOverview")}</h2>
        </div>
        {loading ? (
          <div className="p-10 text-center text-sm text-gray-500">{t("common.loading")}</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-500">{t("adminVehicles.empty")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3">{t("adminVehicles.plate")}</th>
                  <th className="px-4 py-3">{t("adminVehicles.vehicle")}</th>
                  <th className="px-4 py-3">{t("adminVehicles.mileage")}</th>
                  <th className="px-4 py-3">{t("adminVehicles.service")}</th>
                  <th className="px-4 py-3">{t("adminVehicles.pricing")}</th>
                  <th className="px-4 py-3">{t("adminVehicles.assigned")}</th>
                  <th className="px-4 py-3">{t("adminVehicles.status")}</th>
                  <th className="px-4 py-3">{t("adminVehicles.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((vehicle) => (
                  <tr key={vehicle.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono font-bold">{vehicle.plateNumber}</td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-900">
                        {vehicle.brand} {vehicle.model}
                      </div>
                      <div className="text-xs text-gray-500">
                        {vehicle.type} · {vehicle.year || "-"} · {vehicle.maxPassengers} seats
                      </div>
                    </td>
                    <td className="px-4 py-3">{vehicle.currentMileageKm ?? "-"} km</td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      <div>{vehicle.serviceNotes || "-"}</div>
                      <div>{t("adminVehicles.nextService")}: {toDateInput(vehicle.nextServiceDate) || "-"}</div>
                      <div>{t("adminVehicles.stk")}: {toDateInput(vehicle.stkValidUntil) || "-"}</div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div>{t("adminVehicles.weekly")}: {money(vehicle.weeklyRentalPrice ?? vehicle.weeklyRate)}</div>
                      <div>{t("adminVehicles.daily")}: {money(vehicle.dailyRentalPrice)}</div>
                      <div>{t("adminVehicles.baseRide")}: {money(vehicle.baseRidePrice)}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {vehicle.drivers?.length
                        ? vehicle.drivers.map((driver) => driver.fullName).join(", ")
                        : "-"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">
                        {vehicle.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => openEdit(vehicle)}
                        className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                      >
                        {t("common.edit", "Edit")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">
                {editing ? t("adminVehicles.editTitle") : t("adminVehicles.addTitle")}
              </h2>
              <button onClick={() => setShowForm(false)} className="text-xl text-gray-400">
                x
              </button>
            </div>

            <form onSubmit={submitVehicle} className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label={t("adminVehicles.plate")} required>
                <input required value={form.plateNumber} onChange={(e) => setForm({ ...form, plateNumber: e.target.value })} className={inputClass} />
              </Field>
              <Field label={t("adminVehicles.type")} required>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className={inputClass}>
                  {VEHICLE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </Field>
              <Field label={t("adminVehicles.brand")}>
                <input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} className={inputClass} />
              </Field>
              <Field label={t("adminVehicles.model")} required>
                <input required value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} className={inputClass} />
              </Field>
              <Field label={t("adminVehicles.year")}>
                <input type="number" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} className={inputClass} />
              </Field>
              <Field label={t("adminVehicles.passengers")}>
                <input type="number" min="1" value={form.maxPassengers} onChange={(e) => setForm({ ...form, maxPassengers: e.target.value })} className={inputClass} />
              </Field>
              <Field label={t("adminVehicles.status")}>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={inputClass}>
                  {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
              </Field>
              <Field label={t("adminVehicles.mileage")}>
                <input type="number" min="0" value={form.currentMileageKm} onChange={(e) => setForm({ ...form, currentMileageKm: e.target.value })} className={inputClass} />
              </Field>
              <Field label={t("adminVehicles.nextService")}>
                <input type="date" value={form.nextServiceDate} onChange={(e) => setForm({ ...form, nextServiceDate: e.target.value })} className={inputClass} />
              </Field>
              <Field label={t("adminVehicles.stk")}>
                <input type="date" value={form.stkValidUntil} onChange={(e) => setForm({ ...form, stkValidUntil: e.target.value })} className={inputClass} />
              </Field>
              <Field label={t("adminVehicles.weekly")}>
                <input type="number" min="0" step="0.01" value={form.weeklyRentalPrice} onChange={(e) => setForm({ ...form, weeklyRentalPrice: e.target.value })} className={inputClass} />
              </Field>
              <Field label={t("adminVehicles.daily")}>
                <input type="number" min="0" step="0.01" value={form.dailyRentalPrice} onChange={(e) => setForm({ ...form, dailyRentalPrice: e.target.value })} className={inputClass} />
              </Field>
              <Field label={t("adminVehicles.baseRide")}>
                <input type="number" min="0" step="0.01" value={form.baseRidePrice} onChange={(e) => setForm({ ...form, baseRidePrice: e.target.value })} className={inputClass} />
              </Field>
              <Field label={t("adminVehicles.rentalStatus")}>
                <select value={form.rentalStatus} onChange={(e) => setForm({ ...form, rentalStatus: e.target.value })} className={inputClass}>
                  {RENTAL_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
              </Field>
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-semibold text-gray-600">{t("adminVehicles.service")}</label>
                <textarea value={form.serviceNotes} onChange={(e) => setForm({ ...form, serviceNotes: e.target.value })} className="min-h-24 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" />
              </div>
              <div className="flex flex-wrap gap-5 md:col-span-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <input type="checkbox" checked={form.wheelchairAccessible} onChange={(e) => setForm({ ...form, wheelchairAccessible: e.target.checked })} />
                  {t("adminVehicles.wav")}
                </label>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <input type="checkbox" checked={form.isRental} onChange={(e) => setForm({ ...form, isRental: e.target.checked })} />
                  {t("adminVehicles.forRental")}
                </label>
              </div>
              <div className="flex gap-3 md:col-span-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-600">
                  {t("common.cancel")}
                </button>
                <button disabled={saving} type="submit" className="flex-1 rounded-xl bg-green-700 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                  {saving ? t("common.loading") : t("common.save")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function OverviewCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="mt-1 text-xs font-semibold text-gray-500">{label}</div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-gray-600">
        {label} {required ? "*" : ""}
      </span>
      {children}
    </label>
  );
}
