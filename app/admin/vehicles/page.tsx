"use client";
import { useState, useEffect } from "react";

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
  createdAt: string;
}

const VEHICLE_TYPES = ["STANDARD", "MINIVAN", "WAV", "DELIVERY", "PREMIUM"];
const STATUSES = ["ACTIVE", "INACTIVE", "MAINTENANCE"];
const RENTAL_STATUSES = ["AVAILABLE", "RENTED", "RESERVED"];

const typeLabel: Record<string, string> = {
  STANDARD: "🚕 Standard Taxi",
  MINIVAN: "🚐 7-Seater",
  WAV: "♿ WAV Vehicle",
  DELIVERY: "📦 Delivery",
  PREMIUM: "⭐ Premium",
};

const statusColor: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-700",
  INACTIVE: "bg-gray-100 text-gray-500",
  MAINTENANCE: "bg-amber-100 text-amber-700",
};

const rentalColor: Record<string, string> = {
  AVAILABLE: "bg-blue-100 text-blue-700",
  RENTED: "bg-green-100 text-green-700",
  RESERVED: "bg-purple-100 text-purple-700",
};

export default function AdminVehiclesPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  // Mock data — later replace with real API call
  useEffect(() => {
    setTimeout(() => {
      setVehicles([
        {
          id: "v1",
          plateNumber: "BA-123-AB",
          type: "STANDARD",
          brand: "Škoda",
          model: "Octavia",
          year: 2022,
          maxPassengers: 4,
          wheelchairAccessible: false,
          isRental: false,
          rentalStatus: "AVAILABLE",
          weeklyRate: null,
          status: "ACTIVE",
          createdAt: new Date().toISOString(),
        },
        {
          id: "v2",
          plateNumber: "BA-456-CD",
          type: "MINIVAN",
          brand: "Volkswagen",
          model: "Transporter",
          year: 2021,
          maxPassengers: 7,
          wheelchairAccessible: false,
          isRental: false,
          rentalStatus: "AVAILABLE",
          weeklyRate: null,
          status: "ACTIVE",
          createdAt: new Date().toISOString(),
        },
        {
          id: "v3",
          plateNumber: "BA-789-EF",
          type: "DELIVERY",
          brand: "Renault",
          model: "Kangoo",
          year: 2023,
          maxPassengers: 2,
          wheelchairAccessible: false,
          isRental: true,
          rentalStatus: "RENTED",
          weeklyRate: 120,
          status: "ACTIVE",
          createdAt: new Date().toISOString(),
        },
        {
          id: "v4",
          plateNumber: "BA-321-GH",
          type: "WAV",
          brand: "Ford",
          model: "Tourneo",
          year: 2024,
          maxPassengers: 5,
          wheelchairAccessible: true,
          isRental: false,
          rentalStatus: "RESERVED",
          weeklyRate: null,
          status: "MAINTENANCE",
          createdAt: new Date().toISOString(),
        },
      ]);
      setLoading(false);
    }, 600);
  }, []);

  const filtered = vehicles.filter((v) => {
    const matchType = filter === "ALL" || v.type === filter;
    const matchSearch =
      !search ||
      v.plateNumber.toLowerCase().includes(search.toLowerCase()) ||
      (v.brand || "").toLowerCase().includes(search.toLowerCase()) ||
      (v.model || "").toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  });

  const stats = {
    total: vehicles.length,
    active: vehicles.filter((v) => v.status === "ACTIVE").length,
    wav: vehicles.filter((v) => v.wheelchairAccessible).length,
    rental: vehicles.filter((v) => v.isRental).length,
  };

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">🚐 Vehicles</h1>
          <p className="text-sm text-gray-500 mt-1">Fleet management — {stats.total} total vehicles</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="bg-green-700 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-green-800 transition-colors flex items-center gap-2"
        >
          + Add Vehicle
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total Fleet", value: stats.total, icon: "🚗", color: "bg-blue-50 border-blue-100" },
          { label: "Active", value: stats.active, icon: "✅", color: "bg-green-50 border-green-100" },
          { label: "WAV Ready", value: stats.wav, icon: "♿", color: "bg-purple-50 border-purple-100" },
          { label: "For Rental", value: stats.rental, icon: "🔑", color: "bg-amber-50 border-amber-100" },
        ].map((s) => (
          <div key={s.label} className={`${s.color} border rounded-2xl p-4`}>
            <div className="text-2xl mb-1">{s.icon}</div>
            <div className="text-2xl font-bold text-gray-900">{s.value}</div>
            <div className="text-xs text-gray-500">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <input
          type="text"
          placeholder="Search plate, brand, model..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-green-300"
        />
        <div className="flex gap-2 flex-wrap">
          {["ALL", ...VEHICLE_TYPES].map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                filter === t
                  ? "bg-green-700 text-white"
                  : "bg-white border border-gray-200 text-gray-500 hover:bg-gray-50"
              }`}
            >
              {t === "ALL" ? "All Types" : typeLabel[t] || t}
            </button>
          ))}
        </div>
      </div>

      {/* WAV Notice */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-5 flex items-start gap-3">
        <span className="text-xl">🚐</span>
        <div>
          <p className="text-sm font-semibold text-amber-800">WAV Vehicles — Coming Soon 2026</p>
          <p className="text-xs text-amber-600 mt-0.5">
            Full wheelchair-accessible vehicles with ramp access will join the fleet. Mark vehicles as WAV type when added.
          </p>
        </div>
      </div>

      {/* Vehicles Table / Cards */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
          <div className="text-3xl mb-3 animate-spin">⚙️</div>
          <p className="text-gray-400 text-sm">Loading vehicles...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
          <div className="text-4xl mb-3">🔍</div>
          <p className="text-gray-500">No vehicles found</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {["Plate", "Type", "Vehicle", "Passengers", "Rental", "Status", "Actions"].map((h) => (
                    <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3.5">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((v) => (
                  <tr key={v.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-4">
                      <span className="font-mono font-bold text-gray-900 text-sm">{v.plateNumber}</span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-sm text-gray-700">{typeLabel[v.type] || v.type}</span>
                      {v.wheelchairAccessible && (
                        <span className="ml-2 text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">WAV</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <div className="text-sm font-medium text-gray-900">
                        {v.brand} {v.model}
                      </div>
                      <div className="text-xs text-gray-400">{v.year}</div>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-sm text-gray-700">Max {v.maxPassengers}</span>
                    </td>
                    <td className="px-5 py-4">
                      {v.isRental ? (
                        <div>
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${rentalColor[v.rentalStatus] || "bg-gray-100 text-gray-500"}`}>
                            {v.rentalStatus}
                          </span>
                          {v.weeklyRate && (
                            <div className="text-xs text-gray-400 mt-1">€{v.weeklyRate}/week</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusColor[v.status] || "bg-gray-100 text-gray-500"}`}>
                        {v.status}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex gap-2">
                        <button className="text-xs text-blue-600 hover:text-blue-800 font-medium">Edit</button>
                        <button className="text-xs text-gray-400 hover:text-gray-600 font-medium">History</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden divide-y divide-gray-100">
            {filtered.map((v) => (
              <div key={v.id} className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <span className="font-mono font-bold text-gray-900">{v.plateNumber}</span>
                    {v.wheelchairAccessible && (
                      <span className="ml-2 text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">WAV ♿</span>
                    )}
                  </div>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusColor[v.status]}`}>
                    {v.status}
                  </span>
                </div>
                <p className="text-sm text-gray-700">{typeLabel[v.type]} · {v.brand} {v.model} ({v.year})</p>
                <p className="text-xs text-gray-400 mt-1">Max {v.maxPassengers} passengers</p>
                {v.isRental && v.weeklyRate && (
                  <p className="text-xs text-green-600 font-semibold mt-1">Rental — €{v.weeklyRate}/week · {v.rentalStatus}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Vehicle Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-bold text-gray-900">Add New Vehicle</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); setShowForm(false); }}>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 block mb-1">Plate Number *</label>
                  <input type="text" placeholder="BA-000-XX" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-300" required />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 block mb-1">Vehicle Type *</label>
                  <select className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-300" required>
                    {VEHICLE_TYPES.map((t) => <option key={t} value={t}>{typeLabel[t] || t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 block mb-1">Brand</label>
                  <input type="text" placeholder="e.g. Škoda" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-300" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 block mb-1">Model</label>
                  <input type="text" placeholder="e.g. Octavia" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-300" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 block mb-1">Year</label>
                  <input type="number" placeholder="2024" min="2010" max="2026" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-300" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 block mb-1">Max Passengers</label>
                  <input type="number" placeholder="4" min="1" max="9" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-300" />
                </div>
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 accent-green-600" />
                  <span className="text-sm text-gray-700">Wheelchair Accessible (WAV)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 accent-green-600" />
                  <span className="text-sm text-gray-700">For Rental</span>
                </label>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 border border-gray-200 rounded-xl py-2.5 text-sm font-medium text-gray-500 hover:bg-gray-50">Cancel</button>
                <button type="submit" className="flex-1 bg-green-700 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-green-800">Add Vehicle</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}