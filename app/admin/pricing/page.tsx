"use client";

import { useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/lib/i18n/LanguageContext";

type PricingForm = {
  baseFare: string;
  distanceRate: string;
  waitingRatePerMinute: string;
  minimumFare: string;
  bookingFee: string;
  airportPickupFee: string;
  airportMeetGreetFee: string;
  assistedTransportFee: string;
  childTransportFee: string;
  priorityBookingFee: string;
  nightServicePercentage: string;
  nightStartTime: string;
  nightEndTime: string;
  surgeEnabled: boolean;
  transparentPricingMessage: string;
  standardTaxiBasePrice?: string;
  pricePerKm?: string;
  airportTransferPrice?: string;
  tourismTransferPrice?: string;
  weeklyVehicleRentalPrice?: string;
  dailyVehicleRentalPrice?: string;
  globalDefaultCommission?: string;
};

type DistanceTierForm = {
  id?: string;
  key?: string;
  label: string;
  minKm: string;
  maxKm: string;
  ratePerKm: string;
  sortOrder: string;
  active: boolean;
};

type ProfileForm = {
  id?: string;
  code: string;
  name: string;
  description: string;
  active: boolean;
  baseFareOverride: string;
  distanceRateOverride: string;
  minimumFareOverride: string;
  serviceFee: string;
  commissionRateOverride: string;
};

type CommissionForm = {
  id?: string;
  key: string;
  scope: "GLOBAL" | "DRIVER" | "FLEET" | "SERVICE_TYPE";
  scopeId: string;
  commissionRate: string;
  active: boolean;
  notes: string;
};

const pricingFields: Array<{ key: keyof PricingForm; label: string; step?: string }> = [
  { key: "baseFare", label: "Base Fare" },
  { key: "distanceRate", label: "Distance Rate" },
  { key: "waitingRatePerMinute", label: "Waiting Time Rate" },
  { key: "minimumFare", label: "Minimum Fare" },
  { key: "bookingFee", label: "Booking Fee" },
  { key: "airportPickupFee", label: "Airport Pickup Fee" },
  { key: "airportMeetGreetFee", label: "Meet & Greet Fee" },
  { key: "childTransportFee", label: "Child Transport Fee" },
  { key: "assistedTransportFee", label: "Senior/Accessible Transport Fee" },
  { key: "priorityBookingFee", label: "Priority Booking Fee" },
  { key: "nightServicePercentage", label: "Night Service Percentage" },
];

const blankPricing: PricingForm = {
  baseFare: "",
  distanceRate: "",
  waitingRatePerMinute: "",
  minimumFare: "",
  bookingFee: "",
  airportPickupFee: "",
  airportMeetGreetFee: "",
  assistedTransportFee: "",
  childTransportFee: "",
  priorityBookingFee: "",
  nightServicePercentage: "",
  nightStartTime: "",
  nightEndTime: "",
  surgeEnabled: false,
  transparentPricingMessage: "",
};

function numberValue(value: string) {
  return Number(value || 0);
}

function nullableNumber(value: string) {
  return value === "" ? null : Number(value);
}

function toMoney(value: unknown) {
  return value === null || value === undefined ? "" : String(value);
}

async function safeJson(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Request failed");
  return data;
}

export default function AdminPricingPage() {
  const { t } = useLanguage();
  const [pricing, setPricing] = useState<PricingForm>(blankPricing);
  const [tiers, setTiers] = useState<DistanceTierForm[]>([]);
  const [profiles, setProfiles] = useState<ProfileForm[]>([]);
  const [commissions, setCommissions] = useState<CommissionForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingSection, setSavingSection] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    loadAll();
  }, []);

  const sortedTiers = useMemo(
    () => [...tiers].sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0)),
    [tiers]
  );

  async function loadAll() {
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const [pricingData, profilesData, commissionsData] = await Promise.all([
        fetch("/api/admin/pricing", { cache: "no-store" }).then(safeJson),
        fetch("/api/admin/pricing/profiles", { cache: "no-store" }).then(safeJson),
        fetch("/api/admin/commissions", { cache: "no-store" }).then(safeJson),
      ]);

      const loadedPricing = pricingData.pricing || {};
      setPricing({
        baseFare: toMoney(loadedPricing.baseFare),
        distanceRate: toMoney(loadedPricing.distanceRate),
        waitingRatePerMinute: toMoney(loadedPricing.waitingRatePerMinute),
        minimumFare: toMoney(loadedPricing.minimumFare),
        bookingFee: toMoney(loadedPricing.bookingFee),
        airportPickupFee: toMoney(loadedPricing.airportPickupFee),
        airportMeetGreetFee: toMoney(loadedPricing.airportMeetGreetFee),
        assistedTransportFee: toMoney(loadedPricing.assistedTransportFee),
        childTransportFee: toMoney(loadedPricing.childTransportFee),
        priorityBookingFee: toMoney(loadedPricing.priorityBookingFee),
        nightServicePercentage: toMoney(loadedPricing.nightServicePercentage),
        nightStartTime: loadedPricing.nightStartTime || "",
        nightEndTime: loadedPricing.nightEndTime || "",
        surgeEnabled: Boolean(loadedPricing.surgeEnabled),
        transparentPricingMessage: loadedPricing.transparentPricingMessage || "",
        standardTaxiBasePrice: toMoney(loadedPricing.standardTaxiBasePrice),
        pricePerKm: toMoney(loadedPricing.pricePerKm),
        airportTransferPrice: toMoney(loadedPricing.airportTransferPrice),
        tourismTransferPrice: toMoney(loadedPricing.tourismTransferPrice),
        weeklyVehicleRentalPrice: toMoney(loadedPricing.weeklyVehicleRentalPrice),
        dailyVehicleRentalPrice: toMoney(loadedPricing.dailyVehicleRentalPrice),
        globalDefaultCommission: toMoney(loadedPricing.globalDefaultCommission),
      });

      setTiers(
        (pricingData.tiers || []).map((tier: any) => ({
          id: tier.id,
          key: tier.key,
          label: tier.label || "",
          minKm: toMoney(tier.minKm),
          maxKm: tier.maxKm === null || tier.maxKm === undefined ? "" : String(tier.maxKm),
          ratePerKm: toMoney(tier.ratePerKm),
          sortOrder: toMoney(tier.sortOrder),
          active: Boolean(tier.active),
        }))
      );

      setProfiles(
        (profilesData.profiles || []).map((profile: any) => ({
          id: profile.id,
          code: profile.code,
          name: profile.name || "",
          description: profile.description || "",
          active: Boolean(profile.active),
          baseFareOverride: toMoney(profile.baseFareOverride),
          distanceRateOverride: toMoney(profile.distanceRateOverride),
          minimumFareOverride: toMoney(profile.minimumFareOverride),
          serviceFee: toMoney(profile.serviceFee),
          commissionRateOverride: toMoney(profile.commissionRateOverride),
        }))
      );

      setCommissions(
        (commissionsData.commissions || []).map((commission: any) => ({
          id: commission.id,
          key: commission.key,
          scope: commission.scope,
          scopeId: commission.scopeId || "",
          commissionRate: toMoney(commission.commissionRate),
          active: Boolean(commission.active),
          notes: commission.notes || "",
        }))
      );
    } catch (err: any) {
      setError(err?.message || "Failed to load pricing configuration.");
    } finally {
      setLoading(false);
    }
  }

  function validatePricing() {
    for (const field of pricingFields) {
      const value = Number(pricing[field.key] || 0);
      if (!Number.isFinite(value) || value < 0) return `${field.label} must be zero or higher.`;
    }

    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(pricing.nightStartTime)) {
      return "Night start must use HH:mm format.";
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(pricing.nightEndTime)) {
      return "Night end must use HH:mm format.";
    }

    for (const tier of tiers) {
      if (!tier.label.trim()) return "Each long-distance tier needs a label.";
      if (numberValue(tier.maxKm) > 0 && numberValue(tier.maxKm) <= numberValue(tier.minKm)) {
        return "Tier max km must be greater than min km.";
      }
    }

    return "";
  }

  async function savePricing() {
    const validationError = validatePricing();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSavingSection("pricing");
    setError("");
    setMessage("");

    try {
      const payload = {
        pricing: {
          ...pricing,
          baseFare: numberValue(pricing.baseFare),
          distanceRate: numberValue(pricing.distanceRate),
          waitingRatePerMinute: numberValue(pricing.waitingRatePerMinute),
          minimumFare: numberValue(pricing.minimumFare),
          bookingFee: numberValue(pricing.bookingFee),
          airportPickupFee: numberValue(pricing.airportPickupFee),
          airportMeetGreetFee: numberValue(pricing.airportMeetGreetFee),
          assistedTransportFee: numberValue(pricing.assistedTransportFee),
          childTransportFee: numberValue(pricing.childTransportFee),
          priorityBookingFee: numberValue(pricing.priorityBookingFee),
          nightServicePercentage: numberValue(pricing.nightServicePercentage),
          standardTaxiBasePrice: numberValue(pricing.standardTaxiBasePrice || pricing.baseFare),
          pricePerKm: numberValue(pricing.pricePerKm || pricing.distanceRate),
          airportTransferPrice: numberValue(pricing.airportTransferPrice || pricing.airportPickupFee),
          tourismTransferPrice: numberValue(pricing.tourismTransferPrice || "0"),
          weeklyVehicleRentalPrice: numberValue(pricing.weeklyVehicleRentalPrice || "120"),
          dailyVehicleRentalPrice: numberValue(pricing.dailyVehicleRentalPrice || "25"),
          globalDefaultCommission: numberValue(pricing.globalDefaultCommission || "12.5"),
        },
        tiers: tiers.map((tier) => ({
          ...tier,
          minKm: numberValue(tier.minKm),
          maxKm: tier.maxKm === "" ? null : numberValue(tier.maxKm),
          ratePerKm: numberValue(tier.ratePerKm),
          sortOrder: numberValue(tier.sortOrder),
        })),
      };

      const data = await fetch("/api/admin/pricing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then(safeJson);

      setMessage("Pricing configuration saved.");
      setTiers((data.tiers || []).map((tier: any) => ({
        id: tier.id,
        key: tier.key,
        label: tier.label || "",
        minKm: toMoney(tier.minKm),
        maxKm: tier.maxKm === null || tier.maxKm === undefined ? "" : String(tier.maxKm),
        ratePerKm: toMoney(tier.ratePerKm),
        sortOrder: toMoney(tier.sortOrder),
        active: Boolean(tier.active),
      })));
    } catch (err: any) {
      setError(err?.message || "Failed to save pricing configuration.");
    } finally {
      setSavingSection("");
    }
  }

  async function saveProfiles() {
    setSavingSection("profiles");
    setError("");
    setMessage("");

    try {
      const data = await fetch("/api/admin/pricing/profiles", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profiles: profiles.map((profile) => ({
            ...profile,
            baseFareOverride: nullableNumber(profile.baseFareOverride),
            distanceRateOverride: nullableNumber(profile.distanceRateOverride),
            minimumFareOverride: nullableNumber(profile.minimumFareOverride),
            serviceFee: numberValue(profile.serviceFee),
            commissionRateOverride: nullableNumber(profile.commissionRateOverride),
          })),
        }),
      }).then(safeJson);

      setProfiles(
        (data.profiles || []).map((profile: any) => ({
          id: profile.id,
          code: profile.code,
          name: profile.name || "",
          description: profile.description || "",
          active: Boolean(profile.active),
          baseFareOverride: toMoney(profile.baseFareOverride),
          distanceRateOverride: toMoney(profile.distanceRateOverride),
          minimumFareOverride: toMoney(profile.minimumFareOverride),
          serviceFee: toMoney(profile.serviceFee),
          commissionRateOverride: toMoney(profile.commissionRateOverride),
        }))
      );
      setMessage("Service pricing profiles saved.");
    } catch (err: any) {
      setError(err?.message || "Failed to save service profiles.");
    } finally {
      setSavingSection("");
    }
  }

  async function saveCommissions() {
    setSavingSection("commissions");
    setError("");
    setMessage("");

    try {
      const data = await fetch("/api/admin/commissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commissions: commissions.map((commission) => ({
            ...commission,
            scopeId: commission.scopeId || null,
            commissionRate: numberValue(commission.commissionRate),
            notes: commission.notes || null,
          })),
        }),
      }).then(safeJson);

      setCommissions(
        (data.commissions || []).map((commission: any) => ({
          id: commission.id,
          key: commission.key,
          scope: commission.scope,
          scopeId: commission.scopeId || "",
          commissionRate: toMoney(commission.commissionRate),
          active: Boolean(commission.active),
          notes: commission.notes || "",
        }))
      );
      setMessage("Commission settings saved.");
    } catch (err: any) {
      setError(err?.message || "Failed to save commission settings.");
    } finally {
      setSavingSection("");
    }
  }

  function addTier() {
    const nextOrder = tiers.length ? Math.max(...tiers.map((tier) => numberValue(tier.sortOrder))) + 1 : 1;
    setTiers([
      ...tiers,
      {
        label: "New tier",
        minKm: "",
        maxKm: "",
        ratePerKm: "",
        sortOrder: String(nextOrder),
        active: true,
      },
    ]);
  }

  if (loading) {
    return <div className="p-12 text-center text-sm text-gray-500">{t("common.loading", "Loading")}</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t("adminPricing.title", "Pricing Configuration")}</h1>
        <p className="mt-1 text-sm text-gray-500">
          Configure fare rules, service profiles, and commissions for Pricing Engine V1.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">
          {message}
        </div>
      )}

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Fare Settings</h2>
            <p className="text-sm text-gray-500">{pricing.transparentPricingMessage}</p>
          </div>
          <button
            type="button"
            onClick={savePricing}
            disabled={savingSection === "pricing"}
            className="rounded-xl bg-green-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {savingSection === "pricing" ? "Saving..." : "Save Pricing"}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {pricingFields.map((field) => (
            <NumberField
              key={field.key}
              label={field.label}
              value={String(pricing[field.key] || "")}
              onChange={(value) => setPricing({ ...pricing, [field.key]: value })}
            />
          ))}
          <TextField
            label="Night Start"
            value={pricing.nightStartTime}
            onChange={(value) => setPricing({ ...pricing, nightStartTime: value })}
            placeholder="22:00"
          />
          <TextField
            label="Night End"
            value={pricing.nightEndTime}
            onChange={(value) => setPricing({ ...pricing, nightEndTime: value })}
            placeholder="06:00"
          />
          <TextField
            label="Customer Pricing Message"
            value={pricing.transparentPricingMessage}
            onChange={(value) => setPricing({ ...pricing, transparentPricingMessage: value })}
          />
        </div>

        <label className="mt-5 flex items-center justify-between gap-4 rounded-2xl border border-gray-200 bg-gray-50 p-4">
          <span>
            <span className="block text-sm font-bold text-gray-900">Surge Enabled</span>
            <span className="text-xs text-gray-500">Default is off. Enable only when Drivo decides to use surge pricing.</span>
          </span>
          <input
            type="checkbox"
            checked={pricing.surgeEnabled}
            onChange={(event) => setPricing({ ...pricing, surgeEnabled: event.target.checked })}
            className="h-5 w-5 rounded border-gray-300 text-green-700 focus:ring-green-700"
          />
        </label>

        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-black uppercase tracking-wide text-gray-500">Long Distance Pricing Tiers</h3>
            <button type="button" onClick={addTier} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-700">
              Add Tier
            </button>
          </div>
          <div className="space-y-3">
            {sortedTiers.map((tier) => {
              const index = tiers.findIndex((item) => item === tier);
              return (
                <div key={tier.id || `${tier.label}-${tier.sortOrder}`} className="grid gap-3 rounded-2xl border border-gray-200 p-4 md:grid-cols-[1.2fr_.7fr_.7fr_.7fr_.5fr_auto]">
                  <TextField label="Label" value={tier.label} onChange={(value) => updateTier(index, { label: value })} />
                  <NumberField label="Min km" value={tier.minKm} onChange={(value) => updateTier(index, { minKm: value })} />
                  <NumberField label="Max km" value={tier.maxKm} onChange={(value) => updateTier(index, { maxKm: value })} placeholder="No max" />
                  <NumberField label="Rate / km" value={tier.ratePerKm} onChange={(value) => updateTier(index, { ratePerKm: value })} />
                  <NumberField label="Order" value={tier.sortOrder} onChange={(value) => updateTier(index, { sortOrder: value })} step="1" />
                  <div className="flex items-end gap-3">
                    <label className="flex h-10 items-center gap-2 text-xs font-bold text-gray-600">
                      <input
                        type="checkbox"
                        checked={tier.active}
                        onChange={(event) => updateTier(index, { active: event.target.checked })}
                      />
                      Active
                    </label>
                    <button
                      type="button"
                      onClick={() => setTiers(tiers.filter((_, tierIndex) => tierIndex !== index))}
                      className="h-10 rounded-lg border border-red-200 px-3 text-xs font-bold text-red-600"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Service Pricing Profiles</h2>
            <p className="text-sm text-gray-500">Future-ready overrides by service type.</p>
          </div>
          <button
            type="button"
            onClick={saveProfiles}
            disabled={savingSection === "profiles"}
            className="rounded-xl bg-green-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {savingSection === "profiles" ? "Saving..." : "Save Profiles"}
          </button>
        </div>

        <div className="space-y-3">
          {profiles.map((profile, index) => (
            <div key={profile.code} className="rounded-2xl border border-gray-200 p-4">
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-bold text-gray-900">{profile.name}</p>
                  <p className="text-xs text-gray-500">{profile.code}</p>
                </div>
                <label className="flex items-center gap-2 text-xs font-bold text-gray-600">
                  <input
                    type="checkbox"
                    checked={profile.active}
                    onChange={(event) => updateProfile(index, { active: event.target.checked })}
                  />
                  Active
                </label>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <NumberField label="Service Fee" value={profile.serviceFee} onChange={(value) => updateProfile(index, { serviceFee: value })} />
                <NumberField label="Base Override" value={profile.baseFareOverride} onChange={(value) => updateProfile(index, { baseFareOverride: value })} placeholder="Default" />
                <NumberField label="Distance Override" value={profile.distanceRateOverride} onChange={(value) => updateProfile(index, { distanceRateOverride: value })} placeholder="Default" />
                <NumberField label="Minimum Override" value={profile.minimumFareOverride} onChange={(value) => updateProfile(index, { minimumFareOverride: value })} placeholder="Default" />
                <NumberField label="Commission Override %" value={profile.commissionRateOverride} onChange={(value) => updateProfile(index, { commissionRateOverride: value })} placeholder="Default" />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Commission Settings</h2>
            <p className="text-sm text-gray-500">Launch recommendation is 10-15%.</p>
          </div>
          <button
            type="button"
            onClick={saveCommissions}
            disabled={savingSection === "commissions"}
            className="rounded-xl bg-green-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {savingSection === "commissions" ? "Saving..." : "Save Commissions"}
          </button>
        </div>

        <div className="space-y-3">
          {commissions.map((commission, index) => (
            <div key={commission.key} className="grid gap-3 rounded-2xl border border-gray-200 p-4 lg:grid-cols-[.8fr_1fr_.7fr_1.4fr_auto]">
              <TextField label="Scope" value={commission.scope.replaceAll("_", " ")} onChange={() => {}} disabled />
              <TextField label="Override ID" value={commission.scopeId} onChange={(value) => updateCommission(index, { scopeId: value })} placeholder="default / driver id / fleet id / service code" />
              <NumberField label="Commission %" value={commission.commissionRate} onChange={(value) => updateCommission(index, { commissionRate: value })} />
              <TextField label="Notes" value={commission.notes} onChange={(value) => updateCommission(index, { notes: value })} />
              <label className="flex items-end gap-2 pb-2 text-xs font-bold text-gray-600">
                <input
                  type="checkbox"
                  checked={commission.active}
                  onChange={(event) => updateCommission(index, { active: event.target.checked })}
                />
                Active
              </label>
            </div>
          ))}
        </div>
      </section>
    </div>
  );

  function updateTier(index: number, patch: Partial<DistanceTierForm>) {
    setTiers(tiers.map((tier, tierIndex) => (tierIndex === index ? { ...tier, ...patch } : tier)));
  }

  function updateProfile(index: number, patch: Partial<ProfileForm>) {
    setProfiles(profiles.map((profile, profileIndex) => (profileIndex === index ? { ...profile, ...patch } : profile)));
  }

  function updateCommission(index: number, patch: Partial<CommissionForm>) {
    setCommissions(commissions.map((commission, commissionIndex) => (commissionIndex === index ? { ...commission, ...patch } : commission)));
  }
}

function NumberField({
  label,
  value,
  onChange,
  placeholder,
  step = "0.01",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  step?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-gray-600">{label}</span>
      <input
        type="number"
        min="0"
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-xl border border-gray-200 px-3 text-sm focus:border-green-700 focus:outline-none focus:ring-2 focus:ring-green-700/10"
      />
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-gray-600">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="h-10 w-full rounded-xl border border-gray-200 px-3 text-sm focus:border-green-700 focus:outline-none focus:ring-2 focus:ring-green-700/10 disabled:bg-gray-50 disabled:text-gray-500"
      />
    </label>
  );
}
