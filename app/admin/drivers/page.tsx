"use client";
import { useEffect, useState } from "react";

export default function AdminDriversPage() {
  const [drivers, setDrivers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatingDriverId, setUpdatingDriverId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    fullName: "",
    phone: "",
    email: "",
    licenseNumber: "",
    vehicleType: "",
    vehiclePlate: "",
    password: "",
  });

  useEffect(() => {
    fetchDrivers();
  }, []);

  const fetchDrivers = async () => {
    try {
      const res = await fetch("/api/admin/drivers", { cache: "no-store" });
      const data = await res.json();
      setDrivers(data.drivers || []);
    } catch (err) {
      console.error("Failed to fetch drivers:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const res = await fetch("/api/admin/drivers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        setFormData({
          fullName: "",
          phone: "",
          email: "",
          licenseNumber: "",
          vehicleType: "",
          vehiclePlate: "",
          password: "",
        });

        setShowForm(false);
        await fetchDrivers();
      }
    } catch (err) {
      console.error("Failed to create driver:", err);
    } finally {
      setSaving(false);
    }
  };

  const updateDriverOperationalStatus = async (
    driverId: string,
    payload: { isOnTrip?: boolean; isOnline?: boolean }
  ) => {
    setUpdatingDriverId(driverId);

    try {
      const res = await fetch("/api/admin/drivers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driverId,
          ...payload,
        }),
      });

      const text = await res.text();
const data = text ? JSON.parse(text) : {};

      if (!res.ok) {
        alert(data.error || "Failed to update driver");
        return;
      }

      await fetchDrivers();
    } catch (err) {
      console.error("Failed to update driver:", err);
      alert("Failed to update driver");
    } finally {
      setUpdatingDriverId(null);
    }
  };

  const releaseDriver = (driverId: string) => {
    updateDriverOperationalStatus(driverId, { isOnTrip: false });
  };

  const toggleOnline = (driverId: string, currentOnline: boolean) => {
    updateDriverOperationalStatus(driverId, { isOnline: !currentOnline });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Loading drivers...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">🚗 Drivers</h1>
          <p className="text-sm text-gray-500">{drivers.length} drivers</p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={fetchDrivers}
            className="px-4 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-semibold rounded-xl transition-colors"
          >
            🔄 Refresh
          </button>

          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 bg-green-700 hover:bg-green-800 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            {showForm ? "✕ Cancel" : "➕ Add Driver"}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
          <h3 className="font-bold text-gray-900 mb-4">Add New Driver</h3>

          <form
            onSubmit={handleCreateDriver}
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Full Name *
              </label>
              <input
                type="text"
                value={formData.fullName}
                onChange={(e) =>
                  setFormData({ ...formData, fullName: e.target.value })
                }
                required
                className="w-full h-10 px-3 border border-gray-200 rounded-xl text-sm"
                placeholder="Ján Novák"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Phone *
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) =>
                  setFormData({ ...formData, phone: e.target.value })
                }
                required
                className="w-full h-10 px-3 border border-gray-200 rounded-xl text-sm"
                placeholder="+421912345678"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Temporary Password *
              </label>
              <input
                type="text"
                value={formData.password}
                onChange={(e) =>
                  setFormData({ ...formData, password: e.target.value })
                }
                required
                className="w-full h-10 px-3 border border-gray-200 rounded-xl text-sm"
                placeholder="securepassword123"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Email
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                className="w-full h-10 px-3 border border-gray-200 rounded-xl text-sm"
                placeholder="jan@drivo.sk"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                License Number
              </label>
              <input
                type="text"
                value={formData.licenseNumber}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    licenseNumber: e.target.value,
                  })
                }
                className="w-full h-10 px-3 border border-gray-200 rounded-xl text-sm"
                placeholder="BA-123-XX"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Vehicle Type
              </label>
              <select
                value={formData.vehicleType}
                onChange={(e) =>
                  setFormData({ ...formData, vehicleType: e.target.value })
                }
                className="w-full h-10 px-3 border border-gray-200 rounded-xl text-sm"
              >
                <option value="">Select type</option>
                <option value="STANDARD">Standard Taxi</option>
                <option value="7_SEATER">7-Seater</option>
                <option value="WAV">WAV (Wheelchair)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Vehicle Plate
              </label>
              <input
                type="text"
                value={formData.vehiclePlate}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    vehiclePlate: e.target.value,
                  })
                }
                className="w-full h-10 px-3 border border-gray-200 rounded-xl text-sm"
                placeholder="BA-123-XX"
              />
            </div>

            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2.5 bg-green-700 hover:bg-green-800 text-white font-semibold rounded-xl text-sm transition-colors disabled:opacity-50"
              >
                {saving ? "Saving..." : "✅ Create Driver"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {drivers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="text-left p-3 font-semibold text-gray-600">
                    Name
                  </th>
                  <th className="text-left p-3 font-semibold text-gray-600">
                    Phone
                  </th>
                  <th className="text-left p-3 font-semibold text-gray-600">
                    Vehicle
                  </th>
                  <th className="text-left p-3 font-semibold text-gray-600">
                    Account
                  </th>
                  <th className="text-left p-3 font-semibold text-gray-600">
                    Online
                  </th>
                  <th className="text-left p-3 font-semibold text-gray-600">
                    Trip State
                  </th>
                  <th className="text-left p-3 font-semibold text-gray-600">
                    Bookings
                  </th>
                  <th className="text-left p-3 font-semibold text-gray-600">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody>
                {drivers.map((driver: any) => (
                  <tr
                    key={driver.id}
                    className="border-b border-gray-50 hover:bg-gray-50"
                  >
                    <td className="p-3">
                      <div className="font-medium">{driver.fullName}</div>
                      {driver.email && (
                        <div className="text-xs text-gray-400">
                          {driver.email}
                        </div>
                      )}
                    </td>

                    <td className="p-3 text-gray-600">{driver.phone}</td>

                    <td className="p-3 text-gray-600">
                      {driver.vehicleType && (
                        <span className="text-xs bg-gray-100 px-2 py-1 rounded-full">
                          {driver.vehicleType}
                        </span>
                      )}

                      {driver.vehiclePlate && (
                        <span className="text-xs text-gray-400 ml-2">
                          {driver.vehiclePlate}
                        </span>
                      )}
                    </td>

                    <td className="p-3">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          driver.status === "ACTIVE"
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {driver.status}
                      </span>
                    </td>

                    <td className="p-3">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          driver.isOnline
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {driver.isOnline ? "🟢 Online" : "⚫ Offline"}
                      </span>
                    </td>

                    <td className="p-3">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          driver.isOnTrip
                            ? "bg-amber-100 text-amber-700"
                            : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {driver.isOnTrip ? "🚕 On Trip" : "✅ Available"}
                      </span>
                    </td>

                    <td className="p-3 text-gray-600">
                      {driver.bookings?.length || 0}
                    </td>

                    <td className="p-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() =>
                            toggleOnline(driver.id, Boolean(driver.isOnline))
                          }
                          disabled={updatingDriverId === driver.id}
                          className="px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          {driver.isOnline ? "Set Offline" : "Set Online"}
                        </button>

                        {driver.isOnTrip && (
                          <button
                            onClick={() => releaseDriver(driver.id)}
                            disabled={updatingDriverId === driver.id}
                            className="px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                          >
                            Release
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center">
            <div className="text-4xl mb-3">🚗</div>
            <p className="text-gray-500">No drivers yet.</p>
            <p className="text-sm text-gray-400 mt-1">
              Click &quot;Add Driver&quot; to create the first one.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}