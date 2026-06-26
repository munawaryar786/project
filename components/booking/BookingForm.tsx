"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type {
  ServiceType,
  LuggageType,
  PaymentMethod,
  BookingStep,
  AssistanceLevel,
  WheelchairType,
  TransferToSeat,
  MedicalTripType,
  WaitingDuration,
  RecurrenceType,
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

type FareBreakdown = Record<string, unknown>;
type AuthMode =
  | "idle"
  | "checkingPhone"
  | "registrationOtp"
  | "createAccount"
  | "existingAccountLogin"
  | "legacyPasswordSetupOtp"
  | "legacyPasswordSetup"
  | "forgotPasswordOtp"
  | "resetPassword"
  | "loginStepUp"
  | "authenticated";

type ChildDetail = {
  fullName: string;
  age: string;
  specialRequirements: string;
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readError(data: unknown, fallback: string) {
  if (!isRecord(data)) return fallback;
  if (typeof data.message === "string") return data.message;
  return typeof data.error === "string" ? data.error : fallback;
}

function readCode(data: unknown) {
  return isRecord(data) && typeof data.code === "string" ? data.code : "";
}

function isAuthenticationRequiredMessage(message: string) {
  const normalized = message.trim().toLowerCase();
  return (
    normalized === "authentication required" ||
    normalized === "please log in or verify your phone to continue." ||
    normalized === "please log in or verify your phone to continue"
  );
}

function authRequiredMessage(data: unknown) {
  return readCode(data) === "AUTHENTICATION_REQUIRED"
    ? "Please log in or verify your phone to continue."
    : readError(data, "Please log in or verify your phone to continue.");
}

function otpVerifyMessage(data: unknown, fallback: string) {
  const code = readCode(data);
  if (code === "OTP_INVALID") return "Invalid verification code.";
  if (code === "OTP_EXPIRED") return "Verification code expired. Please request a new code.";
  if (code === "PROOF_CREATE_FAILED") {
    return "Verification could not be completed. Please request a new code.";
  }
  return readError(data, fallback);
}

function proofFailureMessage(code: string, fallback: string) {
  if (code === "PROOF_EXPIRED") return "Phone verification expired. Please verify again.";
  if (code === "PROOF_MISSING") return "Phone verification is missing. Please verify your number again.";
  if (code === "PROOF_INVALID") return "Phone verification could not be confirmed. Please verify again.";
  if (code === "PROOF_PHONE_MISMATCH") return "Phone verification could not be confirmed. Please verify again.";
  if (code === "PROOF_BOOKING_MISMATCH") return "Phone verification could not be confirmed. Please verify again.";
  return fallback;
}

function createEmptyChild(): ChildDetail {
  return { fullName: "", age: "", specialRequirements: "" };
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function waitingMinutesFromDuration(value: WaitingDuration, customValue: string) {
  if (value === "30_MINUTES") return 30;
  if (value === "1_HOUR") return 60;
  if (value === "2_HOURS") return 120;
  if (value === "3_HOURS") return 180;
  if (value === "4_HOURS") return 240;
  if (value === "CUSTOM") {
    const match = customValue.match(/\d+/);
    return match ? Number(match[0]) : 0;
  }
  return 0;
}

const EDUCATIONAL_DESTINATION_TERMS = [
  "school",
  "college",
  "university",
  "educational",
  "education",
  "training",
  "centre",
  "center",
  "institute",
  "academy",
  "skola",
  "škola",
  "gymnasium",
  "gymnázium",
  "univerzita",
];

function isEducationalDestination(value: string) {
  const normalized = value.toLowerCase();
  return EDUCATIONAL_DESTINATION_TERMS.some((term) => normalized.includes(term));
}

function getInstitutionName(address: string) {
  return address.split(",")[0]?.trim() || "";
}

function CounterControl({
  label,
  value,
  onChange,
  min = 0,
  max = 12,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div>
      <label className="text-[12px] font-semibold text-drivo-text-secondary mb-2 block">
        {label}
      </label>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          className="w-11 h-11 rounded-xl bg-drivo-bg-soft text-drivo-text font-medium text-lg hover:bg-drivo-border transition-colors flex items-center justify-center"
          aria-label={`${label} -`}
        >
          -
        </button>
        <span className="text-[20px] font-bold text-drivo-text w-8 text-center">
          {value}
        </span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          className="w-11 h-11 rounded-xl bg-drivo-bg-soft text-drivo-text font-medium text-lg hover:bg-drivo-border transition-colors flex items-center justify-center"
          aria-label={`${label} +`}
        >
          +
        </button>
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-[12px] font-semibold text-drivo-text-secondary mb-1.5 block">
      {children}
    </label>
  );
}

export default function BookingForm({
  initialServiceType = "standard",
  onPickupChange,
  onDropoffChange,
  onServiceTypeChange,
}: {
  initialServiceType?: ServiceType;
  onPickupChange?: (v: string) => void;
  onDropoffChange?: (v: string) => void;
  onServiceTypeChange?: (v: ServiceType) => void;
}) {
  const { t } = useLanguage();
  const [step, setStep] = useState<BookingStep>(1);
  const [serviceType, setServiceType] = useState<ServiceType>(initialServiceType);
  const [passengers, setPassengers] = useState(2);
  const [luggage, setLuggage] = useState<LuggageType>("none");
  const [smallBags, setSmallBags] = useState(0);
  const [largeBags, setLargeBags] = useState(0);
  const [wheelchair, setWheelchair] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card");
  const [cashAgreed, setCashAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [pickupAddress, setPickupAddress] = useState("");
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [pickupCoords, setPickupCoords] = useState<Coords | null>(null);
  const [dropoffCoords, setDropoffCoords] = useState<Coords | null>(null);
  const [locatingPickup, setLocatingPickup] = useState(false);

  const [rideMode, setRideMode] = useState<"now" | "schedule">("now");

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
  const [seniorPassenger, setSeniorPassenger] = useState(false);
  const [ztpCardHolder, setZtpCardHolder] = useState(false);
  const [wheelchairUser, setWheelchairUser] = useState(false);
  const [companionRequired, setCompanionRequired] = useState(false);
  const [medicalAppointment, setMedicalAppointment] = useState(false);
  const [waitingTimeRequired, setWaitingTimeRequired] = useState(false);
  const [assistanceLevel, setAssistanceLevel] = useState<AssistanceLevel>("");
  const [wheelchairType, setWheelchairType] = useState<WheelchairType>("");
  const [canTransferToSeat, setCanTransferToSeat] = useState<TransferToSeat>("");
  const [companionCount, setCompanionCount] = useState(1);
  const [hospitalName, setHospitalName] = useState("");
  const [department, setDepartment] = useState("");
  const [appointmentDate, setAppointmentDate] = useState("");
  const [appointmentTime, setAppointmentTime] = useState("");
  const [tripType, setTripType] = useState<MedicalTripType>("GO_ONLY");
  const [returnDate, setReturnDate] = useState("");
  const [returnTime, setReturnTime] = useState("");
  const [waitingDuration, setWaitingDuration] = useState<WaitingDuration>("");
  const [customWaitingDuration, setCustomWaitingDuration] = useState("");
  const [recurrence, setRecurrence] = useState<RecurrenceType>("ONE_TIME");
  const [recurrenceCustom, setRecurrenceCustom] = useState("");
  const [childFullName, setChildFullName] = useState("");
  const [childAge, setChildAge] = useState("");
  const [childSpecialRequirements, setChildSpecialRequirements] = useState("");
  const [childrenDetails, setChildrenDetails] = useState<ChildDetail[]>([
    createEmptyChild(),
    createEmptyChild(),
  ]);
  const [parentFullName, setParentFullName] = useState("");
  const [parentPrimaryPhone, setParentPrimaryPhone] = useState("");
  const [parentEmergencyPhone, setParentEmergencyPhone] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [educationalInstitutionName, setEducationalInstitutionName] = useState("");
  const [institutionSuggestionSelected, setInstitutionSuggestionSelected] = useState(false);

  const [bookingId, setBookingId] = useState("");
  const [bookingRef, setBookingRef] = useState("");
  const [devOtp, setDevOtp] = useState<string | undefined>(undefined);
  const [registrationProofToken, setRegistrationProofToken] = useState("");
  const [legacyPasswordSetupProofToken, setLegacyPasswordSetupProofToken] = useState("");
  const [proofExpiresAt, setProofExpiresAt] = useState("");
  const [registrationProofPhone, setRegistrationProofPhone] = useState("");
  const [authMode, setAuthMode] = useState<AuthMode>("idle");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [accountNeedsPhoneReverification, setAccountNeedsPhoneReverification] = useState(false);
  const [loginPassword, setLoginPassword] = useState("");
  const [loginAttemptId, setLoginAttemptId] = useState("");
  const [loginOtp, setLoginOtp] = useState("");
  const [rememberDevice, setRememberDevice] = useState(true);
  const [resetAttemptId, setResetAttemptId] = useState("");
  const [resetOtp, setResetOtp] = useState("");
  const [passwordResetProofToken, setPasswordResetProofToken] = useState("");
  const [passwordResetProofExpiresAt, setPasswordResetProofExpiresAt] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetConfirmPassword, setResetConfirmPassword] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [accountConfirmPassword, setAccountConfirmPassword] = useState("");
  const [showAccountPassword, setShowAccountPassword] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [estimatedPrice, setEstimatedPrice] = useState<number | undefined>();
  const [fareBreakdown, setFareBreakdown] = useState<FareBreakdown | null>(null);
  const [passengerProfile, setPassengerProfile] = useState<Record<string, unknown> | null>(null);
  const accountCreateInFlight = useRef(false);

  const clearPassengerAuthErrors = () => {
    setAuthError("");
    setError((current) => (isAuthenticationRequiredMessage(current) ? "" : current));
  };

  const markPassengerAuthenticated = (passenger: Record<string, unknown>) => {
    setPassengerProfile(passenger);
    setAuthMode("authenticated");
    setAuthError("");
    setError((current) => (isAuthenticationRequiredMessage(current) ? "" : current));
  };

  useEffect(() => {
    setServiceType(initialServiceType);
  }, [initialServiceType]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  useEffect(() => {
    const hasRequiredProof =
      authMode === "legacyPasswordSetup" ? legacyPasswordSetupProofToken : registrationProofToken;
    if (step === 4 && !hasRequiredProof && !accountNeedsPhoneReverification) {
      setAuthError("Phone verification is missing. Please verify your number again.");
      setAccountNeedsPhoneReverification(true);
    }
  }, [accountNeedsPhoneReverification, authMode, legacyPasswordSetupProofToken, registrationProofToken, step]);

  useEffect(() => {
    onServiceTypeChange?.(serviceType);
  }, [onServiceTypeChange, serviceType]);

  const today = useMemo(() => new Date().toISOString().split("T")[0], []);
  const assistedTransport = serviceType === "accessible";
  const quoteOnlyTransport = serviceType === "accessible" || serviceType === "senior";
  const activeCompanionCount = assistedTransport && companionRequired ? companionCount : 0;
  const capacityPassengerCount = passengers + activeCompanionCount;
  const luggageCount = smallBags + largeBags;
  const luggageUnits = smallBags + largeBags * 2;
  const largerVehicleRecommended =
    capacityPassengerCount > 4 ||
    (capacityPassengerCount >= 4 && largeBags > 0) ||
    (capacityPassengerCount >= 5 && luggageCount > 0) ||
    capacityPassengerCount + luggageUnits > 6;
  const wavRequired = assistedTransport && wheelchairUser && canTransferToSeat === "NO";
  const passengerRemainsInWheelchair = wavRequired;
  const showWaitingDuration = assistedTransport && (waitingTimeRequired || tripType === "WAIT_RETURN");
  const showMedicalReturnDetails = assistedTransport && (medicalAppointment || waitingTimeRequired);
  const contactStepNumber = showMedicalReturnDetails ? 6 : assistedTransport ? 5 : 4;
  const childrenTransport = serviceType === "children";
  const institutionAddress = dropoffAddress.trim();
  const currentBookingTime = useMemo(() => new Date().toTimeString().slice(0, 5), []);
  const estimateScheduledDate = childrenTransport || rideMode === "schedule" ? scheduledDate : today;
  const estimateScheduledTime = childrenTransport || rideMode === "schedule" ? scheduledTime : currentBookingTime;
  const estimateWaitingMinutes = showWaitingDuration
    ? waitingMinutesFromDuration(waitingDuration, customWaitingDuration)
    : 0;
  const selectedInstitutionName =
    educationalInstitutionName.trim() || getInstitutionName(institutionAddress);
  const activeChildrenDetails = useMemo(
    () => childrenDetails.slice(0, passengers),
    [childrenDetails, passengers]
  );
  const primaryChild = activeChildrenDetails[0] || createEmptyChild();

  const clearRegistrationProof = () => {
    setRegistrationProofToken("");
    setLegacyPasswordSetupProofToken("");
    setProofExpiresAt("");
    setRegistrationProofPhone("");
  };

  const requirePhoneReverification = (message: string) => {
    clearRegistrationProof();
    setAccountNeedsPhoneReverification(true);
    setAuthError(message);
    setError("");
  };

  const resetOtpAttemptState = () => {
    clearRegistrationProof();
    setAccountNeedsPhoneReverification(false);
    setAuthError("");
    setError("");
    setDevOtp(undefined);
    setResetAttemptId("");
    setResetOtp("");
    setPasswordResetProofToken("");
    setPasswordResetProofExpiresAt("");
  };
  const updateChildDetail = (index: number, patch: Partial<ChildDetail>) => {
    setChildrenDetails((current) =>
      current.map((child, childIndex) =>
        childIndex === index ? { ...child, ...patch } : child
      )
    );
  };

  useEffect(() => {
    const nextLuggage: LuggageType =
      largeBags > 0 ? "large" : smallBags > 0 ? "small" : "none";
    setLuggage(nextLuggage);
  }, [smallBags, largeBags]);

  const handleFareChange = useCallback((price: number, breakdown: FareBreakdown) => {
    setEstimatedPrice(price);
    setFareBreakdown(breakdown);
  }, []);

  useEffect(() => {
    if (!quoteOnlyTransport) return;
    setEstimatedPrice(undefined);
    setFareBreakdown(null);
  }, [quoteOnlyTransport]);

  useEffect(() => {
    if (!assistedTransport) {
      setWheelchair(false);
      setSeniorPassenger(false);
      setZtpCardHolder(false);
      setWheelchairUser(false);
      setCompanionRequired(false);
      setMedicalAppointment(false);
      setWaitingTimeRequired(false);
    }
  }, [assistedTransport]);

  useEffect(() => {
    if (childrenTransport && paymentMethod === "cash") {
      setPaymentMethod("card");
      setCashAgreed(false);
    }
  }, [childrenTransport, paymentMethod]);

  useEffect(() => {
    if (childrenTransport) {
      setSmallBags(0);
      setLargeBags(0);
      setLuggage("none");
    }
  }, [childrenTransport]);

  useEffect(() => {
    if (!childrenTransport) return;

    setChildrenDetails((current) => {
      const next = current.slice(0, passengers);
      while (next.length < passengers) {
        next.push(createEmptyChild());
      }
      return next;
    });
  }, [childrenTransport, passengers]);

  useEffect(() => {
    setChildFullName(primaryChild.fullName);
    setChildAge(primaryChild.age);
    setChildSpecialRequirements(primaryChild.specialRequirements);
  }, [primaryChild.fullName, primaryChild.age, primaryChild.specialRequirements]);

  useEffect(() => {
    if (!seniorPassenger) setAssistanceLevel("");
    if (!wheelchairUser) {
      setWheelchairType("");
      setCanTransferToSeat("");
    }
    if (!companionRequired) setCompanionCount(1);
    if (!medicalAppointment) {
      setHospitalName("");
      setDepartment("");
      setAppointmentDate("");
      setAppointmentTime("");
      setTripType("GO_ONLY");
      setReturnDate("");
      setReturnTime("");
    }
    if (!showWaitingDuration) {
      setWaitingDuration("");
      setCustomWaitingDuration("");
    }
  }, [seniorPassenger, wheelchairUser, companionRequired, medicalAppointment, showWaitingDuration]);
useEffect(() => {
  const draftRaw = localStorage.getItem("drivo_booking_draft");
  if (!draftRaw) return;

  try {
    const draft = JSON.parse(draftRaw);

    if (typeof draft.pickupAddress === "string") {
      setPickupAddress(draft.pickupAddress);
    }

    if (typeof draft.dropoffAddress === "string") {
      setDropoffAddress(draft.dropoffAddress);
    }

    if (typeof draft.passengers === "number") {
      setPassengers(Math.min(6, Math.max(1, draft.passengers)));
    }

    if (draft.rideMode === "now" || draft.rideMode === "schedule") {
      setRideMode(draft.rideMode);
    }

    if (typeof draft.scheduledDate === "string") {
      setScheduledDate(draft.scheduledDate);
    }

    if (typeof draft.scheduledTime === "string") {
      setScheduledTime(draft.scheduledTime);
    }
  } catch {
    localStorage.removeItem("drivo_booking_draft");
  }
}, []);

  useEffect(() => {
    fetch("/api/passenger/me", { cache: "no-store", credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data?.passenger) return;
        markPassengerAuthenticated(data.passenger);
        if (!customerName && data.passenger.fullName) {
          setCustomerName(data.passenger.fullName);
        }
        if (!customerEmail && data.passenger.email) {
          setCustomerEmail(data.passenger.email);
        }
        if (data.passenger.normalizedPhone || data.passenger.phone) {
          setRegistrationProofPhone(String(data.passenger.normalizedPhone || data.passenger.phone));
        }
      })
      .catch(() => {});
  }, []);

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

  const clearPasswordResetState = () => {
    setResetAttemptId("");
    setResetOtp("");
    setPasswordResetProofToken("");
    setPasswordResetProofExpiresAt("");
    setResetPassword("");
    setResetConfirmPassword("");
  };

  const sendBookingOtp = async (
    activeBookingId: string,
    phone: string,
    purpose: "PASSENGER_REGISTRATION" | "PASSENGER_LEGACY_PASSWORD_SETUP"
  ) => {
    const otpRes = await fetch("/api/otp/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        bookingId: activeBookingId,
        phone,
        purpose,
      }),
    });

    const otpData = await safeJson(otpRes);
    if (!otpRes.ok) {
      throw new Error(readError(otpData, "OTP send failed"));
    }

    if (isRecord(otpData) && typeof otpData.devOtp === "string") {
      setDevOtp(otpData.devOtp);
    }
  };

  const resolvePassengerPhone = async (activeBookingId: string, phone: string) => {
    const res = await fetch("/api/passenger/auth/resolve-phone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ bookingId: activeBookingId, phone }),
    });
    const data = await safeJson(res);
    if (!res.ok) {
      throw new Error(readError(data, "Could not check phone number. Please try again."));
    }
    if (!isRecord(data) || data.success !== true || typeof data.mode !== "string") {
      throw new Error("Could not check phone number. Please try again.");
    }
    return data;
  };

  const coordsFromSuggestion = (suggestion?: { lat?: number; lng?: number }): Coords | null => {
    const lat = Number(suggestion?.lat);
    const lng = Number(suggestion?.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
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
          ? data.suggestionItems ||
            data.results ||
            data.addresses ||
            data.items ||
            data.suggestions ||
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

  const useCurrentPickupLocation = () => {
    if (!navigator.geolocation) {
      setError("Location is not supported on this device.");
      return;
    }

    setLocatingPickup(true);
    setError("");

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;

        setPickupCoords({
          lat: latitude,
          lng: longitude,
        });

        try {
          const res = await fetch(
            `/api/addresses/reverse?lat=${latitude}&lng=${longitude}`,
            { cache: "no-store" }
          );

          const data = await safeJson(res);

          if (isRecord(data) && typeof data.address === "string") {
            setPickupAddress(data.address);
            onPickupChange?.(data.address);
          } else {
            const coordsText = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
            setPickupAddress(coordsText);
            onPickupChange?.(coordsText);
          }
        } catch {
          const coordsText = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
          setPickupAddress(coordsText);
          onPickupChange?.(coordsText);
        } finally {
          setLocatingPickup(false);
        }
      },
      () => {
        setLocatingPickup(false);
        setError("Please allow location permission.");
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

  const validateForm = () => {
    const trimmedEmail = customerEmail.trim();

    if (pickupAddress.trim().length < 3) return "Pickup address is required.";
    if (dropoffAddress.trim().length < 3) return "Drop-off address is required.";
   if (rideMode === "schedule") {
  if (!scheduledDate) return "Please select date.";
  if (!scheduledTime) return "Please select time.";
  if (scheduledDate < today) return "Past date is not allowed.";
}
    if (customerName.trim().length < 2) return "Customer name is required.";
    if (!trimmedEmail) return "Customer email is required.";
    if (!isValidEmail(trimmedEmail)) return "Valid email address is required.";
    if (customerPhone.trim().length < 6) return "Valid phone number is required.";
    if (capacityPassengerCount > 6) return "Maximum 6 passengers including companions allowed.";
    if (capacityPassengerCount >= 6 && luggageCount > 0) {
      return "For 6 passengers with luggage, please reduce to 5 passengers or use tourism/airport transfer option.";
    }
    if (assistedTransport && seniorPassenger && !assistanceLevel) return "Please select assistance level.";
    if (assistedTransport && wheelchairUser && !wheelchairType) return "Please select wheelchair type.";
    if (assistedTransport && wheelchairUser && !canTransferToSeat) return "Please confirm if the passenger can transfer to a vehicle seat.";
    if (assistedTransport && companionRequired && companionCount < 1) return "Please select number of companions.";
    if (assistedTransport && medicalAppointment) {
      if (!hospitalName.trim()) return "Hospital or clinic name is required.";
      if (!department.trim()) return "Department is required.";
      if (!appointmentDate) return "Appointment date is required.";
      if (!appointmentTime) return "Appointment time is required.";
      if (tripType === "GO_RETURN" && (!returnDate || !returnTime)) {
        return "Return date and time are required.";
      }
    }
    if (showWaitingDuration && !waitingDuration) return "Please select waiting duration.";
    if (waitingDuration === "CUSTOM" && !customWaitingDuration.trim()) {
      return "Please enter custom waiting duration.";
    }
    if (childrenTransport) {
      if (!institutionSuggestionSelected) {
        return t(
          "booking.childrenInstitutionValidation",
          "Please select a verified educational institution."
        );
      }
      const destinationText = `${dropoffAddress} ${educationalInstitutionName}`.toLowerCase();
      const educationDestination = ["school", "college", "university", "educational", "education", "training", "institute", "skola", "škola", "gymnasium", "academy"].some((term) =>
        destinationText.includes(term)
      );

      if (!scheduledDate || !scheduledTime) return "Pickup date and time are required for children's transport.";
      if (!recurrence) return "Please select recurrence.";
      if (recurrence === "CUSTOM" && !recurrenceCustom.trim()) return "Please enter custom recurrence.";
      for (let index = 0; index < activeChildrenDetails.length; index += 1) {
        const child = activeChildrenDetails[index];
        if (!child.fullName.trim()) return `Child ${index + 1} full name is required.`;
        if (!child.age.trim()) return `Child ${index + 1} age is required.`;
        const age = Number(child.age);
        if (!Number.isFinite(age) || age < 0 || age > 18) {
          return `Child ${index + 1} age must be between 0 and 18.`;
        }
      }
      if (!parentFullName.trim()) return "Parent full name is required.";
      if (!parentPrimaryPhone.trim()) return "Parent primary phone is required.";
      if (!parentEmail.trim() || !isValidEmail(parentEmail.trim())) return "Valid parent email is required.";
      if (!institutionSuggestionSelected && !educationDestination) {
        return t(
          "booking.childrenInstitutionValidation",
          "Please select a verified school, college, university, or approved educational institution."
        );
      }
      if (paymentMethod === "cash") return "Cash is not available for children's scheduled transport.";
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
      const trimmedEmail = customerEmail.trim();
      if (trimmedEmail !== customerEmail) {
        setCustomerEmail(trimmedEmail);
      }
      const resolvedPickupCoords =
        pickupCoords || (await resolveAddressCoords(pickupAddress));
      const resolvedDropoffCoords =
        dropoffCoords || (await resolveAddressCoords(dropoffAddress));

      if (resolvedPickupCoords) setPickupCoords(resolvedPickupCoords);
      if (resolvedDropoffCoords) setDropoffCoords(resolvedDropoffCoords);
      const childrenPayload = activeChildrenDetails.map((child) => ({
        fullName: child.fullName.trim(),
        age: Number(child.age),
        specialRequirements: child.specialRequirements.trim() || null,
      }));
      const firstChild = childrenPayload[0];

      const bookingRes = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        credentials: "include",
        body: JSON.stringify({
          serviceType: serviceMap[serviceType],
          pickupAddress: pickupAddress.trim(),
          dropoffAddress: dropoffAddress.trim(),
          pickupLat: resolvedPickupCoords?.lat ?? null,
          pickupLng: resolvedPickupCoords?.lng ?? null,
          dropoffLat: resolvedDropoffCoords?.lat ?? null,
          dropoffLng: resolvedDropoffCoords?.lng ?? null,
          scheduledDate: childrenTransport || rideMode === "schedule" ? scheduledDate : today,
scheduledTime:
  childrenTransport || rideMode === "schedule"
    ? scheduledTime
    : new Date().toTimeString().slice(0, 5),
          passengerCount: passengers,
          luggageType: luggageMap[luggage],
          smallBags,
          largeBags,
          wheelchairNeeded: assistedTransport && (wheelchair || wheelchairUser),
          seniorPassenger: assistedTransport && seniorPassenger,
          ztpCardHolder: assistedTransport && ztpCardHolder,
          wheelchairUser: assistedTransport && wheelchairUser,
          companionRequired: assistedTransport && companionRequired,
          medicalAppointment: assistedTransport && medicalAppointment,
          waitingTimeRequired: assistedTransport && waitingTimeRequired,
          assistanceLevel: assistedTransport ? assistanceLevel || null : null,
          wheelchairType: assistedTransport ? wheelchairType || null : null,
          canTransferToSeat:
            !assistedTransport
              ? null
              : canTransferToSeat === "YES"
              ? true
              : canTransferToSeat === "NO"
              ? false
              : null,
          wavRequired,
          passengerRemainsInWheelchair,
          companionCount: activeCompanionCount,
          hospitalName: assistedTransport && medicalAppointment ? hospitalName.trim() || null : null,
          department: assistedTransport && medicalAppointment ? department.trim() || null : null,
          appointmentDate: assistedTransport && medicalAppointment ? appointmentDate || null : null,
          appointmentTime: assistedTransport && medicalAppointment ? appointmentTime || null : null,
          tripType: assistedTransport && medicalAppointment ? tripType : null,
          returnDate: childrenTransport || (assistedTransport && (medicalAppointment || waitingTimeRequired)) ? returnDate || null : null,
          returnTime: childrenTransport || (assistedTransport && (medicalAppointment || waitingTimeRequired)) ? returnTime || null : null,
          waitingDuration: showWaitingDuration ? waitingDuration || null : null,
          customWaitingDuration: showWaitingDuration ? customWaitingDuration.trim() || null : null,
          scheduledRide: childrenTransport,
          recurrence: childrenTransport ? recurrence : null,
          recurrenceType: childrenTransport ? recurrence : null,
          recurrenceCustom: recurrenceCustom.trim() || null,
          childrenDetails: childrenTransport ? childrenPayload : null,
          childFullName: childrenTransport ? firstChild?.fullName || null : null,
          childName: childrenTransport ? firstChild?.fullName || null : null,
          childAge: childrenTransport && firstChild ? firstChild.age : null,
          childSpecialRequirements: childrenTransport ? firstChild?.specialRequirements || null : null,
          parentFullName: parentFullName.trim() || null,
          guardianName: parentFullName.trim() || null,
          parentPrimaryPhone: parentPrimaryPhone.trim() || null,
          guardianPhone: parentPrimaryPhone.trim() || null,
          parentEmergencyPhone: parentEmergencyPhone.trim() || null,
          guardianEmergencyPhone: parentEmergencyPhone.trim() || null,
          parentEmail: parentEmail.trim() || null,
          guardianEmail: parentEmail.trim() || null,
          educationalInstitutionName: childrenTransport ? selectedInstitutionName || null : null,
          institutionName: childrenTransport ? selectedInstitutionName || null : null,
          institutionAddress: childrenTransport ? institutionAddress || null : null,
          pickupDate: childrenTransport ? scheduledDate || null : null,
          pickupTime: childrenTransport ? scheduledTime || null : null,
          educationalDestinationValidated: childrenTransport ? institutionSuggestionSelected : false,
          flightNumber: flightNumber.trim() || null,
          airline: airline.trim() || null,
          waitAndGreet,
          customerName: customerName.trim(),
          customerEmail: trimmedEmail,
          customerPhone: customerPhone.trim(),
          customerPhoneCode: phoneCode,
          languagePref,
          specialNotes: specialNotes.trim() || null,
          paymentMethod: paymentMap[paymentMethod],
          cashAgreed,
          estimatedPrice: estimatedPrice ?? null,
          fareBreakdown,
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
      resetOtpAttemptState();

      const price = Number(bookingData.estimatedPrice);
      if (Number.isFinite(price)) {
        setEstimatedPrice(price);
      }

      if (passengerProfile) {
        setAuthMode("authenticated");
        await continueAuthenticatedBooking(passengerProfile, newBookingId);
        return;
      }

      const submittedPhone = phoneCode + customerPhone.trim();
      setAuthMode("checkingPhone");
      const phoneState = await resolvePassengerPhone(newBookingId, submittedPhone);
      const normalizedPhone =
        typeof phoneState.normalizedPhone === "string" ? phoneState.normalizedPhone : submittedPhone;
      setRegistrationProofPhone(normalizedPhone);

      if (phoneState.mode === "LOGIN") {
        clearRegistrationProof();
        setRegistrationProofPhone(normalizedPhone);
        clearPasswordResetState();
        setLoginPassword("");
        setAuthError("This phone already has a Drivo account. Please log in to continue.");
        setAuthMode("existingAccountLogin");
        return;
      }

      if (phoneState.mode === "LEGACY_SETUP") {
        await sendBookingOtp(newBookingId, normalizedPhone, "PASSENGER_LEGACY_PASSWORD_SETUP");
        setAuthMode("legacyPasswordSetupOtp");
        setStep(2);
        return;
      }

      await sendBookingOtp(newBookingId, normalizedPhone, "PASSENGER_REGISTRATION");
      setAuthMode("registrationOtp");
      setStep(2);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      if (isAuthenticationRequiredMessage(message)) {
        setAuthError("Please log in or verify your phone to continue.");
        setError("");
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOTPVerify = async (otpCode: string) => {
    setError("");

    const purpose =
      authMode === "legacyPasswordSetupOtp" || authMode === "legacyPasswordSetup"
        ? "PASSENGER_LEGACY_PASSWORD_SETUP"
        : "PASSENGER_REGISTRATION";

    const res = await fetch("/api/otp/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ bookingId, otpCode, purpose }),
    });

    const data = await safeJson(res);

    if (!res.ok) {
      const code = readCode(data);
      if (code === "ACCOUNT_EXISTS_LOGIN_REQUIRED") {
        clearRegistrationProof();
        setAuthMode("existingAccountLogin");
        setStep(1);
        setAuthError("This phone already has a Drivo account. Please log in or reset your password.");
        return;
      }
      if (code === "LEGACY_SETUP_REQUIRED") {
        clearRegistrationProof();
        setAuthMode("legacyPasswordSetupOtp");
        setStep(1);
        setAuthError("Please verify your phone and create a password to continue.");
        return;
      }
      throw new Error(otpVerifyMessage(data, "OTP verification failed"));
    }

    if (!isRecord(data)) {
      throw new Error("Verification response was invalid");
    }

    if (typeof data.bookingId === "string" && data.bookingId !== bookingId) {
      throw new Error("Verification could not be completed. Please request a new code.");
    }

    const normalizedPhone =
      typeof data.normalizedPhone === "string" ? data.normalizedPhone : phoneCode + customerPhone.trim();
    setRegistrationProofPhone(normalizedPhone);
    setProofExpiresAt(typeof data.proofExpiresAt === "string" ? data.proofExpiresAt : "");
    setAccountNeedsPhoneReverification(false);
    setAuthError("");
    if (typeof data.email === "string" && data.email && !customerEmail) {
      setCustomerEmail(data.email);
    }

    if (purpose === "PASSENGER_LEGACY_PASSWORD_SETUP") {
      const nextLegacyProofToken =
        typeof data.legacyPasswordSetupProofToken === "string" ? data.legacyPasswordSetupProofToken : "";
      if (data.success !== true || !nextLegacyProofToken) {
        throw new Error("Verification could not be completed. Please request a new code.");
      }
      setRegistrationProofToken("");
      setLegacyPasswordSetupProofToken(nextLegacyProofToken);
      setAuthMode("legacyPasswordSetup");
      setStep(4);
      return;
    }

    const nextRegistrationProofToken =
      typeof data.registrationProofToken === "string" ? data.registrationProofToken : "";

    if (data.success !== true || !nextRegistrationProofToken) {
      throw new Error("Verification could not be completed. Please request a new code.");
    }

    setLegacyPasswordSetupProofToken("");
    setRegistrationProofToken(nextRegistrationProofToken);
    setAuthMode("createAccount");
    setStep(4);
  };

  const continueAuthenticatedBooking = async (
    passenger?: Record<string, unknown> | null,
    activeBookingId = bookingId
  ) => {
    if (passenger) {
      markPassengerAuthenticated(passenger);
    } else {
      clearPassengerAuthErrors();
      setAuthMode("authenticated");
    }

    if (!activeBookingId) {
      return;
    }

    const res = await fetch("/api/passenger/booking/continue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      credentials: "include",
      body: JSON.stringify({ bookingId: activeBookingId }),
    });
    const data = await safeJson(res);
    if (!res.ok) {
      const message = readCode(data) === "AUTHENTICATION_REQUIRED"
        ? authRequiredMessage(data)
        : readError(data, "Could not continue booking");
      if (isAuthenticationRequiredMessage(message)) {
        setAuthError(message);
        setError((current) => (isAuthenticationRequiredMessage(current) ? "" : current));
      }
      throw new Error(message);
    }
    clearPassengerAuthErrors();
    setStep(3);
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (authLoading || accountCreateInFlight.current) return;
    setAuthError("");

    if (accountPassword !== accountConfirmPassword) {
      setAuthError(t("passenger.passwordMismatch", "Passwords do not match."));
      return;
    }

    const isLegacySetup = authMode === "legacyPasswordSetup";
    const activeProofToken = isLegacySetup ? legacyPasswordSetupProofToken : registrationProofToken;

    if (!activeProofToken) {
      requirePhoneReverification("Phone verification is missing. Please verify your number again.");
      return;
    }

    if (proofExpiresAt && new Date(proofExpiresAt).getTime() <= Date.now()) {
      requirePhoneReverification("Phone verification expired. Please verify again.");
      return;
    }

    accountCreateInFlight.current = true;
    setAuthLoading(true);
    try {
      const res = await fetch("/api/passenger/account/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        credentials: "include",
        body: JSON.stringify({
          bookingId,
          registrationProofToken: isLegacySetup ? "" : registrationProofToken,
          legacyPasswordSetupProofToken: isLegacySetup ? legacyPasswordSetupProofToken : "",
          authMode: isLegacySetup ? "LEGACY_SETUP" : "REGISTER",
          phone: registrationProofPhone || phoneCode + customerPhone.trim(),
          fullName: customerName.trim(),
          email: customerEmail.trim(),
          password: accountPassword,
          confirmPassword: accountConfirmPassword,
          rememberDevice,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        const code = readCode(data);
        if (code === "ACCOUNT_EXISTS_LOGIN_REQUIRED") {
          clearRegistrationProof();
          setAuthMode("existingAccountLogin");
          setStep(1);
          setAuthError("This phone already has a Drivo account. Please log in or reset your password.");
          return;
        }
        if (code === "LEGACY_SETUP_REQUIRED") {
          clearRegistrationProof();
          setAuthMode("legacyPasswordSetupOtp");
          setStep(1);
          setAuthError("Please verify your phone and create a password to continue.");
          return;
        }
        if (code.startsWith("PROOF_")) {
          requirePhoneReverification(proofFailureMessage(code, readError(data, "Phone verification could not be confirmed. Please verify again.")));
          return;
        }
        setAuthError(readError(data, "Could not create account"));
        return;
      }
      clearPassengerAuthErrors();
      await continueAuthenticatedBooking(isRecord(data) && isRecord(data.passenger) ? data.passenger : null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not create account";
      setAuthError(message);
    } finally {
      accountCreateInFlight.current = false;
      setAuthLoading(false);
    }
  };

  const handlePassengerLogin = async (e: React.FormEvent | React.MouseEvent) => {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);

    try {
      const activeBookingId = bookingId;
      const res = await fetch("/api/passenger/login/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        credentials: "include",
        body: JSON.stringify({
          phone: registrationProofPhone || phoneCode + customerPhone.trim(),
          password: loginPassword,
          bookingId: activeBookingId || null,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(readError(data, "Phone number or password is incorrect."));

      if (isRecord(data) && data.stepUpRequired) {
        setLoginAttemptId(String(data.loginAttemptId || ""));
        if (typeof data.devOtp === "string") setDevOtp(data.devOtp);
        setAuthMode("loginStepUp");
        return;
      }

      clearPassengerAuthErrors();
      await continueAuthenticatedBooking(isRecord(data) && isRecord(data.passenger) ? data.passenger : null, activeBookingId);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Phone number or password is incorrect.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLoginStepUp = async (e: React.FormEvent | React.MouseEvent) => {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);

    try {
      const res = await fetch("/api/passenger/login/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        credentials: "include",
        body: JSON.stringify({
          phone: registrationProofPhone || phoneCode + customerPhone.trim(),
          otpCode: loginOtp,
          loginAttemptId,
          bookingId: bookingId || null,
          rememberDevice,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(readError(data, "Could not verify login."));
      clearPassengerAuthErrors();
      await continueAuthenticatedBooking(isRecord(data) && isRecord(data.passenger) ? data.passenger : null);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Could not verify login.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleForgotSend = async (e: React.FormEvent | React.MouseEvent) => {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);

    try {
      const res = await fetch("/api/passenger/password-reset/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ phone: registrationProofPhone || phoneCode + customerPhone.trim() }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(readError(data, "Could not send reset code."));
      if (isRecord(data)) {
        setResetAttemptId(String(data.resetAttemptId || ""));
        setResetOtp("");
        setPasswordResetProofToken("");
        setPasswordResetProofExpiresAt("");
        if (typeof data.devOtp === "string") setDevOtp(data.devOtp);
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Could not send reset code.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleForgotVerify = async (e: React.FormEvent | React.MouseEvent) => {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);

    try {
      const res = await fetch("/api/passenger/password-reset/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          phone: registrationProofPhone || phoneCode + customerPhone.trim(),
          otpCode: resetOtp,
          resetAttemptId,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(readError(data, "Could not verify reset code."));
      if (isRecord(data) && typeof data.passwordResetProofToken === "string") {
        setPasswordResetProofToken(data.passwordResetProofToken);
        setPasswordResetProofExpiresAt(typeof data.proofExpiresAt === "string" ? data.proofExpiresAt : "");
        if (typeof data.normalizedPhone === "string") setRegistrationProofPhone(data.normalizedPhone);
        setAuthMode("resetPassword");
      } else {
        throw new Error("Could not verify reset code.");
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Could not verify reset code.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleResetComplete = async (e: React.FormEvent | React.MouseEvent) => {
    e.preventDefault();
    setAuthError("");
    if (!passwordResetProofToken) {
      setAuthError("Password reset expired. Please request a new code.");
      setAuthMode("forgotPasswordOtp");
      return;
    }
    if (passwordResetProofExpiresAt && new Date(passwordResetProofExpiresAt).getTime() <= Date.now()) {
      setAuthError("Password reset expired. Please request a new code.");
      setPasswordResetProofToken("");
      setAuthMode("forgotPasswordOtp");
      return;
    }
    if (resetPassword !== resetConfirmPassword) {
      setAuthError(t("passenger.passwordMismatch", "Passwords do not match."));
      return;
    }
    setAuthLoading(true);

    try {
      const res = await fetch("/api/passenger/password-reset/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        credentials: "include",
        body: JSON.stringify({
          phone: registrationProofPhone || phoneCode + customerPhone.trim(),
          passwordResetProofToken,
          resetAttemptId,
          bookingId: bookingId || null,
          password: resetPassword,
          confirmPassword: resetConfirmPassword,
          rememberDevice,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(readError(data, "Password reset could not be completed."));
      clearPassengerAuthErrors();
      await continueAuthenticatedBooking(isRecord(data) && isRecord(data.passenger) ? data.passenger : null);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Password reset could not be completed.");
    } finally {
      setAuthLoading(false);
    }
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
        phone={registrationProofPhone || phoneCode + customerPhone}
        purpose={
          authMode === "legacyPasswordSetupOtp" || authMode === "legacyPasswordSetup"
            ? "PASSENGER_LEGACY_PASSWORD_SETUP"
            : "PASSENGER_REGISTRATION"
        }
        devOtp={devOtp}
        initialError={error}
        onResendStart={resetOtpAttemptState}
        onResendSuccess={(data) => {
          if (typeof data.devOtp === "string") setDevOtp(data.devOtp);
        }}
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
        passengerProfile={passengerProfile}
        bookingData={{
          serviceType,
          pickupAddress,
          dropoffAddress,
          scheduledDate,
          scheduledTime,
          passengerCount: passengers,
          luggageType: luggage,
          smallBags,
          largeBags,
          wheelchairNeeded: assistedTransport && (wheelchair || wheelchairUser),
          seniorPassenger: assistedTransport && seniorPassenger,
          ztpCardHolder: assistedTransport && ztpCardHolder,
          wheelchairUser: assistedTransport && wheelchairUser,
          companionRequired: assistedTransport && companionRequired,
          medicalAppointment: assistedTransport && medicalAppointment,
          waitingTimeRequired: assistedTransport && waitingTimeRequired,
          assistanceLevel: assistedTransport ? assistanceLevel : "",
          wheelchairType: assistedTransport ? wheelchairType : "",
          canTransferToSeat: assistedTransport ? canTransferToSeat : "",
          wavRequired,
          passengerRemainsInWheelchair,
          companionCount: activeCompanionCount,
          hospitalName: assistedTransport && medicalAppointment ? hospitalName : "",
          department: assistedTransport && medicalAppointment ? department : "",
          appointmentDate: assistedTransport && medicalAppointment ? appointmentDate : "",
          appointmentTime: assistedTransport && medicalAppointment ? appointmentTime : "",
          tripType: assistedTransport && medicalAppointment ? tripType : "",
          returnDate: childrenTransport || (assistedTransport && (medicalAppointment || waitingTimeRequired)) ? returnDate : "",
          returnTime: childrenTransport || (assistedTransport && (medicalAppointment || waitingTimeRequired)) ? returnTime : "",
          waitingDuration: showWaitingDuration ? waitingDuration : "",
          customWaitingDuration: showWaitingDuration ? customWaitingDuration : "",
          scheduledRide: childrenTransport,
          recurrence,
          recurrenceType: recurrence,
          recurrenceCustom,
          childrenDetails: activeChildrenDetails,
          childFullName: primaryChild.fullName,
          childName: primaryChild.fullName,
          childAge: primaryChild.age,
          childSpecialRequirements: primaryChild.specialRequirements,
          parentFullName,
          guardianName: parentFullName,
          parentPrimaryPhone,
          guardianPhone: parentPrimaryPhone,
          parentEmergencyPhone,
          guardianEmergencyPhone: parentEmergencyPhone,
          parentEmail,
          guardianEmail: parentEmail,
          educationalInstitutionName: childrenTransport ? selectedInstitutionName : educationalInstitutionName,
          institutionName: childrenTransport ? selectedInstitutionName : educationalInstitutionName,
          institutionAddress,
          pickupDate: scheduledDate,
          pickupTime: scheduledTime,
          flightNumber,
          waitAndGreet,
          customerName,
          customerPhone: phoneCode + customerPhone,
          customerEmail,
          paymentMethod,
          specialNotes,
          estimatedPrice,
          fareBreakdown,
          bookingRef,
          status: "VERIFIED",
        }}
      />
    );
  }

  if (step === 4) {
    return (
      <div className="max-w-md mx-auto px-4 py-8 md:py-16">
        <form onSubmit={handleCreateAccount} className="card">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-drivo-green-light text-2xl">
              ✓
            </div>
            <h2 className="text-[22px] font-bold text-drivo-text">
              {authMode === "legacyPasswordSetup"
                ? t("passenger.createPasswordTitle", "Create a password to continue")
                : t("passenger.createAccountTitle", "Create your Drivo account")}
            </h2>
            <p className="mt-2 text-[14px] text-drivo-text-secondary">
              {authMode === "legacyPasswordSetup"
                ? t("passenger.legacyPasswordSetupDesc", "Your phone number has been verified. Create a password for your existing Drivo account.")
                : t(
                    "passenger.createAccountDesc",
                    "Your phone number has been verified. Create a password so your future bookings are faster."
                  )}
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <FieldLabel>{t("booking.phone")}</FieldLabel>
              <input className="input bg-drivo-bg-soft" value={phoneCode + customerPhone} readOnly />
            </div>

            <div>
              <FieldLabel>{t("booking.email")}</FieldLabel>
              <input
                className="input"
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                required
              />
            </div>

            <PasswordInput
              label={t("passenger.password")}
              value={accountPassword}
              onChange={setAccountPassword}
              visible={showAccountPassword}
              onToggle={() => setShowAccountPassword((current) => !current)}
            />
            <PasswordInput
              label={t("passenger.confirmPassword", "Confirm password")}
              value={accountConfirmPassword}
              onChange={setAccountConfirmPassword}
              visible={showAccountPassword}
              onToggle={() => setShowAccountPassword((current) => !current)}
            />

            <p className="text-[12px] text-drivo-text-secondary">
              {t("passenger.passwordGuidance", "Use at least 12 characters. Spaces and passphrases are allowed.")}
            </p>

            <label className="flex items-center gap-2 text-[13px] font-semibold text-drivo-text-secondary">
              <input
                type="checkbox"
                checked={rememberDevice}
                onChange={(e) => setRememberDevice(e.target.checked)}
              />
              {t("passenger.rememberDevice", "Remember this device")}
            </label>

            {authError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-[13px] font-semibold text-red-700">
                {authError}
              </div>
            )}

            {accountNeedsPhoneReverification && (
              <button
                type="button"
                className="btn-secondary w-full"
                onClick={() => {
                  setError("");
                  setStep(2);
                }}
              >
                {t("passenger.verifyPhoneAgain", "Verify phone again")}
              </button>
            )}

            <button type="submit" className="btn-primary w-full" disabled={authLoading || accountNeedsPhoneReverification}>
              {authLoading
                ? t("passenger.saving")
                : authMode === "legacyPasswordSetup"
                  ? t("passenger.savePasswordContinue", "Save Password & Continue Booking")
                  : t("passenger.createAccountContinue", "Create Account & Continue Booking")}
            </button>
          </div>
        </form>
      </div>
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

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {serviceOptions.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => {
                if (serviceType !== s.value) {
                  setError("");
                }
                if (serviceType === "children" && s.value !== "children") {
                  setEducationalInstitutionName("");
                  setInstitutionSuggestionSelected(false);
                }
                setServiceType(s.value);
                setWheelchair(s.value === "accessible");
                if (s.value === "accessible") {
                  setSeniorPassenger(true);
                }
                if (s.value === "children") {
                  setRideMode("schedule");
                  setPaymentMethod("card");
                  setCashAgreed(false);
                }
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
            <div className="relative">
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
                noResultsText={t("booking.noMatchingAddress", "No matching address found.")}
                onSelect={(_, suggestion) => {
                  const coords = coordsFromSuggestion(suggestion);
                  if (coords) setPickupCoords(coords);
                }}
              />

              <button
                type="button"
                onClick={useCurrentPickupLocation}
                className="absolute right-3 top-[38px] z-10 rounded-full bg-white px-2 py-1 text-[13px] font-semibold text-drivo-green shadow-sm hover:bg-drivo-green-light"
                aria-label="Use current location"
                title="Use current location"
              >
                {locatingPickup ? "..." : "📍"}
              </button>
            </div>

            <AddressAutocomplete
              id="dropoff"
              label={
                childrenTransport
                  ? t("booking.schoolInstitution", "School / College / University *")
                  : `Destination: ${t("booking.dropoff")} *`
              }
              value={dropoffAddress}
              onChange={(v) => {
                setDropoffAddress(v);
                setDropoffCoords(null);
                if (childrenTransport) {
                  setEducationalInstitutionName(getInstitutionName(v));
                  setInstitutionSuggestionSelected(false);
                }
                onDropoffChange?.(v);
              }}
              onSelect={(v, suggestion) => {
                const coords = coordsFromSuggestion(suggestion);
                if (coords) setDropoffCoords(coords);
                if (childrenTransport) {
                  setEducationalInstitutionName(suggestion?.mainText || getInstitutionName(v));
                  setInstitutionSuggestionSelected(true);
                }
              }}
              placeholder={
                childrenTransport
                  ? t("booking.searchEducationalInstitution", "Search educational institution")
                  : t("booking.dropoffPlaceholder")
              }
              educationalOnly={childrenTransport}
              noResultsText={
                childrenTransport
                  ? t("booking.noVerifiedInstitution", "No verified educational institution found.")
                  : t("booking.noMatchingAddress", "No matching address found.")
              }
            />

            {childrenTransport && (
              <div className="space-y-3">
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-[13px] text-amber-800">
                  {t(
                    "booking.childrenInstitutionValidation",
                    "Please select a verified educational institution."
                  )}
                </div>
                {institutionAddress && (
                  <div className="rounded-2xl border border-drivo-border bg-white p-4 text-[13px]">
                    <div className="font-bold text-drivo-text">
                      {t("booking.institutionSummary", "Institution")}
                    </div>
                    <div className="mt-2 grid gap-1 text-drivo-text-secondary">
                      <span>
                        {t("booking.institutionName", "Institution name")}: {" "}
                        <strong className="text-drivo-text">{selectedInstitutionName || "N/A"}</strong>
                      </span>
                      <span>
                        {t("booking.institutionAddress", "Full address")}: {" "}
                        <strong className="text-drivo-text">{institutionAddress}</strong>
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {!childrenTransport && pickupAddress && dropoffAddress && (
              <PriceEstimate
                pickupAddress={pickupAddress}
                dropoffAddress={dropoffAddress}
                serviceType={serviceType}
                passengerCount={passengers}
                returnDate={childrenTransport ? returnDate : ""}
                returnTime={childrenTransport ? returnTime : ""}
                recurrenceType={childrenTransport ? recurrence : "ONE_TIME"}
                recurrenceCustom={childrenTransport ? recurrenceCustom : ""}
                scheduledDate={estimateScheduledDate}
                scheduledTime={estimateScheduledTime}
                waitAndGreet={waitAndGreet}
                waitingMinutes={estimateWaitingMinutes}
                onPriceChange={setEstimatedPrice}
                onFareChange={handleFareChange}
              />
            )}

{!childrenTransport && (
<div className="mb-5 grid grid-cols-2 gap-2 sm:gap-3">
  <button
    type="button"
    onClick={() => setRideMode("now")}
    className={`flex min-h-[74px] items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-center text-sm font-semibold leading-tight transition sm:min-h-0 sm:p-4 ${
      rideMode === "now"
        ? "bg-drivo-green text-white border-drivo-green"
        : "bg-white border-gray-200 text-gray-700"
    }`}
  >
    ⚡ {t("booking.rideNow")}
  </button>

  <button
    type="button"
    onClick={() => setRideMode("schedule")}
    className={`flex min-h-[74px] items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-center text-sm font-semibold leading-tight transition sm:min-h-0 sm:p-4 ${
      rideMode === "schedule"
        ? "bg-drivo-green text-white border-drivo-green"
        : "bg-white border-gray-200 text-gray-700"
    }`}
  >
    📅 {t("booking.scheduleRide")}
  </button>
</div>
)}

            {!childrenTransport && rideMode === "schedule" && (
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
        )}
        </div>
        </div>
            
        <div className="card">
          <div className="flex items-center gap-3 mb-5">
            <span className="w-9 h-9 bg-drivo-green-light rounded-xl flex items-center justify-center text-[14px] font-bold text-drivo-green-dark">
              3
            </span>
            <div>
              <h3 className="font-bold text-drivo-text text-[16px]">
                {childrenTransport
                  ? t("booking.numberOfChildren", "Number of Children")
                  : `${t("booking.passengers")} & ${t("booking.luggage")}`}
              </h3>
              <p className="text-[12px] text-drivo-text-muted">
                {t("booking.vehicleMatching", "Vehicle matching")}
              </p>
            </div>
          </div>

          <div className="space-y-5">
            <PassengerCounter
              value={passengers}
              onChange={setPassengers}
              max={childrenTransport ? 6 : undefined}
              label={childrenTransport ? t("booking.numberOfChildren", "Number of Children") : undefined}
            />

            {!childrenTransport && (
            <div className="grid sm:grid-cols-2 gap-4">
              <CounterControl
                label={`🧳 ${t("booking.smallBags", "Small bags")}`}
                value={smallBags}
                onChange={setSmallBags}
              />
              <CounterControl
                label={`🧳 ${t("booking.largeBags", "Large bags")}`}
                value={largeBags}
                onChange={setLargeBags}
              />
            </div>
            )}

            {!childrenTransport && (
            <div className="rounded-2xl bg-drivo-bg-soft p-4 text-[13px] text-drivo-text-secondary">
              {t("booking.capacitySummary", "Capacity")}:
              <span className="font-bold text-drivo-text">
                {" "}
                {capacityPassengerCount}/6 {t("booking.passengers").toLowerCase()}
              </span>
              {luggageCount > 0 && (
                <span>
                  {" "}
                  · {smallBags} {t("booking.smallBags", "small bags")}, {largeBags}{" "}
                  {t("booking.largeBags", "large bags")}
                </span>
              )}
            </div>
            )}

            {!childrenTransport && largerVehicleRecommended && (
              <div className="p-4 bg-drivo-amber-light border border-amber-300 rounded-2xl animate-fade-in">
                <p className="text-[13px] font-semibold text-amber-800">
                  {t("booking.largerVehicleRecommended", "Larger vehicle recommended")}
                </p>
                <p className="text-[12px] text-amber-700 mt-1">
                  {t("booking.capacityNotice", "We will match the ride with a suitable 7-seater or WAV vehicle when needed.")}
                </p>
              </div>
            )}

            <div className="hidden">
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

            {!childrenTransport && (
            <LuggageWarning
              passengers={capacityPassengerCount}
              luggage={luggage}
              onSwitchService={() => {
                setServiceType("airport");
                setPassengers(Math.min(5, passengers));
              }}
            />
            )}

            <div className="hidden p-4 bg-drivo-purple-light/50 rounded-2xl">
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
                    disabled={serviceType !== "accessible"}
onChange={(e) => {
  if (serviceType === "accessible") {
    setWheelchair(e.target.checked);
  }
}}
                    className="sr-only peer"
                  />
                  <div className="w-12 h-7 bg-drivo-border rounded-full peer peer-checked:bg-drivo-green peer-disabled:opacity-40 peer-disabled:cursor-not-allowed peer-checked:after:translate-x-5 after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:bg-white after:rounded-full after:h-[22px] after:w-[22px] after:shadow-sm after:transition-all" />
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

        {assistedTransport && (
        <div className="card">
          <div className="flex items-center gap-3 mb-5">
            <span className="w-9 h-9 bg-drivo-green-light rounded-xl flex items-center justify-center text-[14px] font-bold text-drivo-green-dark">
              4
            </span>
            <div>
              <h3 className="font-bold text-drivo-text text-[16px]">
                {t("booking.assistanceRequirements", "Assistance Requirements")}
              </h3>
              <p className="text-[12px] text-drivo-text-muted">
                {t("booking.assistanceRequirementsDesc", "Tell us what the driver should prepare for.")}
              </p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            {[
              ["seniorPassenger", seniorPassenger, setSeniorPassenger, "booking.seniorPassenger"],
              ["ztpCardHolder", ztpCardHolder, setZtpCardHolder, "booking.ztpCardHolder"],
              ["wheelchairUser", wheelchairUser, (value: boolean) => {
                setWheelchairUser(value);
                setWheelchair(value);
                if (value) setServiceType("accessible");
              }, "booking.wheelchairUser"],
              ["companionRequired", companionRequired, setCompanionRequired, "booking.companionRequired"],
              ["medicalAppointment", medicalAppointment, setMedicalAppointment, "booking.medicalAppointment"],
              ["waitingTimeRequired", waitingTimeRequired, setWaitingTimeRequired, "booking.waitingTimeRequired"],
            ].map(([key, checked, onChange, labelKey]) => (
              <label
                key={key as string}
                className={`flex items-center gap-3 rounded-2xl border p-4 text-[13px] font-semibold transition ${
                  checked
                    ? "border-drivo-green bg-drivo-green-light text-drivo-green-dark"
                    : "border-drivo-border bg-white text-drivo-text hover:border-drivo-green/30"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked as boolean}
                  onChange={(e) => (onChange as (value: boolean) => void)(e.target.checked)}
                  className="h-4 w-4 rounded border-drivo-border text-drivo-green focus:ring-drivo-green"
                />
                {t(labelKey as string)}
              </label>
            ))}
          </div>

          {seniorPassenger && (
            <div className="mt-5 animate-fade-in">
              <FieldLabel>{t("booking.assistanceLevel", "Assistance Level")} *</FieldLabel>
              <select
                value={assistanceLevel}
                onChange={(e) => setAssistanceLevel(e.target.value as AssistanceLevel)}
                className="input"
              >
                <option value="">{t("booking.selectOption", "Select option")}</option>
                <option value="LIGHT">{t("booking.assistanceLight", "Light Assistance")}</option>
                <option value="DOOR_TO_DOOR">{t("booking.assistanceDoorToDoor", "Door-to-door Assistance")}</option>
                <option value="BOARDING_HELP">{t("booking.assistanceBoarding", "Needs Help Boarding/Exiting")}</option>
              </select>
            </div>
          )}

          {ztpCardHolder && (
            <div className="mt-5 rounded-2xl border border-drivo-purple/20 bg-drivo-purple-light/40 p-4 text-[13px] font-semibold text-drivo-purple">
              {t("booking.ztpStoredYes", "ZTP Card Holder: Yes")}
            </div>
          )}

          {wheelchairUser && (
            <div className="mt-5 grid gap-4 sm:grid-cols-2 animate-fade-in">
              <div>
                <FieldLabel>{t("booking.wheelchairType", "Wheelchair Type")} *</FieldLabel>
                <select
                  value={wheelchairType}
                  onChange={(e) => setWheelchairType(e.target.value as WheelchairType)}
                  className="input"
                >
                  <option value="">{t("booking.selectOption", "Select option")}</option>
                  <option value="MANUAL">{t("booking.wheelchairManual", "Manual")}</option>
                  <option value="ELECTRIC">{t("booking.wheelchairElectric", "Electric")}</option>
                  <option value="FOLDABLE">{t("booking.wheelchairFoldable", "Foldable")}</option>
                </select>
              </div>
              <div>
                <FieldLabel>{t("booking.canTransferToSeat", "Can passenger transfer to vehicle seat?")} *</FieldLabel>
                <select
                  value={canTransferToSeat}
                  onChange={(e) => setCanTransferToSeat(e.target.value as TransferToSeat)}
                  className="input"
                >
                  <option value="">{t("booking.selectOption", "Select option")}</option>
                  <option value="YES">{t("common.yes")}</option>
                  <option value="NO">{t("common.no")}</option>
                </select>
              </div>
              {wavRequired && (
                <div className="sm:col-span-2 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-[13px] text-blue-800">
                  <strong>{t("booking.wavRequired", "WAV required")}.</strong>{" "}
                  {t("booking.passengerRemainsWheelchair", "Passenger remains in wheelchair. Vehicle must support wheelchair entry.")}
                </div>
              )}
            </div>
          )}

          {companionRequired && (
            <div className="mt-5 animate-fade-in">
              <FieldLabel>{t("booking.numberOfCompanions", "Number of Companions")}</FieldLabel>
              <select
                value={companionCount}
                onChange={(e) => setCompanionCount(Number(e.target.value))}
                className="input"
              >
                {[1, 2, 3].map((count) => (
                  <option key={count} value={count}>{count}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        )}

        {showMedicalReturnDetails && (
        <div className="card">
          <div className="flex items-center gap-3 mb-5">
            <span className="w-9 h-9 bg-drivo-green-light rounded-xl flex items-center justify-center text-[14px] font-bold text-drivo-green-dark">
              5
            </span>
            <div>
              <h3 className="font-bold text-drivo-text text-[16px]">
                {t("booking.medicalReturnDetails", "Medical / Return Trip Details")}
              </h3>
              <p className="text-[12px] text-drivo-text-muted">
                {t("booking.medicalReturnDetailsDesc", "Appointment, waiting and return planning")}
              </p>
            </div>
          </div>

          {medicalAppointment && (
            <div className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <input className="input" value={hospitalName} onChange={(e) => setHospitalName(e.target.value)} placeholder={`${t("booking.hospitalName", "Hospital / Clinic Name")} *`} />
                <input className="input" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder={`${t("booking.department", "Department")} *`} />
                <input className="input" type="date" value={appointmentDate} onChange={(e) => setAppointmentDate(e.target.value)} min={today} />
                <input className="input" type="time" value={appointmentTime} onChange={(e) => setAppointmentTime(e.target.value)} />
              </div>

              <div>
                <FieldLabel>{t("booking.tripType", "Trip Type")}</FieldLabel>
                <select value={tripType} onChange={(e) => setTripType(e.target.value as MedicalTripType)} className="input">
                  <option value="GO_ONLY">{t("booking.goOnly", "Go Only")}</option>
                  <option value="GO_RETURN">{t("booking.goReturn", "Go + Return")}</option>
                  <option value="WAIT_RETURN">{t("booking.waitReturn", "Driver Wait & Return")}</option>
                </select>
              </div>

              {(tripType === "GO_RETURN" || tripType === "WAIT_RETURN") && (
                <div className="grid sm:grid-cols-2 gap-4">
                  <input className="input" type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} min={appointmentDate || today} />
                  <input className="input" type="time" value={returnTime} onChange={(e) => setReturnTime(e.target.value)} />
                </div>
              )}
            </div>
          )}

          {showWaitingDuration && (
            <div className="mt-5 animate-fade-in">
              <FieldLabel>{t("booking.waitingDuration", "Waiting Duration")} *</FieldLabel>
              <select value={waitingDuration} onChange={(e) => setWaitingDuration(e.target.value as WaitingDuration)} className="input">
                <option value="">{t("booking.selectOption", "Select option")}</option>
                <option value="30_MINUTES">{t("booking.wait30", "30 Minutes")}</option>
                <option value="1_HOUR">{t("booking.wait1h", "1 Hour")}</option>
                <option value="2_HOURS">{t("booking.wait2h", "2 Hours")}</option>
                <option value="3_HOURS">{t("booking.wait3h", "3 Hours")}</option>
                <option value="4_HOURS">{t("booking.wait4h", "4 Hours")}</option>
                <option value="CUSTOM">{t("booking.waitCustom", "Custom")}</option>
              </select>
              {waitingDuration === "CUSTOM" && (
                <input
                  className="input mt-3"
                  value={customWaitingDuration}
                  onChange={(e) => setCustomWaitingDuration(e.target.value)}
                  placeholder={t("booking.customWaitingDuration", "Custom waiting duration")}
                />
              )}
            </div>
          )}
        </div>
        )}

        {childrenTransport && (
          <div className="card animate-fade-in">
            <div className="flex items-center gap-3 mb-5">
              <span className="w-9 h-9 bg-pink-100 rounded-xl flex items-center justify-center text-[14px]">
                👧
              </span>
              <div>
                <h3 className="font-bold text-drivo-text text-[16px]">
                  {t("booking.childrenTransportDetails", "Children Transport Details")}
                </h3>
                <p className="text-[12px] text-drivo-text-muted">
                  {t("booking.childrenTransportDesc", "Scheduled educational rides only. Cash is not available.")}
                </p>
              </div>
            </div>
            <div className="space-y-4">
              <div className="space-y-3 rounded-2xl border border-drivo-border-light bg-drivo-bg-soft/60 p-4">
                <h4 className="text-[13px] font-bold text-drivo-text">
                  {t("booking.schoolDropoff", "School Drop-off")}
                </h4>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <FieldLabel>{t("booking.pickupDate", "Pickup Date")} *</FieldLabel>
                    <input
                      className="input"
                      type="date"
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                      min={today}
                      placeholder={t("booking.selectPickupDate", "Select pickup date")}
                      title={t("booking.selectPickupDate", "Select pickup date")}
                    />
                  </div>
                  <div>
                    <FieldLabel>{t("booking.pickupTime", "Pickup Time")} *</FieldLabel>
                    <input
                      className="input"
                      type="time"
                      value={scheduledTime}
                      onChange={(e) => setScheduledTime(e.target.value)}
                      placeholder={t("booking.selectPickupTime", "Select pickup time")}
                      title={t("booking.selectPickupTime", "Select pickup time")}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-3 rounded-2xl border border-drivo-border-light bg-drivo-bg-soft/60 p-4">
                <h4 className="text-[13px] font-bold text-drivo-text">
                  {t("booking.schoolReturn", "School Pick-up / Return")}
                </h4>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <FieldLabel>{t("booking.returnDate", "Return Date")} *</FieldLabel>
                    <input
                      className="input"
                      type="date"
                      value={returnDate}
                      onChange={(e) => setReturnDate(e.target.value)}
                      min={scheduledDate || today}
                      placeholder={t("booking.selectReturnDate", "Select return date")}
                      title={t("booking.selectReturnDate", "Select return date")}
                    />
                  </div>
                  <div>
                    <FieldLabel>{t("booking.returnTime", "Return Time")} *</FieldLabel>
                    <input
                      className="input"
                      type="time"
                      value={returnTime}
                      onChange={(e) => setReturnTime(e.target.value)}
                      placeholder={t("booking.selectReturnTime", "Select return time")}
                      title={t("booking.selectReturnTime", "Select return time")}
                    />
                  </div>
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <FieldLabel>{t("booking.recurrenceType", "Recurrence")}</FieldLabel>
                  <select value={recurrence} onChange={(e) => setRecurrence(e.target.value as RecurrenceType)} className="input">
                    <option value="ONE_TIME">{t("booking.recurrenceOneTime", "One Time")}</option>
                    <option value="DAILY">{t("booking.recurrenceDaily", "Daily")}</option>
                    <option value="WEEKLY">{t("booking.recurrenceWeekly", "Weekly")}</option>
                    <option value="MONTHLY">{t("booking.recurrenceMonthly", "Monthly")}</option>
                    <option value="CUSTOM">{t("booking.waitCustom", "Custom")}</option>
                  </select>
                </div>
                {recurrence === "CUSTOM" && (
                  <div>
                    <FieldLabel>{t("booking.recurrenceCustom", "Custom recurrence")}</FieldLabel>
                    <input className="input" value={recurrenceCustom} onChange={(e) => setRecurrenceCustom(e.target.value)} placeholder={t("booking.recurrenceCustom", "Custom recurrence")} />
                  </div>
                )}
              </div>
              {pickupAddress && dropoffAddress && scheduledDate && scheduledTime && recurrence && (
                <PriceEstimate
                  pickupAddress={pickupAddress}
                  dropoffAddress={dropoffAddress}
                  serviceType={serviceType}
                  passengerCount={passengers}
                  returnDate={returnDate}
                  returnTime={returnTime}
                  recurrenceType={recurrence}
                  recurrenceCustom={recurrenceCustom}
                  scheduledDate={estimateScheduledDate}
                  scheduledTime={estimateScheduledTime}
                  waitAndGreet={waitAndGreet}
                  waitingMinutes={estimateWaitingMinutes}
                  onPriceChange={setEstimatedPrice}
                  onFareChange={handleFareChange}
                />
              )}
              <div className="space-y-3">
                <h4 className="text-[13px] font-bold text-drivo-text">
                  {t("booking.childDetails", "Children Details")}
                </h4>
                {activeChildrenDetails.map((child, index) => (
                  <div
                    key={index}
                    className="space-y-3 rounded-2xl border border-drivo-border-light bg-white p-4"
                  >
                    <div className="text-[12px] font-black uppercase tracking-wide text-drivo-text-secondary">
                      Child {index + 1}
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <input
                        className="input"
                        value={child.fullName}
                        onChange={(e) => updateChildDetail(index, { fullName: e.target.value })}
                        placeholder={`${t("booking.childFullName", "Child Full Name")} *`}
                      />
                      <input
                        className="input"
                        type="number"
                        min="0"
                        max="18"
                        value={child.age}
                        onChange={(e) => updateChildDetail(index, { age: e.target.value })}
                        placeholder={`${t("booking.childAge", "Child Age")} *`}
                      />
                    </div>
                    <textarea
                      className="input resize-none"
                      rows={2}
                      value={child.specialRequirements}
                      onChange={(e) => updateChildDetail(index, { specialRequirements: e.target.value })}
                      placeholder={t("booking.childSpecialRequirements", "Special Requirements")}
                    />
                  </div>
                ))}
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <input className="input" value={parentFullName} onChange={(e) => setParentFullName(e.target.value)} placeholder={`${t("booking.parentFullName", "Parent Full Name")} *`} />
                <input className="input" value={parentPrimaryPhone} onChange={(e) => setParentPrimaryPhone(e.target.value)} placeholder={`${t("booking.parentPrimaryPhone", "Primary Phone")} *`} />
                <input className="input" value={parentEmergencyPhone} onChange={(e) => setParentEmergencyPhone(e.target.value)} placeholder={`${t("booking.parentEmergencyPhone", "Emergency Phone")} *`} />
                <input className="input" type="email" value={parentEmail} onChange={(e) => setParentEmail(e.target.value)} placeholder={`${t("booking.parentEmail", "Email")} *`} />
              </div>
            </div>
          </div>
        )}

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
              {contactStepNumber}
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
                required
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
                <option>+92</option>
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

            {passengerProfile ? (
              <div className="rounded-2xl border border-drivo-green/20 bg-drivo-green-light/40 p-4 text-[13px]">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="font-semibold text-drivo-text">
                    {t("passenger.loggedInAs", "Logged in as")}{" "}
                    {String(passengerProfile.phone || passengerProfile.normalizedPhone || phoneCode + customerPhone)}
                  </p>
                  <button
                    type="button"
                    className="text-left text-[13px] font-bold text-drivo-green hover:underline"
                    onClick={async () => {
                      await fetch("/api/passenger/logout", { method: "POST", credentials: "include" }).catch(() => null);
                      setPassengerProfile(null);
                      setLoginPassword("");
                      setAuthError("");
                      setError((current) => (isAuthenticationRequiredMessage(current) ? "" : current));
                      setAuthMode("idle");
                    }}
                  >
                    {t("passenger.useAnotherAccount", "Use another account")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-drivo-border-light bg-drivo-bg-soft/60 p-4">
                <div className="mb-4 flex flex-col gap-1">
                  <p className="text-[13px] font-semibold text-drivo-text">
                    {authMode === "existingAccountLogin"
                      ? t("passenger.loginToContinueTitle", "Log in to continue")
                      : authMode === "forgotPasswordOtp" || authMode === "resetPassword"
                        ? t("passenger.resetPasswordTitle", "Reset your password")
                        : authMode === "legacyPasswordSetupOtp" || authMode === "legacyPasswordSetup"
                          ? t("passenger.createPasswordTitle", "Create a password to continue")
                          : t("passenger.firstTimePrompt", "First time with Drivo? Verify phone and create account.")}
                  </p>
                  {(authMode === "existingAccountLogin" || authMode === "forgotPasswordOtp" || authMode === "resetPassword") && (
                    <p className="text-[12px] text-drivo-text-secondary">
                      {t("passenger.existingAccountMessage", "This phone already has a Drivo account.")}
                    </p>
                  )}
                </div>

                {authMode === "checkingPhone" && (
                  <p className="text-[13px] font-semibold text-drivo-text-secondary">
                    {t("passenger.checkingPhone", "Checking phone number...")}
                  </p>
                )}

                {authMode === "existingAccountLogin" && (
                  <div className="space-y-3">
                    <div>
                      <FieldLabel>{t("booking.phone")}</FieldLabel>
                      <input className="input bg-drivo-bg-soft" value={registrationProofPhone || phoneCode + customerPhone} readOnly />
                    </div>
                    <PasswordInput
                      label={t("passenger.password")}
                      value={loginPassword}
                      onChange={setLoginPassword}
                      visible={showLoginPassword}
                      onToggle={() => setShowLoginPassword((current) => !current)}
                    />
                    {authError && (
                      <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-[13px] font-semibold text-red-700">
                        {authError}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={(e) => handlePassengerLogin(e)}
                      className="btn-primary w-full"
                      disabled={authLoading}
                    >
                      {authLoading ? t("passenger.loading") : t("passenger.loginContinue", "Login & Continue")}
                    </button>
                    <div className="flex flex-wrap gap-4">
                      <button
                        type="button"
                        className="text-[13px] font-bold text-drivo-green hover:underline"
                        onClick={() => {
                          setAuthError("");
                          clearPasswordResetState();
                          setAuthMode("forgotPasswordOtp");
                        }}
                      >
                        {t("passenger.forgotPassword", "Forgot password?")}
                      </button>
                      <button
                        type="button"
                        className="text-[13px] font-bold text-drivo-green hover:underline"
                        onClick={() => {
                          setAuthError("");
                          setError((current) => (isAuthenticationRequiredMessage(current) ? "" : current));
                          setLoginPassword("");
                          clearRegistrationProof();
                          clearPasswordResetState();
                          setBookingId("");
                          setAuthMode("idle");
                        }}
                      >
                        {t("passenger.useAnotherPhone", "Use another phone")}
                      </button>
                    </div>
                  </div>
                )}

                {authMode === "loginStepUp" && (
                  <div className="space-y-3">
                    <input
                      className="input"
                      inputMode="numeric"
                      maxLength={6}
                      value={loginOtp}
                      onChange={(e) => setLoginOtp(e.target.value)}
                      placeholder={t("passenger.otpCode")}
                      required
                    />
                    <label className="flex items-center gap-2 text-[13px] font-semibold text-drivo-text-secondary">
                      <input
                        type="checkbox"
                        checked={rememberDevice}
                        onChange={(e) => setRememberDevice(e.target.checked)}
                      />
                      {t("passenger.rememberDevice", "Remember this device")}
                    </label>
                    {authError && (
                      <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-[13px] font-semibold text-red-700">
                        {authError}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={(e) => handleLoginStepUp(e)}
                      className="btn-primary w-full"
                      disabled={authLoading}
                    >
                      {authLoading ? t("otp.verifying", "Verifying...") : t("passenger.verifyOtp")}
                    </button>
                  </div>
                )}

                {authMode === "forgotPasswordOtp" && (
                  <div className="space-y-3">
                    {!resetAttemptId && (
                      <button
                        type="button"
                        onClick={(e) => handleForgotSend(e)}
                        className="btn-primary w-full"
                        disabled={authLoading}
                      >
                        {authLoading ? t("passenger.loading") : t("passenger.sendResetCode", "Send reset code")}
                      </button>
                    )}
                    {resetAttemptId && !passwordResetProofToken && (
                      <div className="space-y-3">
                        <input
                          className="input"
                          inputMode="numeric"
                          maxLength={6}
                          value={resetOtp}
                          onChange={(e) => setResetOtp(e.target.value)}
                          placeholder={t("passenger.otpCode")}
                          required
                        />
                        <button
                          type="button"
                          onClick={(e) => handleForgotVerify(e)}
                          className="btn-primary w-full"
                          disabled={authLoading}
                        >
                          {authLoading ? t("otp.verifying", "Verifying...") : t("passenger.verifyOtp")}
                        </button>
                      </div>
                    )}
                    {authError && (
                      <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-[13px] font-semibold text-red-700">
                        {authError}
                      </div>
                    )}
                    <button
                      type="button"
                      className="text-[13px] font-bold text-drivo-green hover:underline"
                      onClick={() => {
                        setAuthError("");
                        clearPasswordResetState();
                        setAuthMode("existingAccountLogin");
                      }}
                    >
                      {t("passenger.backToLogin", "Back to login")}
                    </button>
                  </div>
                )}

                {authMode === "resetPassword" && passwordResetProofToken && (
                  <div className="space-y-3">
                    <PasswordInput
                      label={t("passenger.newPassword")}
                      value={resetPassword}
                      onChange={setResetPassword}
                      visible={showResetPassword}
                      onToggle={() => setShowResetPassword((current) => !current)}
                    />
                    <PasswordInput
                      label={t("passenger.confirmPassword", "Confirm password")}
                      value={resetConfirmPassword}
                      onChange={setResetConfirmPassword}
                      visible={showResetPassword}
                      onToggle={() => setShowResetPassword((current) => !current)}
                    />
                    {authError && (
                      <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-[13px] font-semibold text-red-700">
                        {authError}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={(e) => handleResetComplete(e)}
                      className="btn-primary w-full"
                      disabled={authLoading}
                    >
                      {authLoading ? t("passenger.saving") : t("passenger.resetContinue", "Reset Password & Continue")}
                    </button>
                  </div>
                )}
              </div>
            )}

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
                ].filter(([v]) => !(childrenTransport && v === "cash")).map(([v, icon, label, sub, tag]) => (
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
            disabled={
              loading ||
              (paymentMethod === "cash" && !cashAgreed) ||
              (!["idle", "authenticated"].includes(authMode) && Boolean(bookingId))
            }
          >
            {loading
              ? t("booking.creating")
              : !["idle", "authenticated"].includes(authMode) && bookingId
                ? t("passenger.completeAuthAbove", "Complete authentication above")
                : t("booking.continue")}
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

function PasswordInput({
  label,
  value,
  onChange,
  visible,
  onToggle,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  onToggle: () => void;
}) {
  return (
    <div>
      <label className="text-[12px] font-semibold text-drivo-text-secondary mb-1.5 block">
        {label}
      </label>
      <div className="relative">
        <input
          className="input pr-20"
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="new-password"
          required
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-bold text-drivo-green"
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
    </div>
  );
}
