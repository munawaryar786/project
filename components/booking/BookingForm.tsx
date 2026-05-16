"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type {
  ServiceType,
  LuggageType,
  PaymentMethod,
  BookingStep,
} from "@/types/booking";
import PassengerCounter from "./PassengerCounter";
import LuggageWarning from "./LuggageWarning";
import CashWarning from "./CashWarning";
import OTPVerification from "./OTPVerification";
import BookingConfirmation from "./BookingConfirmation";
import AddressAutocomplete from "./AddressAutocomplete";
import PriceEstimate from "./PriceEstimate";
import { useLanguage } from "@/lib/i18n/LanguageContext";

type Coords = {
  lat: number;
  lng: number;
};

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readError(data: unknown, fallback: string) {
  return isRecord(data) && typeof data.error === "string" ? data.error : fallback;
}

export default function BookingForm({
  onPickupChange,
  onDropoffChange,
}: {
  onPickupChange?: (v: string) => void;
  onDropoffChange?: (v: string) => void;
}) {
  const { t } = useLanguage();
  const [step, setStep] = useState<BookingStep>(1);
  const [serviceType, setServiceType] = useState<ServiceType>("standard");
  const [passengers, setPassengers] = useState(2);
  const [luggage, setLuggage] = useState<LuggageType>("none");
  const [wheelchair, setWheelchair] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card");
  const [cashAgreed, setCashAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [pickupAddress, setPickupAddress] = useState("");
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [pickupCoords, setPickupCoords] = useState<Coords | null>(null);
  const [dropoffCoords, setDropoffCoords] = useState<Coords | null>(null);

  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [phoneCode, setPhoneCode] = useState("+421");
  const [languagePref, setLanguagePref] = useState("sk");
  const [specialNotes, setSpecialNotes] = useState("");
  const [flightNumber, setFlightNumber] = useState("");
  const [airline, setAirline] = useState("");
  const [waitAndGreet, setWaitAndGreet] = useState(false);

  const [bookingId, setBookingId] = useState("");
  const [bookingRef, setBookingRef] = useState("");
  const [devOtp, setDevOtp] = useState<string | undefined>(undefined);
  const [estimatedPrice, setEstimatedPrice] = useState<number | undefined>();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  const today = useMemo(() => new Date().toISOString().split("T")[0], []);

  const serviceMap: Record<string, string> = {
    standard: "STANDARD",
    accessible: "ACCESSIBLE",
    senior: "SENIOR",
    children: "CHILDREN",
    airport: "AIRPORT",
  };

  const luggageMap: Record<string, string> = {
    none: "NONE",
    small: "SMALL",
    large: "LARGE",
  };

 const paymentMap: Record<string, string> = {
    card: "CARD",
    cash: "CASH",
    invoice: "INVOICE",
  };

  const safeJson = async (res: Response): Promise<unknown> => {
    const text = await res.text();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      return {};
    }
  };

  const extractCoords = (item: unknown): Coords | null => {
    if (!isRecord(item)) return null;

    const location = isRecord(item.location) ? item.location : null;
    const geometry = isRecord(item.geometry) ? item.geometry : null;
    const geometryLocation = geometry && isRecord(geometry.location) ? geometry.location : null;

    const lat =
      item.lat ??
      item.latitude ??
      location?.lat ??
      geometryLocation?.lat;

    const lng =
      item.lng ??
      item.lon ??
      item.longitude ??
      location?.lng ??
      location?.lon ??
      geometryLocation?.lng;

    const nLat = Number(lat);
    const nLng = Number(lng);

    if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) return null;
    return { lat: nLat, lng: nLng };
  };

  const resolveAddressCoords = async (address: string): Promise<Coords | null> => {
    if (!address || address.trim().length < 3) return null;

    try {
      const res = await fetch(
        `/api/addresses/suggest?q=${encodeURIComponent(address)}`,
        { cache: "no-store" }
      );

      const data = await safeJson(res);
      const list =
        isRecord(data)
          ? data.suggestions ||
            data.results ||
            data.addresses ||
            data.items ||
            []
          : [];

      if (Array.isArray(list) && list.length > 0) {
        return extractCoords(list[0]);
      }

      return extractCoords(data);
    } catch (err) {
      console.error("Failed to resolve address coordinates:", err);
      return null;
    }
  };

  const validateForm = () => {
    if (pickupAddress.trim().length < 3) return "Pickup address is required.";
    if (dropoffAddress.trim().length < 3) return "Drop-off address is required.";
    if (!scheduledDate) return "Please select date.";
    if (!scheduledTime) return "Please select time.";
    if (scheduledDate < today) return "Past date is not allowed.";
    if (customerName.trim().length < 2) return "Customer name is required.";
    if (customerPhone.trim().length < 6) return "Valid phone number is required.";
    if (passengers > 6) return "Maximum 6 passengers allowed.";
    if (passengers >= 6 && luggage !== "none") {
      return "For 6 passengers with luggage, please reduce to 5 passengers or use tourism/airport transfer option.";
    }
    if (paymentMethod === "cash" && !cashAgreed) {
      return "Please agree to the cash payment rules before continuing.";
    }
    return "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);

    try {
      const resolvedPickupCoords =
        pickupCoords || (await resolveAddressCoords(pickupAddress));
      const resolvedDropoffCoords =
        dropoffCoords || (await resolveAddressCoords(dropoffAddress));

      if (resolvedPickupCoords) setPickupCoords(resolvedPickupCoords);
      if (resolvedDropoffCoords) setDropoffCoords(resolvedDropoffCoords);

      const bookingRes = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          serviceType: serviceMap[serviceType],
          pickupAddress: pickupAddress.trim(),
          dropoffAddress: dropoffAddress.trim(),
          pickupLat: resolvedPickupCoords?.lat ?? null,
          pickupLng: resolvedPickupCoords?.lng ?? null,
          dropoffLat: resolvedDropoffCoords?.lat ?? null,
          dropoffLng: resolvedDropoffCoords?.lng ?? null,
          scheduledDate,
          scheduledTime,
          passengerCount: passengers,
          luggageType: luggageMap[luggage],
          wheelchairNeeded: wheelchair,
          flightNumber: flightNumber.trim() || null,
          airline: airline.trim() || null,
          waitAndGreet,
          customerName: customerName.trim(),
          customerEmail: customerEmail.trim() || null,
          customerPhone: customerPhone.trim(),
          customerPhoneCode: phoneCode,
          languagePref,
          specialNotes: specialNotes.trim() || null,
          paymentMethod: paymentMap[paymentMethod],
          cashAgreed,
        }),
      });

      const bookingData = await safeJson(bookingRes);

      if (!bookingRes.ok) {
        throw new Error(readError(bookingData, "Booking creation failed"));
      }

      if (!isRecord(bookingData)) {
        throw new Error("Booking response was invalid");
      }

      const newBookingId =
        typeof bookingData.bookingId === "string" ? bookingData.bookingId : "";
      const newBookingRef =
        typeof bookingData.bookingRef === "string" ? bookingData.bookingRef : "";

      if (!newBookingId || !newBookingRef) {
        throw new Error("Booking response was missing confirmation details");
      }

      setBookingId(newBookingId);
      setBookingRef(newBookingRef);

      const price = Number(bookingData.estimatedPrice);
      if (Number.isFinite(price)) {
        setEstimatedPrice(price);
      }

      const otpRes = await fetch("/api/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          bookingId: newBookingId,
          phone: phoneCode + customerPhone.trim(),
        }),
      });

      const otpData = await safeJson(otpRes);

      if (!otpRes.ok) {
        throw new Error(readError(otpData, "OTP send failed"));
      }

      if (isRecord(otpData) && typeof otpData.devOtp === "string") {
        setDevOtp(otpData.devOtp);
      }
      setStep(2);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleOTPVerify = async (otpCode: string) => {
    setError("");

    const res = await fetch("/api/otp/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ bookingId, otpCode }),
    });

    const data = await safeJson(res);

    if (!res.ok) {
      throw new Error(readError(data, "OTP verification failed"));
    }

    setStep(3);
  };

  const serviceOptions: {
    value: ServiceType;
    label: string;
    icon: string;
    desc: string;
    img: string;
  }[] = [
    {
      value: "standard",
      label: t("services.taxi.title"),
      icon: "🚕",
      desc: t("services.taxi.tagline"),
      img: "/drivo-taxi-service.jpeg",
    },
    {
      value: "airport",
      label: t("services.airport.title"),
      icon: "✈️",
      desc: t("services.airport.tagline"),
      img: "/drivo-airport-transfer.jpeg",
    },
    {
      value: "accessible",
      label: t("services.accessible.title"),
      icon: "♿",
      desc: "ZŤP / Seniorská doprava",
      img: "/drivo-wav-wheelchair.jpeg",
    },
    {
      value: "children",
      label: t("services.children.title"),
      icon: "👧",
      desc: t("services.children.tagline"),
      img: "/drivo-children-dropoff.jpeg",
    },
  ];

  if (step === 2) {
    return (
      <OTPVerification
        onVerify={handleOTPVerify}
        bookingId={bookingId}
        phone={phoneCode + customerPhone}
        devOtp={devOtp}
      />
    );
  }

  if (step === 3) {
    return (
      <BookingConfirmation
        passengers={passengers}
        paymentMethod={paymentMethod}
        bookingRef={bookingRef}
        bookingId={bookingId}
        estimatedPrice={estimatedPrice}
        bookingData={{
          serviceType,
          pickupAddress,
          dropoffAddress,
          scheduledDate,
          scheduledTime,
          passengerCount: passengers,
          luggageType: luggage,
          wheelchairNeeded: wheelchair,
          flightNumber,
          waitAndGreet,
          customerName,
          customerPhone: phoneCode + customerPhone,
          customerEmail,
          paymentMethod,
          specialNotes,
          bookingRef,
          status: "VERIFIED",
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-4 bg-drivo-red-light border-2 border-red-300 rounded-2xl animate-fade-in">
          <p className="text-[14px] text-red-700 font-medium">⚠️ {error}</p>
        </div>
      )}

      <div className="card">
        <div className="flex items-center gap-3 mb-5">
          <span className="w-9 h-9 bg-drivo-green-light rounded-xl flex items-center justify-center text-[14px] font-bold text-drivo-green-dark">
            1
          </span>
          <div>
            <h3 className="font-bold text-drivo-text text-[16px]">
              {t("booking.selectService")}
            </h3>
            <p className="text-[12px] text-drivo-text-muted">
              {t("booking.chooseRight")}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {serviceOptions.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => {
                setServiceType(s.value);
                if (s.value !== "airport") {
                  setFlightNumber("");
                  setAirline("");
                  setWaitAndGreet(false);
                }
              }}
              className={`group relative rounded-2xl border-2 overflow-hidden transition-all ${
                serviceType === s.value
                  ? "border-drivo-green ring-4 ring-drivo-green/10"
                  : "border-drivo-border hover:border-drivo-green/30"
              }`}
            >
              <div className="relative h-20 overflow-hidden">
                <Image
                  src={s.img}
                  alt={s.label}
                  fill
                  sizes="(min-width: 768px) 20vw, 50vw"
                  className="object-cover group-hover:scale-110 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              </div>

              <div className="absolute bottom-0 left-0 right-0 p-2 text-center">
                <span className="text-[12px] font-semibold text-white block">
                  {s.icon} {s.label}
                </span>
                <span className="text-[10px] text-white/60">{s.desc}</span>
              </div>

              {serviceType === s.value && (
                <div className="absolute top-2 right-2 w-5 h-5 bg-drivo-green rounded-full flex items-center justify-center">
                  <span className="text-white text-[10px]">✓</span>
                </div>
              )}
            </button>
          ))}
        </div>

        {serviceType === "accessible" && (
          <div className="mt-4 p-4 bg-drivo-purple-light/50 rounded-2xl border border-drivo-purple/20 animate-fade-in">
            <p className="text-[13px] font-semibold text-drivo-purple">
              ♿ {t("services.accessible.title")}
            </p>
            <p className="text-[12px] text-drivo-text-secondary mt-1">
              {t("fleet.wavNote")}
            </p>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="card">
          <div className="flex items-center gap-3 mb-5">
            <span className="w-9 h-9 bg-drivo-green-light rounded-xl flex items-center justify-center text-[14px] font-bold text-drivo-green-dark">
              2
            </span>
            <div>
              <h3 className="font-bold text-drivo-text text-[16px]">
                {t("booking.tripDetails")}
              </h3>
              <p className="text-[12px] text-drivo-text-muted">
                {t("booking.whereWhen")}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <AddressAutocomplete
              id="pickup"
              label={`📍 ${t("booking.pickup")} *`}
              value={pickupAddress}
              onChange={(v) => {
                setPickupAddress(v);
                setPickupCoords(null);
                onPickupChange?.(v);
              }}
              placeholder={t("booking.pickupPlaceholder")}
            />

            <AddressAutocomplete
              id="dropoff"
              label={`📍 ${t("booking.dropoff")} *`}
              value={dropoffAddress}
              onChange={(v) => {
                setDropoffAddress(v);
                setDropoffCoords(null);
                onDropoffChange?.(v);
              }}
              placeholder={t("booking.dropoffPlaceholder")}
            />

            {pickupAddress && dropoffAddress && (
              <PriceEstimate
                pickupAddress={pickupAddress}
                dropoffAddress={dropoffAddress}
                serviceType={serviceType}
                passengerCount={passengers}
                onPriceChange={setEstimatedPrice}
              />
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[12px] font-semibold text-drivo-text-secondary mb-1.5 block">
                  📅 {t("booking.date")} *
                </label>
                <input
                  type="date"
                  min={today}
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className="input text-[14px]"
                  required
                />
              </div>

              <div>
                <label className="text-[12px] font-semibold text-drivo-text-secondary mb-1.5 block">
                  🕐 {t("booking.time")} *
                </label>
                <input
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  className="input text-[14px]"
                  required
                />
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-3 mb-5">
            <span className="w-9 h-9 bg-drivo-green-light rounded-xl flex items-center justify-center text-[14px] font-bold text-drivo-green-dark">
              3
            </span>
            <div>
              <h3 className="font-bold text-drivo-text text-[16px]">
                {t("booking.passengers")} & {t("booking.luggage")}
              </h3>
              <p className="text-[12px] text-drivo-text-muted">
                {t("booking.vehicleMatching", "Vehicle matching")}
              </p>
            </div>
          </div>

          <div className="space-y-5">
            <PassengerCounter value={passengers} onChange={setPassengers} />

            <div>
              <label className="text-[12px] font-semibold text-drivo-text-secondary mb-2 block">
                🧳 {t("booking.luggage")}
              </label>

              <div className="grid grid-cols-3 gap-3">
                {[
                  ["none", t("booking.luggageNone"), "🚶"],
                  ["small", t("booking.luggageSmall"), "🧳"],
                  ["large", t("booking.luggageLarge"), "🧳🧳"],
                ].map(([v, l, icon]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setLuggage(v as LuggageType)}
                    className={`p-4 rounded-2xl border-2 text-center transition-all ${
                      luggage === v
                        ? "border-drivo-green bg-drivo-green-light"
                        : "border-drivo-border hover:border-drivo-green/30"
                    }`}
                  >
                    <span className="text-xl block mb-1">{icon}</span>
                    <span className="text-[12px] font-medium text-drivo-text block">
                      {l}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <LuggageWarning
              passengers={passengers}
              luggage={luggage}
              onSwitchService={() => {
                setServiceType("airport");
                setPassengers(Math.min(5, passengers));
              }}
            />

            <div className="p-4 bg-drivo-purple-light/50 rounded-2xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xl">♿</span>
                  <div>
                    <span className="text-[14px] font-medium text-drivo-text block">
                      {t("booking.wheelchair")}?
                    </span>
                    <span className="text-[11px] text-drivo-text-muted">
                      {t("services.accessible.tagline")}
                    </span>
                  </div>
                </div>

                <label className="relative inline-flex cursor-pointer">
                  <input
                    type="checkbox"
                    checked={wheelchair}
                    onChange={(e) => setWheelchair(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-12 h-7 bg-drivo-border rounded-full peer peer-checked:bg-drivo-green peer-checked:after:translate-x-5 after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:bg-white after:rounded-full after:h-[22px] after:w-[22px] after:shadow-sm after:transition-all" />
                </label>
              </div>

              {wheelchair && (
                <div className="mt-3 p-3 bg-white rounded-xl border border-blue-200 animate-fade-in">
                  <p className="text-[12px] text-blue-700">
                    🚐 <strong>{t("fleet.wavBadge")}.</strong> {t("fleet.wavNote")}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {serviceType === "airport" && (
          <div className="card animate-fade-in">
            <div className="flex items-center gap-3 mb-5">
              <span className="w-9 h-9 bg-sky-100 rounded-xl flex items-center justify-center text-[14px]">
                ✈️
              </span>
              <div>
                <h3 className="font-bold text-drivo-text text-[16px]">
                  {t("booking.airportDetails")}
                </h3>
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  value={flightNumber}
                  onChange={(e) => setFlightNumber(e.target.value)}
                  placeholder={t("booking.flightNumber")}
                  className="input"
                />

                <select
                  value={airline}
                  onChange={(e) => setAirline(e.target.value)}
                  className="input"
                >
                  <option value="">{t("booking.airline")}</option>
                  <option>Ryanair</option>
                  <option>Wizz Air</option>
                  <option>Austrian</option>
                  <option>Other</option>
                </select>
              </div>

              <div className="flex items-center justify-between p-4 bg-sky-50 rounded-2xl border border-sky-100">
                <div>
                  <span className="text-[14px] font-medium text-drivo-text">
                    🤝 {t("booking.waitAndGreet")}
                  </span>
                  <p className="text-[11px] text-drivo-text-muted">
                    {t("booking.waitAndGreetDesc")}
                  </p>
                </div>

                <label className="relative inline-flex cursor-pointer">
                  <input
                    type="checkbox"
                    checked={waitAndGreet}
                    onChange={(e) => setWaitAndGreet(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-12 h-7 bg-drivo-border rounded-full peer peer-checked:bg-drivo-green peer-checked:after:translate-x-5 after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:bg-white after:rounded-full after:h-[22px] after:w-[22px] after:shadow-sm after:transition-all" />
                </label>
              </div>
            </div>
          </div>
        )}

        <div className="card">
          <div className="flex items-center gap-3 mb-5">
            <span className="w-9 h-9 bg-drivo-green-light rounded-xl flex items-center justify-center text-[14px] font-bold text-drivo-green-dark">
              4
            </span>
            <h3 className="font-bold text-drivo-text text-[16px]">
              {t("booking.contactDetails")} & {t("booking.payment")}
            </h3>
          </div>

          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder={`${t("booking.name")} *`}
                className="input"
                required
              />

              <input
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder={t("booking.email")}
                className="input"
              />
            </div>

            <div className="flex gap-2">
              <select
                value={phoneCode}
                onChange={(e) => setPhoneCode(e.target.value)}
                className="input w-24 shrink-0"
              >
                <option>+421</option>
                <option>+420</option>
                <option>+43</option>
                <option>+49</option>
                <option>+44</option>
              </select>

              <input
                type="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder={`${t("booking.phone")} *`}
                className="input"
                required
              />
            </div>

            <select
              value={languagePref}
              onChange={(e) => setLanguagePref(e.target.value)}
              className="input"
            >
              <option value="sk">🇸🇰 Slovak</option>
              <option value="en">🇬🇧 English</option>
              <option value="de">🇩🇪 German</option>
              <option value="uk">🇺🇦 Ukrainian</option>
              <option value="cs">🇨🇿 Czech</option>
            </select>

            <div>
              <label className="text-[12px] font-semibold text-drivo-text-secondary mb-3 block">
                💳 {t("booking.payment")} *
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  ["card", "💳", t("booking.paymentCard"), t("booking.paymentCardDesc"), t("booking.recommended", "Recommended")],
                  ["cash", "💰", t("booking.paymentCash"), t("booking.paymentCashDesc"), t("booking.rulesApply", "Rules apply")],
                  ["invoice", "🏢", t("booking.paymentInvoice"), t("booking.paymentInvoiceDesc"), "Net 30"],
                ].map(([v, icon, label, sub, tag]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => {
                      setPaymentMethod(v as PaymentMethod);
                      setCashAgreed(false);
                    }}
                    className={`p-4 rounded-2xl border-2 text-left transition-all ${
                      paymentMethod === v
                        ? v === "cash"
                          ? "border-amber-400 bg-drivo-amber-light"
                          : "border-drivo-green bg-drivo-green-light"
                        : "border-drivo-border hover:border-drivo-green/30"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xl">{icon}</span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-drivo-green/10 text-drivo-green">
                        {tag}
                      </span>
                    </div>
                    <span className="text-[14px] font-semibold text-drivo-text block">
                      {label}
                    </span>
                    <span className="text-[11px] text-drivo-text-muted">
                      {sub}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {paymentMethod === "cash" && (
              <CashWarning agreed={cashAgreed} onAgreeChange={setCashAgreed} />
            )}

            {paymentMethod === "invoice" && (
              <div className="p-4 bg-drivo-blue-light rounded-2xl border border-blue-200 animate-fade-in">
                <p className="text-[13px] text-blue-700">
                  <strong>🏢 {t("booking.paymentInvoice")}:</strong> {t("booking.invoiceNotice", "For municipalities, healthcare, insurers. Details confirmed via email.")}
                </p>
              </div>
            )}

            <textarea
              value={specialNotes}
              onChange={(e) => setSpecialNotes(e.target.value)}
              placeholder={t("booking.notesPlaceholder")}
              rows={3}
              maxLength={500}
              className="input resize-none"
            />
          </div>
        </div>

        <div className="card bg-gradient-to-r from-drivo-green-light/30 to-drivo-blue-light/30 border border-drivo-green/20">
          <div className="flex items-start gap-3 mb-5">
            <span className="text-2xl">🛡️</span>
            <div>
              <p className="text-[14px] font-semibold text-drivo-text">
                {t("booking.secureBooking", "Secure booking")}
              </p>
              <p className="text-[12px] text-drivo-text-secondary">
                {t("booking.gdprSecure", "EU GDPR compliant. Encrypted.")}
              </p>
            </div>
          </div>

          <button
            type="submit"
            className="btn-primary w-full text-[16px] py-4 disabled:opacity-50"
            disabled={loading || (paymentMethod === "cash" && !cashAgreed)}
          >
            {loading ? t("booking.creating") : t("booking.continue")}
          </button>

          <p className="text-center text-[11px] text-drivo-text-muted mt-3">
            {t("booking.termsAgree")}{" "}
            <Link href="/terms" className="underline">
              {t("booking.terms")}
            </Link>{" "}
            {t("booking.and")}{" "}
            <Link href="/privacy" className="underline">
              {t("booking.privacy")}
            </Link>
            .
          </p>
        </div>
      </form>
    </div>
  );
}
