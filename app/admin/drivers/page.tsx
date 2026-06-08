"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/lib/i18n/LanguageContext";

interface Vehicle {
  id: string;
  plateNumber: string;
  type: string;
  brand: string | null;
  model: string | null;
  maxPassengers: number;
}

interface Driver {
  id: string;
  fullName: string;
  phone: string;
  email?: string | null;
  licenseNumber?: string | null;
  vehicleId?: string | null;
  vehicleType?: string | null;
  vehiclePlate?: string | null;
  vehicle?: Vehicle | null;
  status: string;
  isOnline: boolean;
  isOnTrip: boolean;
  bookings?: any[];
}

const emptyForm = {
  fullName: "",
  phone: "",
  email: "",
  licenseNumber: "",
  vehicleId: "",
  password: "",
};

export default function AdminDriversPage() {
  const { t } = useLanguage();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Driver | null>(null);
  const [updatingDriverId, setUpdatingDriverId] = useState<string | null>(null);
  const [formData, setFormData] = useState(emptyForm);

  useEffect(() => {
    Promise.all([fetchDrivers(), fetchVehicles()]).finally(() => setLoading(false));
  }, []);

  const safeJson = async (res: Response) => {
    const text = await res.text();
    return text ? JSON.parse(text) : {};
  };

  const fetchDrivers = async () => {
    setError("");
    try {
      const res = await fetch("/api/admin/drivers", { cache: "no-store" });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || t("adminDrivers.errors.fetch"));
      setDrivers(data.drivers || []);
    } catch (err: any) {
      setError(err?.message || t("adminDrivers.errors.fetch"));
    }
  };

  const fetchVehicles = async () => {
    try {
      const res = await fetch("/api/admin/vehicles", { cache: "no-store" });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || t("adminDrivers.errors.vehicles"));
      setVehicles(data.vehicles || []);
    } catch (err: any) {
      setError(err?.message || t("adminDrivers.errors.vehicles"));
    }
  };

  const openCreate = () => {
    setEditing(null);
    setFormData(emptyForm);
    setError("");
    setShowForm(true);
  };

  const openEdit = (driver: Driver) => {
    setEditing(driver);
    setFormData({
      fullName: driver.fullName,
      phone: driver.phone,
      email: driver.email || "",
      licenseNumber: driver.licenseNumber || "",
      vehicleId: driver.vehicleId || driver.vehicle?.id || "",
      password: "",
    });
    setError("");
    setShowForm(true);
  };

  const submitDriver = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    if (!formData.fullName.trim() || !formData.phone.trim()) {
      setError(t("adminDrivers.errors.required"));
      return;
    }

    if (!editing && !formData.password.trim()) {
      setError(t("adminDrivers.errors.password"));
      return;
    }

    setSaving(true);
    try {
      const payload: any = {
        ...formData,
        vehicleId: formData.vehicleId || null,
      };
      if (editing) {
        payload.driverId = editing.id;
        if (!payload.password) delete payload.password;
      }

      const res = await fetch("/api/admin/drivers", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || t("adminDrivers.errors.save"));

      setShowForm(false);
      setEditing(null);
      setFormData(emptyForm);
      await fetchDrivers();
    } catch (err: any) {
      setError(err?.message || t("adminDrivers.errors.save"));
    } finally {
      setSaving(false);
    }
  };

  const updateDriverOperationalStatus = async (
    driverId: string,
    payload: { isOnTrip?: boolean; isOnline?: boolean }
  ) => {
    setUpdatingDriverId(driverId);
    setError("");

    try {
      const res = await fetch("/api/admin/drivers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverId, ...payload }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || t("adminDrivers.errors.save"));
      await fetchDrivers();
    } catch (err: any) {
      setError(err?.message || t("adminDrivers.errors.save"));
    } finally {
      setUpdatingDriverId(null);
    }
  };

  if (loading) {
    return <div className="p-12 text-center text-sm text-gray-500">{t("common.loading")}</div>;
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("adminDrivers.title")}</h1>
          <p className="text-sm text-gray-500">{drivers.length} {t("adminDrivers.count")}</p>
        </div>
        <div className="flex gap-3">
          <button onClick={fetchDrivers} className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
            {t("common.refresh", "Refresh")}
          </button>
          <button onClick={openCreate} className="rounded-xl bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800">
            {t("adminDrivers.add")}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      {showForm && (
        <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-6">
          <h3 className="mb-4 font-bold text-gray-900">
            {editing ? t("adminDrivers.editTitle") : t("adminDrivers.addTitle")}
          </h3>
          <form onSubmit={submitDriver} className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <TextField label={t("common.name")} value={formData.fullName} required onChange={(value) => setFormData({ ...formData, fullName: value })} />
            <TextField label={t("common.phone")} value={formData.phone} required onChange={(value) => setFormData({ ...formData, phone: value })} />
            <TextField label={t("common.email")} value={formData.email} type="email" onChange={(value) => setFormData({ ...formData, email: value })} />
            <TextField label={t("adminDrivers.license")} value={formData.licenseNumber} onChange={(value) => setFormData({ ...formData, licenseNumber: value })} />
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-gray-600">{t("adminDrivers.vehicle")}</span>
              <select
                value={formData.vehicleId}
                onChange={(event) => setFormData({ ...formData, vehicleId: event.target.value })}
                className="h-10 w-full rounded-xl border border-gray-200 px-3 text-sm"
              >
                <option value="">{t("adminDrivers.noVehicle")}</option>
                {vehicles.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.plateNumber} - {vehicle.brand} {vehicle.model} ({vehicle.type})
                  </option>
                ))}
              </select>
            </label>
            <TextField
              label={editing ? t("adminDrivers.newPassword") : t("common.password")}
              value={formData.password}
              required={!editing}
              onChange={(value) => setFormData({ ...formData, password: value })}
            />
            <div className="flex gap-3 md:col-span-2">
              <button type="button" onClick={() => setShowForm(false)} className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-600">
                {t("common.cancel")}
              </button>
              <button disabled={saving} type="submit" className="rounded-xl bg-green-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                {saving ? t("common.loading") : t("common.save")}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        {drivers.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-500">{t("adminDrivers.empty")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="p-3">{t("common.name")}</th>
                  <th className="p-3">{t("common.phone")}</th>
                  <th className="p-3">{t("adminDrivers.vehicle")}</th>
                  <th className="p-3">{t("adminDrivers.account")}</th>
                  <th className="p-3">{t("adminDrivers.online")}</th>
                  <th className="p-3">{t("adminDrivers.tripState")}</th>
                  <th className="p-3">{t("adminDrivers.bookings")}</th>
                  <th className="p-3">{t("adminDrivers.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {drivers.map((driver) => (
                  <tr key={driver.id} className="hover:bg-gray-50">
                    <td className="p-3">
                      <div className="font-semibold text-gray-900">{driver.fullName}</div>
                      {driver.email && <div className="text-xs text-gray-500">{driver.email}</div>}
                    </td>
                    <td className="p-3 text-gray-600">{driver.phone}</td>
                    <td className="p-3 text-xs text-gray-600">
                      {driver.vehicle ? (
                        <div>
                          <div className="font-semibold text-gray-900">{driver.vehicle.plateNumber}</div>
                          <div>{driver.vehicle.brand} {driver.vehicle.model} · {driver.vehicle.type}</div>
                        </div>
                      ) : driver.vehiclePlate ? (
                        <div>{driver.vehiclePlate} · {driver.vehicleType}</div>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="p-3"><Badge value={driver.status} /></td>
                    <td className="p-3"><Badge value={driver.isOnline ? t("adminDrivers.online") : t("adminDrivers.offline")} /></td>
                    <td className="p-3"><Badge value={driver.isOnTrip ? t("adminDrivers.onTrip") : t("adminDrivers.available")} /></td>
                    <td className="p-3 text-gray-600">{driver.bookings?.length || 0}</td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => openEdit(driver)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                          {t("common.edit", "Edit")}
                        </button>
                        <button
                          onClick={() => updateDriverOperationalStatus(driver.id, { isOnline: !driver.isOnline })}
                          disabled={updatingDriverId === driver.id}
                          className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          {driver.isOnline ? t("adminDrivers.setOffline") : t("adminDrivers.setOnline")}
                        </button>
                        {driver.isOnTrip && (
                          <button
                            onClick={() => updateDriverOperationalStatus(driver.id, { isOnTrip: false })}
                            disabled={updatingDriverId === driver.id}
                            className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                          >
                            {t("adminDrivers.release")}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-gray-600">{label} {required ? "*" : ""}</span>
      <input
        type={type}
        value={value}
        required={required}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-xl border border-gray-200 px-3 text-sm"
      />
    </label>
  );
}

function Badge({ value }: { value: string }) {
  return (
    <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">
      {value}
    </span>
  );
}
